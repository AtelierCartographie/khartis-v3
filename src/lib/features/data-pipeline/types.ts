import type { DataAnalysisResult } from '$lib/features/commons/utils/deep-validator.utils';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';

export type {
  GeoArrowCRS,
  GeoArrowColumnMetadata,
  GeoArrowMetadata
} from '$lib/features/commons/types/geoarrow.types';
export { isGeoArrowMetadata } from '$lib/features/commons/types/geoarrow.types';

export enum ColumnType {
  BOOLEAN = 'boolean',
  DATE = 'date',
  NUMBER = 'number',
  GEOMETRY = 'geometry',
  TEXT = 'text'
}

export enum GeometryTypeEnum {
  POINT = 'Point',
  MULTIPOINT = 'MultiPoint',
  LINESTRING = 'LineString',
  MULTILINESTRING = 'MultiLineString',
  POLYGON = 'Polygon',
  MULTIPOLYGON = 'MultiPolygon'
}

export enum GeoLocationType {
  LATITUDE = 'latitude',
  LONGITUDE = 'longitude',
  COUNTRY_NAME = 'country_name',
  ISO2 = 'iso2',
  ISO3 = 'iso3',
  NUTS = 'nuts',
  REGION = 'region',
  CITY = 'city',
  COORDINATES = 'coordinates',
  LOCATION_NAME = 'location_name',
  UNKNOWN = 'unknown'
}

export enum FileFormatEnum {
  CSV = 'csv',
  GEOJSON = 'geojson',
  SHAPEFILE = 'shapefile',
  GEOPACKAGE = 'geopackage',
  GEOPARQUET = 'geoparquet',
  KML = 'kml',
  KMZ = 'kmz',
  GPX = 'gpx',
  UNKNOWN = 'unknown'
}

export function isNumericType(type: ColumnType): boolean {
  return type === ColumnType.NUMBER;
}

export function fromDuckDBType(duckType: string): ColumnType {
  const normalized = duckType.toLowerCase();

  if (normalized.includes('bool')) return ColumnType.BOOLEAN;
  if (normalized.includes('date') || normalized.includes('time'))
    return ColumnType.DATE;
  if (
    normalized === 'string' ||
    normalized === 'varchar' ||
    normalized === 'text'
  )
    return ColumnType.TEXT;
  if (
    normalized.includes('int') ||
    normalized.includes('double') ||
    normalized.includes('float') ||
    normalized.includes('numeric')
  ) {
    return ColumnType.NUMBER;
  }
  if (normalized.includes('geometry') || normalized.includes('geom'))
    return ColumnType.GEOMETRY;

  return ColumnType.TEXT;
}

export interface ColumnStats {
  name: string;
  type: ColumnType;
  count: number;
  nulls: number;
  uniques: number;
  min?: unknown;
  max?: unknown;
  mean?: number;
  median?: number;
  stdDev?: number;
  share_integers?: number;
  share_floats?: number;
  share_rank_interval?: number;
  extent_magnitude?: number;
}

export interface RawColumn {
  name: string;
  values: unknown[];
}

export interface InferredColumn extends RawColumn {
  type: ColumnType;
}

export interface RawDataset {
  headers: string[];
  rows: unknown[][];
  columns: RawColumn[];
  geometry?: GeometryInfo;
  metadata: Record<string, unknown>;
}

export interface EnrichedColumn extends InferredColumn {
  stats: ColumnStats;
}

export interface GeometryInfo {
  type: string;
  columnName?: string;
  bounds: [number, number, number, number];
  centroid: [number, number];
  crs?: string;
  featureCount?: number;
}

export function computeCentroid(
  bounds: [number, number, number, number]
): [number, number] {
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validationSuccess(warnings: string[] = []): ValidationResult {
  return { isValid: true, errors: [], warnings };
}

export function validationFailure(
  errors: string[],
  warnings: string[] = []
): ValidationResult {
  return { isValid: false, errors, warnings };
}

export interface ColumnAnalysis {
  name?: string;
  type?: ColumnType | string;
  stats?: Partial<ColumnStats> & {
    totalCount?: number;
    uniqueCount?: number;
    nullCount?: number;
  };
  distribution?: { histogram: number[]; bins: number[] };
  outliers?: unknown[];
  topValues?: Array<{ value: unknown; count: number }>;
  suggested?: {
    visualization: string;
    breaks?: number[];
    categoryType?: 'nominal' | 'ordinal';
  };
  geometryInfo?: {
    geometryType: string;
    bounds: [number, number, number, number];
    centroid: [number, number];
  };
  dateInfo?: { earliest: Date; latest: Date; range: string };
}

export interface ColumnInfo {
  name: string;
  type: 'number' | 'string' | 'date' | 'boolean' | 'geometry';
  nullable: boolean;
  unique: boolean;
  min?: number | string | Date;
  max?: number | string | Date;
  mean?: number;
  sampleValues?: unknown[];
}

export interface GeoColumnInfo {
  index: number;
  columnName: string;
  type: `${GeoLocationType}`;
  confidence: number;
  isValid?: boolean;
}

export interface AnalysisResult {
  columns: EnrichedColumn[];
  geoColumns: GeoColumnInfo[] | unknown[];
  hasGeoData: boolean;
  suggestedGeoColumn?: string;
  rowCount: number;
  warnings: string[];
}

export type FileFormat = `${FileFormatEnum}`;

export interface CsvImportOptions {
  header: boolean;
  decimalSeparator: string;
  thousandsSeparator?: string;
  delimiter?: string;
}

export interface DatasetMetadata {
  processedAt: Date;
  fileType: string;
  parserUsed: string;
  processingDuration?: number;
  transformations?: string[];
  geoDuckTableReady?: boolean;
  csvOptions?: CsvImportOptions;
}

export interface DatasetResult {
  id: string;
  name: string;
  sourceFileId: string;
  tableName: string;
  columns: EnrichedColumn[];
  rowCount: number;
  geometry?: GeometryInfo;
  metadata: DatasetMetadata;
  data?: Record<string, unknown>[];
  originalData?: {
    columns: EnrichedColumn[];
    data: Record<string, unknown>[];
    rowCount: number;
  };
  fileSize?: number;
  format?: FileFormat;
  analysis?: AnalysisResult;
  createdAt?: Date;
  bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  geoDetection?: GeoDetectionResult;
  joinedBasemap?: string;
  geoColumn?: string;
  simplificationApplied?: {
    rate: number;
    tolerance: number;
    originalVertices: number;
    simplifiedVertices: number;
    reductionPercentage: number;
    duration: number;
  };
}

export interface ProcessedDatasetAnalysisResult {
  columns: ColumnInfo[];
  geoColumns: GeoColumnInfo[] | unknown[];
  hasGeoData: boolean;
  suggestedGeoColumn?: string;
  rowCount: number;
  warnings: string[];
}

export interface ProcessedDataset {
  id: string;
  name: string;
  sourceFileId?: string;
  format: FileFormat;
  data: Record<string, unknown>[];
  rowCount: number;
  columns: ColumnInfo[];
  analysis: ProcessedDatasetAnalysisResult;
  geometry?: `${GeometryTypeEnum}`;
  bounds?: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  duckdbTableName?: string;
  createdAt: Date;
  fileSize: number;
  metadata: { processedAt: Date; transformations: string[] };
  geoDetection?: GeoDetectionResult;
  originalData?: {
    columns: ColumnInfo[];
    data: Record<string, unknown>[];
    rowCount: number;
  };
}

export interface PipelineContext {
  initialized: boolean;
}

export interface UploadedFilePayload {
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
  relatedFilesData?: Record<string, ArrayBuffer | number[]>;
}

export interface DuckAnalyticsColumn {
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
  share_integers?: number | string;
  share_floats?: number | string;
  share_rank_interval?: number | string;
  extent_magnitude?: number | string;
}

export type FileInfo = Pick<File, 'name' | 'size' | 'type'>;

export interface ZipDatasetResult {
  datasets: DatasetResult[];
  sourceZipName: string;
  totalFiles: number;
  processedFiles: number;
  skippedFiles: string[];
}

export function isZipDatasetResult(
  result: DatasetResult | ZipDatasetResult
): result is ZipDatasetResult {
  return 'datasets' in result && Array.isArray(result.datasets);
}
