import { Duck, initDuckDB } from '$lib/features/duckdb';
import type { DataAnalysisResult } from '$lib/features/commons/utils/deep-validator.utils';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeometryCollection
} from 'geojson';
import { ParserError, type IParser } from '../contracts/parser';
import type { ITypeInferrer } from '../contracts/type-inferrer';
import type { IValidator } from '../contracts/validator';
import {
  createParserList,
  findParser,
  type ParserList
} from '../adapters/parsers';
import {
  createValidatorList,
  runValidators,
  type ValidatorList
} from '../adapters/validators';
import { HeuristicTypeInferrer } from '../adapters/type-inference/heuristic-inferrer';
import type { DatasetResult, EnrichedColumn } from '../models/dataset-result';
import type { InferredColumn } from '../models/inferred-column';
import type { RawDataset } from '../models/raw-dataset';
import { fromDuckDBType } from '../models/column-type';
import type { ValidationResult } from '../models/validation-result';
import { convertGeoJSONToRawDataset } from '../adapters/parsers/geojson.parser';

type UploadedFilePayload = {
  id: string;
  name: string;
  size: number;
  type: string;
  content?: string | ArrayBuffer;
  parsedData?: unknown;
  fileType?: string;
  deepAnalysis?: DataAnalysisResult;
  preparedGeoJSON?: string;
};

type LegacyDatasetFormat = {
  data?: unknown[];
  columns?: EnrichedColumn[];
  analysis?: {
    columns?: EnrichedColumn[];
    geoColumns?: unknown[];
    hasGeoData?: boolean;
    rowCount?: number;
    warnings?: string[];
  };
  [key: string]: unknown;
};

type GeoJSONLike =
  | FeatureCollection
  | Feature
  | GeometryCollection
  | Geometry
  | Feature[];

type FileInfo = Pick<File, 'name' | 'size' | 'type'>;

const GEOMETRY_TYPES: Geometry['type'][] = [
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon'
];

export type DataPipelineOptions = {
  parsers?: ParserList;
  validators?: ValidatorList;
  typeInferrer?: ITypeInferrer;
  stopOnFirstValidationError?: boolean;
};

export type DataPipeline = {
  initialize(): Promise<void>;
  processFile(file: File): Promise<DatasetResult>;
  processUploadedFile(
    uploadedFile: UploadedFilePayload,
    originalFile?: File
  ): Promise<DatasetResult>;
  validateFile(file: File): Promise<ValidationResult>;
  destroy(): Promise<void>;
  getParsers(): IParser[];
  getValidators(): IValidator[];
};

/**
 * Builds the default data pipeline by wiring parsers, validators, the type inferrer
 * and the DuckDB backend. Consumers can pass custom lists (useful for unit tests or
 * extensions) but the default factory mirrors the legacy khartis-pipeline-old flow:
 * parse → validate → infer types → persist/analyse in DuckDB → return a DatasetResult.
 */
export function createDataPipeline(
  options: DataPipelineOptions = {}
): DataPipeline {
  const parsers = createParserList(options.parsers);
  const validators = createValidatorList(options.validators);
  const typeInferrer = options.typeInferrer ?? new HeuristicTypeInferrer();
  const stopOnFirstValidationError =
    options.stopOnFirstValidationError ?? false;

  let initialized = false;

  async function initialize(): Promise<void> {
    if (initialized) {
      return;
    }
    await initDuckDB();
    initialized = true;
  }

  async function processUploadedFile(
    uploadedFile: UploadedFilePayload,
    originalFile?: File
  ): Promise<DatasetResult> {
    await initialize();
    const endTiming = logger.startTiming(
      `processUploadedFile:${uploadedFile.name}`,
      LogCategory.DATA
    );
    const overallStart = performance.now();

    logger.info('Processing uploaded file', LogCategory.DATA, {
      fileName: uploadedFile.name,
      hasOriginalFile: !!originalFile,
      uploadedFileSize: uploadedFile.size,
      contentType: typeof uploadedFile.content,
      hasParsedData: !!uploadedFile.parsedData,
      fileType: uploadedFile.fileType
    });

    if (uploadedFile.parsedData && uploadedFile.fileType === 'shapefile') {
      const dataset = await processShapefilePayload(
        uploadedFile,
        processRawDataset
      );
      applyGeoDetection(dataset, uploadedFile.deepAnalysis?.geoDetection);
      return dataset;
    }

    if (originalFile) {
      logger.debug('Using original File object', LogCategory.FILE, {
        fileName: originalFile.name
      });
      const dataset = await processFile(originalFile);
      dataset.sourceFileId = uploadedFile.id;
      applyGeoDetection(dataset, uploadedFile.deepAnalysis?.geoDetection);
      return dataset;
    }

    if (typeof uploadedFile.content === 'string') {
      const legacyResult = tryConvertLegacyPayload(
        uploadedFile as UploadedFilePayload & { content: string }
      );
      if (legacyResult?.kind === 'dataset') {
        applyGeoDetection(
          legacyResult.dataset,
          uploadedFile.deepAnalysis?.geoDetection
        );
        return legacyResult.dataset;
      }

      if (legacyResult?.kind === 'file') {
        const dataset = await processFile(legacyResult.file);
        dataset.sourceFileId = uploadedFile.id;
        applyGeoDetection(dataset, uploadedFile.deepAnalysis?.geoDetection);
        return dataset;
      }
    }

    const fallbackFile = await createFileFromUpload(uploadedFile);
    const dataset = await processFile(fallbackFile);
    dataset.sourceFileId = uploadedFile.id;
    applyGeoDetection(dataset, uploadedFile.deepAnalysis?.geoDetection);
    logger.success('Uploaded file processed', LogCategory.DATA, {
      fileName: uploadedFile.name,
      durationMs: (performance.now() - overallStart).toFixed(2)
    });
    endTiming();
    return dataset;
  }

  async function processFile(file: File): Promise<DatasetResult> {
    await initialize();

    const endTiming = logger.startTiming(
      `Process file: ${file.name}`,
      LogCategory.DATA
    );
    const startTime = performance.now();

    logger.info('Starting file processing', LogCategory.DATA, {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });

    try {
      const parser = findParser(file, parsers);
      if (!parser) {
        logger.error('No parser found for file', LogCategory.DATA, {
          fileName: file.name,
          fileType: file.type
        });
        throw new ParserError(
          `No parser found for file: ${file.name}`,
          undefined,
          file.type
        );
      }

      logger.debug('Parser selected', LogCategory.DATA, {
        fileName: file.name,
        parser: parser.constructor.name
      });

      const parseStart = performance.now();
      const rawDataset = await parser.parse(file);
      const parseDuration = performance.now() - parseStart;

      logger.success('File parsed successfully', LogCategory.FILE, {
        fileName: file.name,
        rowCount: rawDataset.rows.length,
        columnCount: rawDataset.headers.length,
        duration: `${parseDuration.toFixed(2)}ms`
      });

      if (parseDuration > 2000) {
        logger.warn('Slow file parsing detected', LogCategory.FILE, {
          fileName: file.name,
          duration: `${parseDuration.toFixed(2)}ms`,
          rowCount: rawDataset.rows.length
        });
      }

      const dataset = await processRawDataset({
        rawDataset,
        fileInfo: file,
        duckSourceFile: file,
        startTime
      });

      endTiming();

      return dataset;
    } catch (error) {
      logger.error('File processing failed', LogCategory.DATA, {
        fileName: file.name,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  async function processRawDataset({
    rawDataset,
    fileInfo,
    duckSourceFile,
    geoFileForDuck,
    startTime,
    forceDuckProcessing = false
  }: {
    rawDataset: RawDataset;
    fileInfo: FileInfo;
    duckSourceFile?: File;
    geoFileForDuck?: File;
    startTime: number;
    forceDuckProcessing?: boolean;
  }): Promise<DatasetResult> {
    const processedDataset = stripGeometryColumn(rawDataset);
    const shouldSkipDuck = !forceDuckProcessing && !!rawDataset.geometry;
    const stageStart = performance.now();

    logger.debug('DuckDB ingestion decision', LogCategory.DUCKDB, {
      fileName: fileInfo.name,
      hasGeometryColumn: !!rawDataset.geometry,
      forceDuckProcessing,
      geoFileProvided: !!geoFileForDuck,
      shouldSkipDuck
    });

    const validationResult = runValidators(
      rawDataset,
      validators,
      stopOnFirstValidationError
    );

    if (!validationResult.isValid) {
      logger.error('Validation failed', LogCategory.DATA, {
        fileName: fileInfo.name,
        errors: validationResult.errors
      });
      throw new Error(
        `Validation failed: ${validationResult.errors.join(', ')}`
      );
    }

    logger.debug('Validation passed', LogCategory.DATA, {
      fileName: fileInfo.name,
      warningCount: validationResult.warnings.length
    });

    const inferStart = performance.now();
    const inferredColumns = typeInferrer.inferColumnTypes(
      processedDataset.columns
    );
    const inferDuration = performance.now() - inferStart;

    logger.debug('Type inference complete', LogCategory.DATA, {
      fileName: fileInfo.name,
      types: inferredColumns.map((c) => ({ name: c.name, type: c.type })),
      duration: `${inferDuration.toFixed(2)}ms`
    });

    if (!Duck) {
      logger.error('DuckDB not initialized', LogCategory.DUCKDB);
      throw new Error('DuckDB not initialized');
    }

    let tableName = '';
    let duckdbColumns: DuckAnalyticsColumn[];
    let rowCount: number;
    let duckDuration = 0;

    if (!shouldSkipDuck) {
      tableName = generateTableName(fileInfo.name);
      const fileForDuckDB = geoFileForDuck
        ? geoFileForDuck
        : await prepareFileForDuckDB(
            duckSourceFile,
            processedDataset,
            tableName
          );

      logger.info('Creating DuckDB table', LogCategory.DUCKDB, {
        tableName,
        fileSize: fileForDuckDB.size,
        estimatedRows: processedDataset.rows.length,
        mode: geoFileForDuck ? 'geospatial' : 'tabular'
      });

      const duckStart = performance.now();

      await Duck.register_files([fileForDuckDB]);
      if (geoFileForDuck) {
        const resultTableName = await Duck.read_geofile(fileForDuckDB, {
          tablename: tableName
        });
        if (typeof resultTableName === 'string' && resultTableName.length > 0) {
          tableName = resultTableName;
        }
      } else {
        await Duck.read_tabular(fileForDuckDB, { tablename: tableName });
      }
      duckDuration = performance.now() - duckStart;

      duckdbColumns = await Duck.analyse(tableName);
      rowCount = await Duck.get_row_count(tableName);

      logger.success('DuckDB table created', LogCategory.DUCKDB, {
        tableName,
        rowCount,
        duration: `${duckDuration.toFixed(2)}ms`
      });
    } else {
      duckdbColumns = buildAnalyticsFromRawDataset(processedDataset);
      rowCount = processedDataset.rows.length;
    }

    if (!shouldSkipDuck && duckDuration > 3000) {
      logger.warn('Slow DuckDB table creation', LogCategory.DUCKDB, {
        tableName,
        duration: `${duckDuration.toFixed(2)}ms`,
        rowCount
      });
    }

    const enrichedColumns = mergeAnalytics(inferredColumns, duckdbColumns);
    const processingDuration = performance.now() - startTime;
    const dataset = buildDatasetResult({
      file: fileInfo,
      tableName,
      rawDataset: processedDataset,
      enrichedColumns,
      rowCount,
      validationResult,
      processingDuration,
      geoTableReady: !!geoFileForDuck
    });

    logger.success('File processing complete', LogCategory.DATA, {
      fileName: fileInfo.name,
      tableName,
      rowCount,
      columnCount: enrichedColumns.length,
      totalDuration: `${processingDuration.toFixed(2)}ms`
    });
    logger.debug('processRawDataset summary', LogCategory.DATA, {
      fileName: fileInfo.name,
      shouldSkipDuck,
      duckDurationMs: duckDuration.toFixed(2),
      overallDurationMs: (performance.now() - stageStart).toFixed(2)
    });

    return dataset;
  }

  async function validateFile(file: File): Promise<ValidationResult> {
    await initialize();

    const parser = findParser(file, parsers);
    if (!parser) {
      return {
        isValid: false,
        errors: [`No parser found for file: ${file.name}`],
        warnings: []
      };
    }

    try {
      const rawDataset = await parser.parse(file);
      return runValidators(rawDataset, validators, stopOnFirstValidationError);
    } catch (error) {
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: []
      };
    }
  }

  async function destroy(): Promise<void> {
    initialized = false;
  }

  return {
    initialize,
    processFile,
    processUploadedFile,
    validateFile,
    destroy,
    getParsers: () => [...parsers],
    getValidators: () => [...validators]
  };
}

export const dataPipeline = createDataPipeline();

type RawDatasetProcessor = (payload: {
  rawDataset: RawDataset;
  fileInfo: FileInfo;
  startTime: number;
  duckSourceFile?: File;
  geoFileForDuck?: File;
  forceDuckProcessing?: boolean;
}) => Promise<DatasetResult>;

async function processShapefilePayload(
  uploadedFile: UploadedFilePayload,
  processRawDatasetFn: RawDatasetProcessor
): Promise<DatasetResult> {
  logger.info('Shapefile already parsed, converting', LogCategory.FILE, {
    fileName: uploadedFile.name
  });

  const parsedGeojson =
    typeof uploadedFile.parsedData === 'string'
      ? JSON.parse(uploadedFile.parsedData)
      : uploadedFile.parsedData;

  const structureInfo = describeGeojsonStructure(parsedGeojson);
  logger.debug('GeoJSON structure validated', LogCategory.DATA, structureInfo);

  const normalizedGeojson = normalizeGeojsonInput(parsedGeojson);
  logger.debug('GeoJSON normalized', LogCategory.DATA, {
    type: normalizedGeojson.type,
    featureCount: normalizedGeojson.features.length
  });

  const rawDataset = convertGeoJSONToRawDataset(normalizedGeojson);
  logger.debug('Converted GeoJSON to RawDataset', LogCategory.DATA, {
    fileName: uploadedFile.name,
    rowCount: rawDataset.rows.length,
    columnCount: rawDataset.headers.length
  });

  const geojsonString = JSON.stringify(normalizedGeojson);
  const geojsonFileName = uploadedFile.name.replace(/\.shp$/i, '.geojson');
  uploadedFile.preparedGeoJSON = geojsonString;

  logger.debug('Creating GeoJSON file for DuckDB', LogCategory.FILE, {
    originalName: uploadedFile.name,
    geojsonName: geojsonFileName
  });

  const geojsonFile = new File([geojsonString], geojsonFileName, {
    type: 'application/geo+json'
  });

  const pipelineStart = performance.now();
  const dataset = await processRawDatasetFn({
    rawDataset,
    fileInfo: {
      name: uploadedFile.name,
      size: uploadedFile.size ?? 0,
      type: uploadedFile.type || 'application/x-shapefile'
    },
    startTime: pipelineStart,
    forceDuckProcessing: true,
    geoFileForDuck: geojsonFile
  });
  dataset.sourceFileId = uploadedFile.id;
  dataset.name = uploadedFile.name;

  logger.success('Shapefile processed via GeoJSON parser', LogCategory.DATA, {
    fileName: uploadedFile.name,
    featureCount: normalizedGeojson.features.length
  });

  return dataset;
}

function tryConvertLegacyPayload(
  uploadedFile: UploadedFilePayload & { content: string }
):
  | { kind: 'dataset'; dataset: DatasetResult }
  | { kind: 'file'; file: File }
  | null {
  try {
    const parsedJson = JSON.parse(uploadedFile.content) as LegacyDatasetFormat;
    const keys = Object.keys(parsedJson as Record<string, unknown>);

    if (parsedJson.data && parsedJson.columns) {
      logger.warn('Legacy dataset format detected', LogCategory.DATA, {
        fileName: uploadedFile.name
      });

      const normalizedData = Array.isArray(parsedJson.data)
        ? parsedJson.data.map((row) => normalizeLegacyRow(row))
        : [];

      const dataset: DatasetResult = {
        id: uploadedFile.id,
        name: uploadedFile.name,
        sourceFileId: uploadedFile.id,
        tableName: `table_${uploadedFile.id.replace(/-/g, '_')}`,
        columns: parsedJson.columns || [],
        rowCount: normalizedData.length,
        metadata: {
          processedAt: new Date(),
          fileType: 'csv',
          parserUsed: 'Legacy',
          processingDuration: 0,
          transformations: []
        },
        format: 'csv',
        data: normalizedData,
        analysis: parsedJson.analysis || {
          columns: parsedJson.columns || [],
          geoColumns: [],
          hasGeoData: false,
          rowCount: normalizedData.length,
          warnings: []
        },
        createdAt: new Date(),
        fileSize: uploadedFile.size,
        originalData: {
          columns: parsedJson.columns || [],
          data: normalizedData,
          rowCount: normalizedData.length
        }
      } as DatasetResult;

      return { kind: 'dataset', dataset };
    }

    if (
      keys.length > 0 &&
      !Number.isNaN(Number(keys[0])) &&
      typeof parsedJson[keys[0] as keyof LegacyDatasetFormat] === 'object'
    ) {
      logger.warn(
        'Legacy numeric keys detected - converting',
        LogCategory.DATA,
        {
          fileName: uploadedFile.name,
          keyCount: keys.length
        }
      );

      const data = keys
        .map(Number)
        .sort((a, b) => a - b)
        .map((index) => parsedJson[String(index) as keyof LegacyDatasetFormat]);

      const columns =
        data.length > 0 && data[0] && typeof data[0] === 'object'
          ? Object.keys(data[0] as Record<string, unknown>)
          : [];

      const csvContent = [
        columns.join(','),
        ...data.map((row) =>
          columns
            .map((col) =>
              row && typeof row === 'object'
                ? JSON.stringify((row as Record<string, unknown>)[col] ?? '')
                : ''
            )
            .join(',')
        )
      ].join('\\n');

      const legacyFile = new File([csvContent], uploadedFile.name, {
        type: 'text/csv'
      });

      return { kind: 'file', file: legacyFile };
    }
  } catch (error) {
    logger.debug('Legacy content parsing failed', LogCategory.DATA, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  return null;
}

async function createFileFromUpload(
  uploadedFile: UploadedFilePayload
): Promise<File> {
  if (uploadedFile.content instanceof ArrayBuffer) {
    const blob = new Blob([uploadedFile.content], { type: uploadedFile.type });
    return new File([blob], uploadedFile.name, { type: uploadedFile.type });
  }

  if (typeof uploadedFile.content === 'string') {
    const blob = new Blob([uploadedFile.content], { type: uploadedFile.type });
    return new File([blob], uploadedFile.name, { type: uploadedFile.type });
  }

  throw new Error(
    'UploadedFile must have content property or originalFile must be provided'
  );
}

function normalizeLegacyRow(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== 'object') {
    return { value: row };
  }

  const flatRow: Record<string, unknown> = {};
  Object.entries(row as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      if (
        typeof value === 'object' &&
        !Array.isArray(value) &&
        !(value instanceof Date)
      ) {
        flatRow[key] = JSON.stringify(value);
      } else if (Array.isArray(value)) {
        flatRow[key] = value.join(', ');
      } else {
        flatRow[key] = value;
      }
    } else {
      flatRow[key] = value;
    }
  });
  return flatRow;
}

type DuckAnalyticsColumn = {
  name: string;
  type_simple?: string;
  count?: number | string;
  nulls?: number | string;
  uniques?: number | string;
  min?: unknown;
  max?: unknown;
  mean?: number | string;
  median?: number | string;
  stddev?: number | string;
};

function mergeAnalytics(
  inferredColumns: InferredColumn[],
  duckColumns: DuckAnalyticsColumn[]
): EnrichedColumn[] {
  return inferredColumns.map((col, index) => {
    const duckCol =
      duckColumns.find((dc) => dc.name === col.name) || duckColumns[index];

    return {
      ...col,
      stats: {
        name: col.name,
        type: fromDuckDBType(String(duckCol?.type_simple || col.type)),
        count: Number(duckCol?.count || 0),
        nulls: Number(duckCol?.nulls || 0),
        uniques: Number(duckCol?.uniques || 0),
        min: duckCol?.min,
        max: duckCol?.max,
        mean: duckCol?.mean ? Number(duckCol.mean) : undefined,
        median: duckCol?.median ? Number(duckCol.median) : undefined,
        stdDev: duckCol?.stddev ? Number(duckCol.stddev) : undefined
      }
    };
  });
}

function buildDatasetResult({
  file,
  tableName,
  rawDataset,
  enrichedColumns,
  rowCount,
  validationResult,
  processingDuration,
  geoTableReady = false
}: {
  file: FileInfo;
  tableName: string;
  rawDataset: RawDataset;
  enrichedColumns: EnrichedColumn[];
  rowCount: number;
  validationResult: ValidationResult;
  processingDuration: number;
  geoTableReady?: boolean;
}): DatasetResult {
  const data = rawDataset.rows.map((row) => {
    const record: Record<string, unknown> = {};
    for (let index = 0; index < rawDataset.headers.length; index++) {
      record[rawDataset.headers[index]] = row[index];
    }
    return record;
  });

  const fileType = detectFileType(file);

  return {
    id: crypto.randomUUID(),
    name: file.name,
    sourceFileId: file.name,
    tableName,
    columns: enrichedColumns,
    rowCount,
    metadata: {
      processedAt: new Date(),
      fileType,
      parserUsed: 'DataPipeline',
      processingDuration,
      transformations: [],
      geoDuckTableReady: geoTableReady
    },
    format: fileType as DatasetResult['format'],
    data,
    analysis: {
      columns: enrichedColumns,
      geoColumns: [],
      hasGeoData: !!rawDataset.geometry,
      suggestedGeoColumn: undefined,
      rowCount,
      warnings: validationResult.warnings
    },
    geometry: rawDataset.geometry,
    bounds: rawDataset.geometry?.bounds
      ? {
          minLat: rawDataset.geometry.bounds[1],
          maxLat: rawDataset.geometry.bounds[3],
          minLon: rawDataset.geometry.bounds[0],
          maxLon: rawDataset.geometry.bounds[2]
        }
      : undefined,
    createdAt: new Date(),
    fileSize: file.size,
    originalData: {
      columns: enrichedColumns,
      data,
      rowCount
    }
  };
}

function applyGeoDetection(
  dataset: DatasetResult,
  geoDetection?: GeoDetectionResult
): void {
  if (!geoDetection) {
    return;
  }

  dataset.geoDetection = geoDetection;

  const baseAnalysis =
    dataset.analysis ??
    ({
      columns: dataset.columns,
      geoColumns: [],
      hasGeoData: false,
      rowCount: dataset.rowCount,
      warnings: []
    } satisfies DatasetResult['analysis']);

  dataset.analysis = {
    ...baseAnalysis,
    geoColumns: geoDetection.geoColumns,
    hasGeoData: geoDetection.hasGeoColumns || baseAnalysis?.hasGeoData || false,
    suggestedGeoColumn:
      geoDetection.suggestedPrimaryGeoColumn?.columnName ??
      baseAnalysis?.suggestedGeoColumn,
    warnings: [...(baseAnalysis?.warnings ?? []), ...geoDetection.warnings]
  };
}

function detectFileType(file: Pick<File, 'name'>): string {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext || 'unknown';
}

async function prepareFileForDuckDB(
  file: File | undefined,
  rawDataset: RawDataset,
  tableName: string
): Promise<File> {
  if (file) {
    const isCSV = file.type.includes('csv') || file.name.endsWith('.csv');
    if (isCSV) {
      return file;
    }
  }

  const csvData = convertToCSV(rawDataset);
  const blob = new Blob([csvData], { type: 'text/csv' });
  return new File([blob], `${tableName}.csv`, { type: 'text/csv' });
}

function stripGeometryColumn(dataset: RawDataset): RawDataset {
  const geometryIndex = dataset.headers.findIndex(
    (header) => header.toLowerCase() === 'geometry'
  );

  if (geometryIndex === -1) {
    return dataset;
  }

  return {
    ...dataset,
    headers: dataset.headers.filter((_, index) => index !== geometryIndex),
    rows: dataset.rows.map((row) =>
      row.filter((_, index) => index !== geometryIndex)
    ),
    columns: dataset.columns.filter((_, index) => index !== geometryIndex)
  };
}

function buildAnalyticsFromRawDataset(
  dataset: RawDataset
): DuckAnalyticsColumn[] {
  return dataset.headers.map((header, columnIndex) => {
    const values = dataset.rows.map((row) => row[columnIndex]);
    const nonNullValues = values.filter(
      (value) =>
        value !== null &&
        value !== undefined &&
        value !== '' &&
        value !== 'null' &&
        value !== 'NULL'
    );

    const numericValues = nonNullValues
      .map((value) => Number(value))
      .filter((value) => !Number.isNaN(value));

    const isNumeric = numericValues.length === nonNullValues.length;

    const uniques = new Set(nonNullValues.map((value) => String(value))).size;

    const minValue =
      isNumeric && numericValues.length > 0
        ? Math.min(...numericValues)
        : undefined;
    const maxValue =
      isNumeric && numericValues.length > 0
        ? Math.max(...numericValues)
        : undefined;
    const meanValue =
      isNumeric && numericValues.length > 0
        ? numericValues.reduce((sum, value) => sum + value, 0) /
          numericValues.length
        : undefined;

    const medianValue =
      isNumeric && numericValues.length > 0
        ? calculateNumericMedian(numericValues)
        : undefined;

    return {
      name: header,
      type_simple: isNumeric ? 'numeric' : 'string',
      count: values.length,
      nulls: values.length - nonNullValues.length,
      uniques,
      min: minValue,
      max: maxValue,
      mean: meanValue,
      median: medianValue,
      stddev: undefined
    };
  });
}

function calculateNumericMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function convertToCSV(dataset: RawDataset): string {
  const escapeCSVValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerRow = dataset.headers.map(escapeCSVValue).join(',');
  const rows = [headerRow];

  for (const row of dataset.rows) {
    const csvRow = row.map(escapeCSVValue);
    rows.push(csvRow.join(','));
  }

  return rows.join('\\n');
}

function generateTableName(filename: string): string {
  let name = filename.replace(/\\.[^/.]+$/, '');
  name = name.replace(/[^a-zA-Z0-9_]/g, '_');

  if (!/^[a-zA-Z]/.test(name)) {
    name = `t_${name}`;
  }

  const timestamp = Date.now().toString(36);
  return `${name}_${timestamp}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFeatureCollection(value: unknown): value is FeatureCollection {
  return (
    isRecord(value) &&
    value.type === 'FeatureCollection' &&
    Array.isArray(value.features)
  );
}

function isFeature(value: unknown): value is Feature {
  return isRecord(value) && value.type === 'Feature' && 'geometry' in value;
}

function isFeatureArray(value: unknown): value is Feature[] {
  return Array.isArray(value) && value.every(isFeature);
}

function isGeometryCollection(value: unknown): value is GeometryCollection {
  return (
    isRecord(value) &&
    value.type === 'GeometryCollection' &&
    Array.isArray(value.geometries)
  );
}

function isGeometry(value: unknown): value is Geometry {
  if (!isRecord(value)) return false;
  const type = value.type;
  return (
    typeof type === 'string' &&
    GEOMETRY_TYPES.includes(type as Geometry['type']) &&
    'coordinates' in value
  );
}

function normalizeGeojsonInput(data: GeoJSONLike | unknown): FeatureCollection {
  if (isFeatureCollection(data)) {
    return data;
  }

  if (isFeatureArray(data)) {
    return {
      type: 'FeatureCollection',
      features: data
    };
  }

  if (isFeature(data)) {
    return {
      type: 'FeatureCollection',
      features: [data]
    };
  }

  if (isGeometryCollection(data)) {
    return {
      type: 'FeatureCollection',
      features: data.geometries.map((geom) => ({
        type: 'Feature',
        properties: {},
        geometry: geom
      }))
    };
  }

  if (isGeometry(data)) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: data
        }
      ]
    };
  }

  throw new Error('Invalid GeoJSON structure from shapefile');
}

function describeGeojsonStructure(data: unknown): {
  type?: string;
  hasFeatures: boolean;
  isArray: boolean;
  keys: string[];
} {
  const record = isRecord(data) ? data : {};
  const typeValue = record.type;
  return {
    type: typeof typeValue === 'string' ? typeValue : undefined,
    hasFeatures: Array.isArray((record as { features?: unknown }).features),
    isArray: Array.isArray(data),
    keys: Object.keys(record)
  };
}
