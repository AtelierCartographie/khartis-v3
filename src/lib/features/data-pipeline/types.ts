import type { DataAnalysisResult } from '$lib/features/commons/utils/deep-validator.utils';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import type { Duck } from '$lib/features/duckdb';

// --- Column Types ---

export enum ColumnType {
  BOOLEAN = 'boolean',
  DATE = 'date',
  NUMBER = 'number',
  GEOMETRY = 'geometry',
  TEXT = 'text'
}

export function isNumericType(type: ColumnType): boolean {
  return type === ColumnType.NUMBER;
}

export function isTemporalType(type: ColumnType): boolean {
  return type === ColumnType.DATE;
}

export function isSpatialType(type: ColumnType): boolean {
  return type === ColumnType.GEOMETRY;
}

export function fromDuckDBType(duckType: string): ColumnType {
  const normalized = duckType.toLowerCase();

  if (normalized.includes('bool')) return ColumnType.BOOLEAN;
  if (normalized.includes('date') || normalized.includes('time'))
    return ColumnType.DATE;
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

// --- Column Stats ---

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
}

export function hasNumericStats(stats: ColumnStats): boolean {
  return (
    stats.mean !== undefined &&
    stats.median !== undefined &&
    stats.stdDev !== undefined
  );
}

export function getNullPercentage(stats: ColumnStats): number {
  if (stats.count === 0) return 0;
  return (stats.nulls / stats.count) * 100;
}

export function getUniquePercentage(stats: ColumnStats): number {
  if (stats.count === 0) return 0;
  return (stats.uniques / stats.count) * 100;
}

// --- Raw Data Types ---

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

// --- Enriched Column ---

export interface EnrichedColumn extends InferredColumn {
  stats: ColumnStats;
}

// --- Geometry Types ---

export interface GeometryInfo {
  type: string;
  bounds: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  centroid: [number, number]; // [lon, lat]
  crs?: string;
  featureCount?: number;
}

export function computeCentroid(
  bounds: [number, number, number, number]
): [number, number] {
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

export function isValidBounds(
  bounds: [number, number, number, number]
): boolean {
  return (
    bounds[0] < bounds[2] &&
    bounds[1] < bounds[3] &&
    bounds[0] >= -180 &&
    bounds[2] <= 180 &&
    bounds[1] >= -90 &&
    bounds[3] <= 90
  );
}

export function computeBoundsArea(
  bounds: [number, number, number, number]
): number {
  const width = bounds[2] - bounds[0];
  const height = bounds[3] - bounds[1];
  return width * height;
}

// --- Validation Types ---

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

export function mergeValidationResults(
  results: ValidationResult[]
): ValidationResult {
  return {
    isValid: results.every((r) => r.isValid),
    errors: results.flatMap((r) => r.errors),
    warnings: results.flatMap((r) => r.warnings)
  };
}

// --- GeoArrow Metadata ---

export interface GeoArrowMetadata {
  version: string;
  primary_column: string;
  columns: Record<string, GeoArrowColumnMetadata>;
}

export interface GeoArrowColumnMetadata {
  encoding: string;
  geometry_types: string[];
  bbox: [number, number, number, number];
  crs?: GeoArrowCRS;
  edges?: 'planar' | 'spherical';
}

export interface GeoArrowCRS {
  name?: string;
  id?: { authority: string; code: number };
  wkt?: string;
}

export function isGeoArrowMetadata(obj: unknown): obj is GeoArrowMetadata {
  if (
    typeof obj !== 'object' ||
    obj === null ||
    typeof (obj as Record<string, unknown>).version !== 'string' ||
    typeof (obj as Record<string, unknown>).primary_column !== 'string'
  ) {
    return false;
  }
  const columns = (obj as Record<string, unknown>).columns;
  return typeof columns === 'object' && columns !== null;
}

export function extractBBox(
  metadata: GeoArrowMetadata
): [number, number, number, number] | undefined {
  const primaryColumn = metadata.primary_column;
  const columnMetadata = metadata.columns[primaryColumn];
  return columnMetadata?.bbox;
}

export function extractGeometryTypes(metadata: GeoArrowMetadata): string[] {
  const primaryColumn = metadata.primary_column;
  const columnMetadata = metadata.columns[primaryColumn];
  return columnMetadata?.geometry_types || [];
}

export function extractPrimaryGeometryType(
  metadata: GeoArrowMetadata
): string | undefined {
  const types = extractGeometryTypes(metadata);
  return types.length > 0 ? types[0] : undefined;
}

// --- Column Analysis ---

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

// --- Public API Types ---

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
  type:
    | 'latitude'
    | 'longitude'
    | 'country_name'
    | 'iso2'
    | 'iso3'
    | 'region'
    | 'city'
    | 'coordinates'
    | 'location_name'
    | 'unknown';
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

// --- Dataset Result (main output) ---

export type FileFormat =
  | 'csv'
  | 'geojson'
  | 'shapefile'
  | 'geopackage'
  | 'geoparquet'
  | 'kml'
  | 'kmz'
  | 'unknown';

export interface DatasetMetadata {
  processedAt: Date;
  fileType: string;
  parserUsed: string;
  processingDuration?: number;
  transformations?: string[];
  geoDuckTableReady?: boolean;
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
}

// --- ProcessedDataset (public API compatibility) ---

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
  geometry?:
    | 'Point'
    | 'LineString'
    | 'Polygon'
    | 'MultiPoint'
    | 'MultiLineString'
    | 'MultiPolygon';
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

// --- Pipeline Context ---

export interface PipelineContext {
  duck: typeof Duck;
}

// --- Uploaded File Payload ---

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
}

// --- DuckDB Analytics Column (internal) ---

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
}

// --- File Info ---

export type FileInfo = Pick<File, 'name' | 'size' | 'type'>;
