import type * as duckdb from '@duckdb/duckdb-wasm';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import type { GeoArrowMetadata } from '$lib/features/data-pipeline/models/geo-arrow-metadata';
import { FileType } from '$lib/features/commons/store/create-project.types';
import type { Table } from 'apache-arrow/Arrow';

export { FileType };

// --- Geometry & Dataset Types ---

export type GeometryType = 'point' | 'line' | 'polygon';

export interface Dataset {
  tablename: string;
  filename: string;
  columns?: ColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  type_js: string;
  type_semio?: string;
  score?: number;
}

// --- DuckDB Value Types ---

export type DuckDBValue =
  | string
  | number
  | boolean
  | Date
  | null
  | ArrayBuffer
  | Uint8Array;

export interface DuckDBColumn {
  name: string;
  type: string;
  type_js: string;
}

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
  type_simple: 'numeric' | 'date' | 'string';
  min?: number | Date;
  max?: number | Date;
  histogram?: unknown;
  uniques?: number;
  nulls?: number;
  duplicates?: number;
  count?: number;
  [key: string]: unknown;
}

export type AnalysisResults = AnalysisResult[];

// --- Query Types ---

export type QueryFormat = 'arrow-table' | 'arrow-ipc' | 'array';

export interface QueryOptions {
  format?: QueryFormat;
  useProxy?: boolean;
}

export interface QueryResult<T = unknown> {
  data: T[];
  columns: DuckDBColumn[];
}

export interface ValidationResult<T = DuckDBValue> {
  isValid: boolean;
  value: T;
}

export type DuckDBUnsafeBindings = {
  runQuery(conn: unknown, query: string): Promise<ArrayBuffer | Uint8Array>;
};

// --- Table Types ---

export type TableName = string;
export type ColumnName = string;
export type SQLQuery = string;

export interface TableData {
  tablename: string;
  filename: string;
  columns: DuckDBColumn[];
  analysis?: AnalysisResults | null;
}

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

export interface TableDescribeResult {
  column_name: string;
  column_type: string;
}

export interface CountResult {
  num_rows: number;
}

// --- File Types ---

export interface FileWithId extends File {
  id: string;
}

export interface ReadTabularOptions {
  tablename?: string;
  decimal_separator?: string;
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

export interface GetDataOptions {
  geometry?: boolean;
  columns?: string[];
  limit?: number;
  format?: QueryFormat;
}

// --- Breaks Types ---

export interface CalculateBreaksOptions {
  method?: string;
  nclass?: number;
  nclass_right?: number;
  round?: boolean;
  break_value?: number | null;
}

export interface BreaksResult {
  breaks: number[];
}

export interface BreaksRoundedResult {
  breaks_rounded: number[];
}

export interface BreakInsideResult {
  is_inside: boolean;
  min?: number;
  max?: number;
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

// --- Search Types ---

export interface SearchResultWithScore {
  id: number;
  score: number;
  column: string;
}

export interface SearchStats {
  exactCount: number;
  partialCount: number;
  results: SearchResultWithScore[];
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

export type FilterOperator =
  | 'gte'
  | 'lte'
  | 'contains'
  | 'equals'
  | 'not_equals'
  | 'between'
  | 'top_asc'
  | 'top_desc'
  | 'empty'
  | 'not_empty';

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
  gpsColumns?: { lat: string; lon: string };
}

export interface OrchestratorState {
  datasets: Map<string, DuckDBDataset>;
  currentTableName: string | null;
}

// --- Visualization Types ---

export interface UIState {
  selected_dataset: string;
  current_page: string;
  loading: boolean;
}

export interface VisualizationCriteria {
  id: string;
  label_fr: string;
  nb_column: number;
  type_semio: string[];
  geometry: GeometryType[];
  columns?: string[];
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

export interface DuckDBBindings {
  [key: string]: unknown;
}

export interface DuckDBConnection {
  useUnsafe<T>(
    callback: (bindings: DuckDBBindings, conn: unknown) => Promise<T>
  ): Promise<T>;
}
