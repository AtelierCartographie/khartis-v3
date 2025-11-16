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
  validateFile(file: File): Promise<ValidationResult>;
  destroy(): Promise<void>;
};

export function createDataPipeline(): DataPipeline {
  let initialized = false;

  async function ensureInit(): Promise<void> {
    if (!initialized) {
      await initDuckDB();
      initialized = true;
    }
  }

  async function processUploadedFile(
    uploadedFile: UploadedFilePayload,
    originalFile?: File
  ): Promise<DatasetResult> {
    await ensureInit();

    if (uploadedFile.parsedData && uploadedFile.fileType === 'shapefile') {
      const dataset = await processShapefile(uploadedFile);
      dataset.sourceFileId = uploadedFile.id;
      applyGeoDetection(dataset, uploadedFile.deepAnalysis?.geoDetection);
      dataset.name = uploadedFile.name;
      return dataset;
    }

    if (originalFile) {
      const dataset = await processFileInternal(originalFile);
      dataset.sourceFileId = uploadedFile.id;
      applyGeoDetection(dataset, uploadedFile.deepAnalysis?.geoDetection);
      dataset.name = uploadedFile.name;
      return dataset;
    }

    const fallback = await createFileFromUpload(uploadedFile);
    const dataset = await processFileInternal(fallback);
    dataset.sourceFileId = uploadedFile.id;
    applyGeoDetection(dataset, uploadedFile.deepAnalysis?.geoDetection);
    dataset.name = uploadedFile.name;
    return dataset;
  }

  async function processShapefile(
    uploadedFile: UploadedFilePayload
  ): Promise<DatasetResult> {
    const parsedGeojson =
      typeof uploadedFile.parsedData === 'string'
        ? JSON.parse(uploadedFile.parsedData)
        : uploadedFile.parsedData;

    const structureInfo = describeGeojsonStructure(parsedGeojson);
    logger.debug(
      'GeoJSON structure validated',
      LogCategory.DATA,
      structureInfo
    );

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
    return dataset;
  }

  async function processFile(file: File): Promise<DatasetResult> {
    await ensureInit();
    return processFileInternal(file);
  }

  async function processFileInternal(
    file: File,
    options: { originalName?: string; rawDataset?: RawDataset } = {}
  ): Promise<DatasetResult> {
    const fileInfo: FileInfo = {
      name: options.originalName ?? file.name,
      size: file.size,
      type: file.type
    };

    const tableName = generateTableName(fileInfo.name);
    const isGeoFile = isGeospatialFile(fileInfo.name);

    if (!Duck) {
      throw new Error('DuckDB not initialized');
    }

    await Duck.register_files([file]);
    if (isGeoFile) {
      await Duck.read_geofile(file, { tablename: tableName });
    } else {
      await Duck.read_tabular(file, { tablename: tableName });
    }

    const duckdbColumns = await Duck.analyse(tableName);
    const rowCount = await Duck.get_row_count(tableName);
    const geometryInfo = await extractGeometryInfo(tableName);
    const enrichedColumns = enrichColumns(duckdbColumns);

    const fileFormat = detectFileType(fileInfo.name) ?? 'unknown';
    const dataset = buildDatasetResult({
      file: fileInfo,
      tableName,
      enrichedColumns,
      rowCount,
      isGeoFile,
      geometryInfo,
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

    return dataset;
  }

  async function validateFile(file: File): Promise<ValidationResult> {
    const maxSize = 50 * 1024 * 1024;
    if (file.size === 0) {
      return {
        isValid: false,
        errors: ['File is empty'],
        warnings: []
      };
    }

    if (file.size > maxSize) {
      return {
        isValid: false,
        errors: ['File size exceeds 50MB limit'],
        warnings: []
      };
    }

    return validationSuccess();
  }

  async function destroy(): Promise<void> {
    initialized = false;
  }

  return {
    initialize: ensureInit,
    processFile,
    processUploadedFile,
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

    const geomTypeResult = (await Duck.query(
      `SELECT ST_GeometryType(${geometryColumn.name}) as geom_type FROM ${tableName} LIMIT 1`,
      { format: 'array' as never }
    )) as Array<{ geom_type: string }>;

    const geometryType = geomTypeResult[0]?.geom_type ?? 'GEOMETRY';

    const bboxQuery = `
      WITH extent AS (
        SELECT ST_Extent(${geometryColumn.name}) AS bbox FROM ${tableName}
      )
      SELECT
        ST_XMin(bbox) AS minX,
        ST_YMin(bbox) AS minY,
        ST_XMax(bbox) AS maxX,
        ST_YMax(bbox) AS maxY
      FROM extent
    `;

    const [extent] = (await Duck.query(bboxQuery, {
      format: 'array' as never
    })) as Array<{
      minX: number | null;
      minY: number | null;
      maxX: number | null;
      maxY: number | null;
    }>;

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
    logger.warn('Failed to extract geometry info', LogCategory.DATA, error);
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
