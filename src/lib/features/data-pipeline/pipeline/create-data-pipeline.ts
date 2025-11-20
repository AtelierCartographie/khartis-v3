import type { DataAnalysisResult } from '$lib/features/commons/utils/deep-validator.utils';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import type {
  Feature,
  FeatureCollection,
  Geometry,
  GeometryCollection
} from 'geojson';
import { convertGeoJSONToRawDataset } from '../adapters/parsers/geojson.parser';
import { fromDuckDBType } from '../models/column-type';
import type { DatasetResult, EnrichedColumn } from '../models/dataset-result';
import type { GeometryInfo } from '../models/geometry-info';
import { computeCentroid } from '../models/geometry-info';
import type { RawDataset } from '../models/raw-dataset';
import type { ValidationResult } from '../models/validation-result';
import { validationSuccess } from '../models/validation-result';

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
  relatedFileObjects?: File[];
};

type GeoJSONLike =
  | FeatureCollection
  | Feature
  | GeometryCollection
  | Geometry
  | Feature[];

type FileInfo = Pick<File, 'name' | 'size' | 'type'>;

const SUPPORTED_EXT = {
  geo: ['.geojson', '.json', '.shp', '.gpkg', '.kml', '.kmz', '.geoparquet'],
  tabular: ['.csv', '.tsv', '.txt', '.parquet']
};

export type DataPipeline = {
  initialize(): Promise<void>;
  processFile(file: File): Promise<DatasetResult>;
  processUploadedFile(
    uploadedFile: UploadedFilePayload,
    originalFile?: File
  ): Promise<DatasetResult>;
  /**
   * Directly process a remote file without fetching it on the frontend.
   * Uses DuckDB HTTPFS under the hood.
   */
  processRemoteFile(
    url: string,
    options?: { tableName?: string; decimalSeparator?: string }
  ): Promise<DatasetResult>;
  /**
   * Convenience wrapper around an inline string (copy/paste).
   */
  processPastedData(
    content: string,
    options?: { name?: string; type?: string }
  ): Promise<DatasetResult>;
  /**
   * Apply a join suggestion/association on a dataset.
   */
  joinDatasetById(
    tableName: string,
    idColumn: string,
    options: {
      basemapsTable?: string;
      basemapTable?: string;
      basemapId?: string;
      basemapOthersId?: string;
    }
  ): Promise<unknown>;
  applyJoinAssociation(tableName: string, basemap: string): Promise<void>;
  /**
   * Simple multi-filter helper (filters are SQL predicates combined with AND).
   */
  applyFilters(tableName: string, filters: string[]): Promise<unknown>;
  validateFile(file: File): Promise<ValidationResult>;
  destroy(): Promise<void>;
};

export function createDataPipeline(): DataPipeline {
  let initialized = false;

  async function ensureInit(): Promise<void> {
    if (initialized) return;

    const start = performance.now();
    logger.info('Initializing data pipeline DuckDB session', LogCategory.DATA);

    try {
      await initDuckDB();
      initialized = true;
      logger.success('Data pipeline ready', LogCategory.DATA, {
        durationMs: (performance.now() - start).toFixed(2)
      });
    } catch (error) {
      logger.error('Data pipeline initialization failed', LogCategory.DATA, {
        error
      });
      throw error;
    }
  }

  async function processUploadedFile(
    uploadedFile: UploadedFilePayload,
    originalFile?: File
  ): Promise<DatasetResult> {
    await ensureInit();
    const start = performance.now();
    logger.info(
      'Processing uploaded file via data pipeline',
      LogCategory.DATA,
      {
        uploadedFileId: uploadedFile.id,
        fileName: uploadedFile.name,
        fileType: uploadedFile.fileType,
        hasOriginal: Boolean(originalFile)
      }
    );

    try {
      let dataset: DatasetResult;
      if (uploadedFile.parsedData && uploadedFile.fileType === 'shapefile') {
        dataset = await processShapefile(uploadedFile);
      } else if (originalFile) {
        const companionFiles = uploadedFile.relatedFileObjects?.filter(
          (f: File) => f !== originalFile
        );
        dataset = await processFileInternal(originalFile, { companionFiles });
      } else {
        const fallback = await createFileFromUpload(uploadedFile);
        dataset = await processFileInternal(fallback);
      }

      dataset.sourceFileId = uploadedFile.id;
      applyGeoDetection(dataset, uploadedFile.deepAnalysis?.geoDetection);
      dataset.name = uploadedFile.name;

      logger.success('Uploaded file processed', LogCategory.DATA, {
        datasetId: dataset.id,
        fileName: dataset.name,
        durationMs: (performance.now() - start).toFixed(2)
      });
      return dataset;
    } catch (error) {
      logger.error('Failed to process uploaded file', LogCategory.DATA, {
        fileId: uploadedFile.id,
        error
      });
      throw error;
    }
  }

  async function processShapefile(
    uploadedFile: UploadedFilePayload
  ): Promise<DatasetResult> {
    const start = performance.now();
    logger.info('Processing shapefile upload', LogCategory.DATA, {
      fileId: uploadedFile.id,
      fileName: uploadedFile.name
    });

    const parsedGeojson =
      typeof uploadedFile.parsedData === 'string'
        ? JSON.parse(uploadedFile.parsedData)
        : uploadedFile.parsedData;

    const structureInfo = describeGeojsonStructure(parsedGeojson);

    const normalizedGeojson = normalizeGeojsonInput(
      parsedGeojson as GeoJSONLike
    );

    const rawDataset = convertGeoJSONToRawDataset(
      normalizedGeojson as FeatureCollection
    );

    const geojsonString = JSON.stringify(normalizedGeojson);
    const geojsonFileName = uploadedFile.name.replace(/\.shp$/i, '.geojson');
    uploadedFile.preparedGeoJSON = geojsonString;

    const geojsonFile = new File([geojsonString], geojsonFileName, {
      type: 'application/geo+json'
    });

    const dataset = await processFileInternal(geojsonFile, {
      originalName: uploadedFile.name,
      rawDataset
    });

    dataset.sourceFileId = uploadedFile.id;
    dataset.name = uploadedFile.name;
    logger.success('Shapefile converted to dataset', LogCategory.DATA, {
      fileId: uploadedFile.id,
      featureKeys: structureInfo.keys,
      durationMs: (performance.now() - start).toFixed(2)
    });
    return dataset;
  }

  async function processFile(file: File): Promise<DatasetResult> {
    await ensureInit();
    const start = performance.now();
    logger.info('Processing file via data pipeline', LogCategory.DATA, {
      fileName: file.name,
      fileType: file.type
    });
    try {
      const dataset = await processFileInternal(file);
      logger.success('File processed via data pipeline', LogCategory.DATA, {
        datasetId: dataset.id,
        tableName: dataset.tableName,
        durationMs: (performance.now() - start).toFixed(2)
      });
      return dataset;
    } catch (error) {
      logger.error(
        'Failed to process file via data pipeline',
        LogCategory.DATA,
        {
          fileName: file.name,
          error
        }
      );
      throw error;
    }
  }

  async function processFileInternal(
    file: File,
    options: {
      originalName?: string;
      rawDataset?: RawDataset;
      companionFiles?: File[];
    } = {}
  ): Promise<DatasetResult> {
    const fileInfo: FileInfo = {
      name: options.originalName ?? file.name,
      size: file.size,
      type: file.type
    };

    const tableName = generateTableName(fileInfo.name);
    const isGeoFile = isGeospatialFile(fileInfo.name);
    const isShapefile = fileInfo.name.toLowerCase().endsWith('.shp');

    const start = performance.now();
    logger.debug('Reading file into DuckDB via pipeline', LogCategory.DATA, {
      fileName: fileInfo.name,
      tableName,
      isGeoFile,
      isShapefile,
      hasCompanionFiles: Boolean(options.companionFiles?.length)
    });

    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }

    try {
      if (
        isShapefile &&
        options.companionFiles &&
        options.companionFiles.length > 0
      ) {
        const allShapefileFiles = [file, ...options.companionFiles];
        await Duck.register_files(allShapefileFiles, { shapefile: true });
      } else if (!isShapefile) {
        await Duck.register_files([file]);
      }

      if (isGeoFile) {
        await Duck.read_geofile(file, {
          tablename: tableName,
          shapefile: isShapefile
        });
      } else {
        await Duck.read_tabular(file, { tablename: tableName });
      }

      const fileFormat = detectFileType(fileInfo.name) ?? 'unknown';
      const dataset = await buildDatasetFromDuckTable({
        file: fileInfo,
        tableName,
        isGeoFile,
        format: fileFormat
      });

      if (options.rawDataset) {
        const rawColumns = convertRawColumnsToEnriched(options.rawDataset);
        dataset.originalData = {
          columns: rawColumns,
          data: options.rawDataset.rows.map((row) => {
            const record: Record<string, unknown> = {};
            options.rawDataset?.headers?.forEach((header, index) => {
              record[header] = row[index];
            });
            return record;
          }),
          rowCount: options.rawDataset.rows.length
        };
      }

      logger.success('DuckDB dataset built', LogCategory.DATA, {
        tableName,
        rowCount,
        durationMs: (performance.now() - start).toFixed(2)
      });

      return dataset;
    } catch (error) {
      logger.error('Failed to build DuckDB dataset', LogCategory.DATA, {
        fileName: fileInfo.name,
        tableName,
        error
      });
      throw error;
    }
  }

  async function processRemoteFile(
    url: string,
    options: { tableName?: string; decimalSeparator?: string } = {}
  ): Promise<DatasetResult> {
    await ensureInit();

    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }

    const { tableName: providedTableName, decimalSeparator } = options;
    const filename = url.split('/').pop() || 'remote_file';
    const format = detectFileType(filename) ?? 'unknown';
    const isGeoFile = isGeospatialFile(filename);
    const tableName = providedTableName ?? generateTableName(filename);

    await Duck.read_link(url, {
      tablename: tableName,
      decimal_separator: decimalSeparator
    });

    const dataset = await buildDatasetFromDuckTable({
      file: {
        name: filename,
        size: 0,
        type: 'application/octet-stream'
      },
      tableName,
      isGeoFile,
      format
    });

    dataset.sourceFileId = url;
    dataset.name = filename;
    return dataset;
  }

  async function processPastedData(
    content: string,
    options: { name?: string; type?: string } = {}
  ): Promise<DatasetResult> {
    const name = options.name ?? 'pasted-data.csv';
    const type = options.type ?? 'text/csv';
    const file = await createFileFromUploadContent(content, name, type);
    return processFile(file);
  }

  async function buildDatasetFromDuckTable({
    file,
    tableName,
    isGeoFile,
    format
  }: {
    file: FileInfo;
    tableName: string;
    isGeoFile: boolean;
    format: string;
  }): Promise<DatasetResult> {
    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }

    const duckdbColumns = await Duck.analyse(tableName);
    const rowCount = await Duck.get_row_count(tableName);
    const geometryInfo = await extractGeometryInfo(tableName);
    const enrichedColumns = enrichColumns(duckdbColumns);

    const dataset = buildDatasetResult({
      file,
      tableName,
      enrichedColumns,
      rowCount,
      isGeoFile,
      geometryInfo,
      format
    });

    const qualityWarnings = computeQualityWarnings(enrichedColumns, rowCount);
    dataset.analysis = {
      ...dataset.analysis,
      warnings: [...(dataset.analysis?.warnings ?? []), ...qualityWarnings]
    };

    return dataset;
  }

  async function validateFile(file: File): Promise<ValidationResult> {
    const maxSize = 50 * 1024 * 1024;
    if (file.size === 0) {
      logger.warn('Uploaded file is empty', LogCategory.DATA, {
        fileName: file.name
      });
      return {
        isValid: false,
        errors: ['File is empty'],
        warnings: []
      };
    }

    if (file.size > maxSize) {
      logger.warn('Uploaded file exceeds size limit', LogCategory.DATA, {
        fileName: file.name,
        fileSize: file.size
      });
      return {
        isValid: false,
        errors: ['File size exceeds 50MB limit'],
        warnings: []
      };
    }

    logger.debug('File passed basic validation', LogCategory.DATA, {
      fileName: file.name,
      fileSize: file.size
    });
    return validationSuccess();
  }

  async function destroy(): Promise<void> {
    initialized = false;
    logger.info('Data pipeline destroyed', LogCategory.DATA);
  }

  async function joinDatasetById(
    tableName: string,
    idColumn: string,
    options: {
      basemapsTable?: string;
      basemapTable?: string;
      basemapId?: string;
      basemapOthersId?: string;
    }
  ): Promise<unknown> {
    await ensureInit();
    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }
    return Duck.join_by_id(tableName, idColumn, options);
  }

  async function applyJoinAssociation(
    tableName: string,
    basemap: string
  ): Promise<void> {
    await ensureInit();
    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }
    await Duck.apply_join_association(tableName, basemap);
  }

  async function applyFilters(
    tableName: string,
    filters: string[]
  ): Promise<unknown> {
    await ensureInit();
    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }
    const metadata =
      Duck.table_metadata.get(tableName) ??
      (() => {
        const fresh = { analysis: null, join: null, filters: new Map() };
        Duck!.table_metadata.set(tableName, fresh as never);
        return fresh;
      })();
    metadata.filters.clear();
    filters.forEach((filter, index) => Duck!.add_filter(tableName, index, filter));
    return Duck.apply_filters(tableName);
  }

  return {
    initialize: ensureInit,
    processFile,
    processUploadedFile,
    processRemoteFile,
    processPastedData,
    joinDatasetById,
    applyJoinAssociation,
    applyFilters,
    validateFile,
    destroy
  };
}

export const dataPipeline = createDataPipeline();

function isGeospatialFile(name: string): boolean {
  const lower = name.toLowerCase();
  return SUPPORTED_EXT.geo.some((ext) => lower.endsWith(ext));
}

function generateTableName(filename: string): string {
  const base = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
  const prefix = base.length > 0 ? base : 'table';
  const suffix = Date.now().toString(36);
  return `${prefix}_${suffix}`;
}

function enrichColumns(columns: DuckAnalyticsColumn[]): EnrichedColumn[] {
  return columns.map((column) => ({
    name: column.name,
    values: [],
    type: fromDuckDBType(String(column.type_simple || 'text')),
    stats: {
      name: column.name,
      type: fromDuckDBType(String(column.type_simple || 'text')),
      count: Number(column.count || 0),
      nulls: Number(column.nulls || 0),
      uniques: Number(column.uniques || 0),
      min: column.min,
      max: column.max,
      mean: column.mean ? Number(column.mean) : undefined,
      median: column.median ? Number(column.median) : undefined,
      stdDev: column.stddev ? Number(column.stddev) : undefined
    }
  }));
}

function convertRawColumnsToEnriched(rawDataset: RawDataset): EnrichedColumn[] {
  return rawDataset.columns.map((column) => {
    const values = column.values ?? [];
    const nonNullValues = values.filter(
      (value) => value !== null && value !== undefined
    );
    const enrichedType = fromDuckDBType('text');
    const uniques = new Set(
      nonNullValues.map((value) =>
        typeof value === 'object' ? JSON.stringify(value) : String(value)
      )
    ).size;

    return {
      name: column.name,
      values,
      type: enrichedType,
      stats: {
        name: column.name,
        type: enrichedType,
        count: values.length,
        nulls: values.length - nonNullValues.length,
        uniques,
        min: undefined,
        max: undefined,
        mean: undefined,
        median: undefined,
        stdDev: undefined
      }
    };
  });
}

function computeQualityWarnings(
  columns: EnrichedColumn[],
  rowCount: number
): string[] {
  if (rowCount === 0) return [];
  const warnings: string[] = [];

  columns.forEach((column) => {
    const nullRatio =
      column.stats?.count && column.stats.count > 0
        ? column.stats.nulls / column.stats.count
        : 0;
    if (nullRatio > 0.5) {
      warnings.push(
        `Colonne "${column.name}" contient ${(nullRatio * 100).toFixed(1)}% de valeurs manquantes`
      );
    }

    const nonNullCount =
      (column.stats?.count ?? 0) - (column.stats?.nulls ?? 0);
    if (nonNullCount > 0) {
      const uniquenessRatio = (column.stats?.uniques ?? 0) / nonNullCount;
      if (uniquenessRatio < 0.01) {
        warnings.push(
          `Colonne "${column.name}" a une cardinalite tres faible (${column.stats?.uniques ?? 0} valeurs uniques sur ${nonNullCount})`
        );
      }
    }
  });

  return warnings;
}

async function extractGeometryInfo(
  tableName: string
): Promise<GeometryInfo | undefined> {
  if (!Duck) return undefined;
  try {
    const describe = await Duck.describe_table(tableName);
    const columns = describe.name.map((name, index) => ({
      name,
      type: describe.type[index]
    }));

    const geometryColumn = columns.find((column) => column.type === 'GEOMETRY');
    if (!geometryColumn) {
      return undefined;
    }

    // Consolidate all geometry queries into a single query
    const consolidatedQuery = `
      WITH bbox AS (
        SELECT ST_Extent(${geometryColumn.name}) AS extent FROM ${tableName}
      ),
      first_row AS (
        SELECT ${geometryColumn.name} AS geom FROM ${tableName} WHERE ${geometryColumn.name} IS NOT NULL LIMIT 1
      )
      SELECT
        ST_GeometryType((SELECT geom FROM first_row)) AS geom_type,
        ST_XMin(extent) AS minX,
        ST_YMin(extent) AS minY,
        ST_XMax(extent) AS maxX,
        ST_YMax(extent) AS maxY
      FROM bbox
    `;

    const [result] = (await Duck.query(consolidatedQuery, {
      format: 'array' as never
    })) as Array<{
      geom_type: string | null;
      minX: number | null;
      minY: number | null;
      maxX: number | null;
      maxY: number | null;
    }>;

    const geometryType = result?.geom_type ?? 'GEOMETRY';
    const extent = result;

    if (
      !extent ||
      extent.minX === null ||
      extent.minY === null ||
      extent.maxX === null ||
      extent.maxY === null
    ) {
      return {
        type: normalizeGeometryColumnType(geometryType),
        bounds: [-180, -90, 180, 90],
        centroid: [0, 0]
      };
    }

    const bounds: [number, number, number, number] = [
      extent.minX,
      extent.minY,
      extent.maxX,
      extent.maxY
    ];

    return {
      type: normalizeGeometryColumnType(geometryType),
      bounds,
      centroid: computeCentroid(bounds),
      crs: 'EPSG:4326',
      featureCount: undefined
    };
  } catch (error) {
    logger.warn('Failed to extract geometry info', LogCategory.DATA, {
      tableName,
      error
    });
    return undefined;
  }
}

function normalizeGeometryColumnType(
  type?: string | null
): GeometryInfo['type'] {
  if (!type) return 'Polygon';
  const normalized = type.replace(/^ST_/i, '').toLowerCase();
  switch (normalized) {
    case 'point':
      return 'Point';

    case 'multipoint':
      return 'MultiPoint';

    case 'linestring':
      return 'LineString';

    case 'multilinestring':
      return 'MultiLineString';

    case 'multipolygon':
      return 'MultiPolygon';

    default:
      return 'Polygon';
  }
}

function buildDatasetResult({
  file,
  tableName,
  enrichedColumns,
  rowCount,
  isGeoFile,
  geometryInfo,
  format
}: {
  file: FileInfo;
  tableName: string;
  enrichedColumns: EnrichedColumn[];
  rowCount: number;
  isGeoFile: boolean;
  geometryInfo?: GeometryInfo;
  format: string;
}): DatasetResult {
  const datasetId = crypto.randomUUID();

  return {
    id: datasetId,
    name: file.name,
    sourceFileId: file.name,
    tableName,
    columns: enrichedColumns,
    rowCount,
    geometry: geometryInfo,
    metadata: {
      processedAt: new Date(),
      fileType: format,
      parserUsed: 'DuckDB',
      processingDuration: undefined,
      transformations: []
    },
    data: [],
    format,
    analysis: {
      columns: enrichedColumns,
      hasGeoData: Boolean(geometryInfo || isGeoFile),
      geoColumns: geometryInfo
        ? [
            {
              columnName: geometryInfo.type ? 'geom' : '',
              type: geometryInfo.type,
              isValid: true
            }
          ]
        : [],
      rowCount,
      warnings: []
    },
    fileSize: file.size,
    bounds: geometryInfo?.bounds
      ? {
          minLon: geometryInfo.bounds[0],
          minLat: geometryInfo.bounds[1],
          maxLon: geometryInfo.bounds[2],
          maxLat: geometryInfo.bounds[3]
        }
      : undefined,
    createdAt: new Date()
  };
}

function detectFileType(name: string): DatasetResult['format'] {
  const lower = name.toLowerCase();
  if (
    lower.endsWith('.csv') ||
    lower.endsWith('.tsv') ||
    lower.endsWith('.txt')
  ) {
    return 'csv';
  }
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
    return 'geojson';
  }
  if (lower.endsWith('.shp')) {
    return 'shapefile';
  }
  if (lower.endsWith('.gpkg')) {
    return 'geopackage';
  }
  if (lower.endsWith('.kml')) {
    return 'kml';
  }
  if (lower.endsWith('.kmz')) {
    return 'kmz';
  }
  if (lower.endsWith('.geoparquet') || lower.endsWith('.parquet')) {
    return 'geoparquet';
  }
  return 'unknown';
}

function applyGeoDetection(
  dataset: DatasetResult,
  geoDetection?: GeoDetectionResult
): void {
  if (!geoDetection) return;
  dataset.geoDetection = geoDetection;
  dataset.analysis = {
    columns: dataset.analysis?.columns ?? dataset.columns,
    hasGeoData:
      geoDetection.hasGeoColumns ?? dataset.analysis?.hasGeoData ?? false,
    geoColumns: geoDetection.geoColumns,
    rowCount: dataset.rowCount,
    warnings: [...(dataset.analysis?.warnings ?? []), ...geoDetection.warnings]
  };
}

async function createFileFromUploadContent(
  content: string | ArrayBuffer,
  name: string,
  type: string
): Promise<File> {
  const resolvedType = type || 'application/octet-stream';
  if (typeof content === 'string') {
    return new File([content], name, { type: resolvedType });
  }
  const blob = new Blob([content], { type: resolvedType });
  return new File([blob], name, { type: resolvedType });
}

async function createFileFromUpload(
  uploadedFile: UploadedFilePayload
): Promise<File> {
  if (!uploadedFile.content) {
    logger.error('Uploaded file is missing inline content', LogCategory.DATA, {
      fileId: uploadedFile.id,
      fileName: uploadedFile.name
    });
    throw new Error('Uploaded file has no content');
  }
  return createFileFromUploadContent(
    uploadedFile.content,
    uploadedFile.name,
    uploadedFile.type
  );
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
    hasFeatures: Array.isArray(record.features),
    isArray: Array.isArray(data),
    keys: Object.keys(record)
  };
}

function normalizeGeojsonInput(input: GeoJSONLike): FeatureCollection {
  if (isFeatureCollection(input)) {
    return input;
  }

  if (isFeatureArray(input)) {
    return {
      type: 'FeatureCollection',
      features: input
    };
  }

  if (isFeature(input)) {
    return {
      type: 'FeatureCollection',
      features: [input]
    };
  }

  if (isGeometryCollection(input)) {
    return {
      type: 'FeatureCollection',
      features: input.geometries.map((geometry) => ({
        type: 'Feature',
        properties: {},
        geometry
      }))
    };
  }

  if (isGeometry(input)) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: input
        }
      ]
    };
  }

  throw new Error('Invalid GeoJSON structure from shapefile');
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

function isFeatureArray(value: unknown): value is Feature[] {
  return Array.isArray(value) && value.every(isFeature);
}

function isFeature(value: unknown): value is Feature {
  return (
    isRecord(value) &&
    value.type === 'Feature' &&
    (value.geometry === null || isRecord(value.geometry))
  );
}

function isGeometryCollection(value: unknown): value is GeometryCollection {
  return (
    isRecord(value) &&
    value.type === 'GeometryCollection' &&
    Array.isArray(value.geometries)
  );
}

function isGeometry(value: unknown): value is Geometry {
  return (
    isRecord(value) && typeof value.type === 'string' && 'coordinates' in value
  );
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
