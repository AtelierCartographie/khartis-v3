import { FileType } from '$lib/features/commons/store/create-project.types';
import type { GeoArrowMetadata } from '$lib/features/commons/types/geoarrow.types';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import type * as duckdb from '@duckdb/duckdb-wasm';
import type { Table } from 'apache-arrow/Arrow';

export { FileType };

// --- Enums ---

export enum DuckDBSimplifiedType {
  NUMERIC = 'numeric',
  DATE = 'date',
  STRING = 'string',
  GEOMETRY = 'geometry',
  OTHER = 'other'
}

export enum QueryFormatEnum {
  ARROW_TABLE = 'arrow-table',
  ARROW_IPC = 'arrow-ipc',
  ARRAY = 'array'
}

export enum FilterOperatorEnum {
  GTE = 'gte',
  LTE = 'lte',
  CONTAINS = 'contains',
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  BETWEEN = 'between',
  TOP_ASC = 'top_asc',
  TOP_DESC = 'top_desc',
  EMPTY = 'empty',
  NOT_EMPTY = 'not_empty'
}

// --- DuckDB Metadata Types ---

export interface DuckDBMetadata {
  name: string;
  format: string;
  nb_entities: number;
  geometry: string;
  crs: string;
}

// --- Analysis Types ---

export interface AnalysisResult {
  name: string;
  type_simple: DuckDBSimplifiedType | 'numeric' | 'date' | 'string';
  min?: number | Date;
  max?: number | Date;
  histogram?: unknown;
  uniques?: number;
  nulls?: number;
  duplicates?: number;
  count?: number;
  semioType?: 'geoid' | 'geolat' | 'geolon' | 'QTA' | 'QTR' | 'QL' | 'QLO';
  semioScore?: number;
  [key: string]: unknown;
}

export type AnalysisResults = AnalysisResult[];

// --- Query Types ---

// Use QueryFormatEnum values instead of string literals
export type QueryFormat = `${QueryFormatEnum}`;

export interface QueryOptions {
  format?: QueryFormat;
  useProxy?: boolean;
}

export type DuckDBUnsafeBindings = {
  runQuery(conn: unknown, query: string): Promise<ArrayBuffer | Uint8Array>;
};

// --- Table Types ---

export interface TableMetadata {
  analysis?: AnalysisResults | null;
  join: JoinInfo | null;
  filters: Map<number, string>;
  version?: number;
}

export interface JoinInfo {
  id: string;
  join_results_name: string;
  basemap_join_ref: string | null;
}

export type DescribeResult = {
  name: string[];
  type: string[];
};

// --- File Types ---

export interface FileWithId extends File {
  id: string;
}

export interface ReadTabularOptions {
  tablename?: string;
  decimal_separator?: string;
  thousands_separator?: string;
  header?: boolean;
  format?: string;
}

export interface ReadGeofileOptions {
  tablename?: string;
  meta?: boolean;
  shapefile?: boolean;
}

export interface ReadLinkOptions {
  tablename?: string;
  decimal_separator?: string;
}

export interface RegisterFilesOptions {
  shapefile?: boolean;
}

// --- Analysis Options ---

export interface AnalyseOptions {
  force?: boolean;
}

// --- Join Types ---

export interface JoinByIdOptions {
  basemaps_table?: string;
  basemap_table?: string;
  basemap_id?: string;
  basemap_others_id?: string;
}

export interface FinalizeJoinResult {
  joinedBasemap: string;
  geoColumn?: string;
  gpsMode?: boolean;
  gpsColumns?: GPSColumns;
}

// --- Search Types ---

export interface CellSearchResult {
  rowId: number;
  columnName: string;
  value: string;
  score: number; // 1.0=exact, 0.99=contains, <0.99=fuzzy
}

export interface SearchStats {
  exactCount: number; // score === 1.0
  containsCount: number; // score === 0.99
  fuzzyCount: number; // score > threshold && score < 0.99
  totalCount: number;
  results: CellSearchResult[];
  isSampled?: boolean; // true if search was performed on a sample (large table)
}

// --- Cache Types ---

export interface CacheState {
  size: number;
  accessOrder: string[];
}

export interface QueryCacheEntry {
  result: unknown;
  timestamp: number;
  tableVersions: Map<string, number>;
}

// --- Extension State ---

export interface ExtensionsLoaded {
  spatial: boolean;
  httpfs: boolean;
}

export interface ExtensionLoadPromises {
  spatial: Promise<void> | null;
  httpfs: Promise<void> | null;
}

// --- Filter Types ---

export enum RefineOperation {
  UPPERCASE = 'uppercase',
  LOWERCASE = 'lowercase',
  TITLECASE = 'titlecase',
  TRIM = 'trim',
  TRIM_ALL = 'trim_all'
}

// Use FilterOperatorEnum values instead of string literals
export type FilterOperator = `${FilterOperatorEnum}`;

export interface DataTableFilterInput {
  column: string;
  operator: FilterOperator;
  value?: string | number;
  secondaryValue?: string | number;
  limit?: number;
}

export interface DataTableFilter extends DataTableFilterInput {
  id: string;
  label: string;
  sql: string;
}

export interface FilterStats {
  total: number;
  filtered: number;
}

// --- GPS Types ---

export interface GPSColumns {
  lat: string;
  lon: string;
}

export interface GPSBounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

// --- Dataset Types ---

export interface DuckDBDataset {
  id: string;
  tableName: string;
  sourceFileId: string;
  name: string;
  columns: AnalysisResult[];
  rowCount: number;
  metadata: {
    processedAt: Date;
    fileType: FileType;
  };
  geoDetection?: GeoDetectionResult;
  arrowTableWithMetadata?: Table;
  geoArrowMetadata?: GeoArrowMetadata;
  joinedBasemap?: string;
  geoColumn?: string;
  gpsMode?: boolean;
  gpsColumns?: GPSColumns;
}

// --- DuckDB Context (shared state for modules) ---

export interface DuckDBContext {
  db: duckdb.AsyncDuckDB;
  connection: duckdb.AsyncDuckDBConnection;
  loaded_files: Map<string, string>;
  registered_files: Set<string>;
  table_metadata: Map<string, TableMetadata>;
  table_geoparquet_cache: Map<string, Uint8Array>;
  queryCache: Map<string, QueryCacheEntry>;
  describeCache: Map<string, DescribeResult>;
  rowCountCache: Map<string, number>;
  cacheState: CacheState;
  extensionsLoaded: ExtensionsLoaded;
  extensionLoadPromises: ExtensionLoadPromises;
  localExtensionRepositoryConfigured: boolean;
  threadsSupported: boolean;
  bundleVariant: 'eh' | 'mvp';
}

// --- Arrow Types ---

export interface ArrowTableLike {
  get(index: number): Record<string, unknown>;
  numRows: number;
  toArray(): Record<string, unknown>[];
}
