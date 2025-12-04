import type * as duckdb from '@duckdb/duckdb-wasm';
import type {
  AnalysisResults,
  DuckDBValue,
  ValidationResult
} from '../types/index.js';

// --- Constants ---
export const DUCK_CONST = {
  DEFAULT: {
    DECIMAL_SEPARATOR: '.',
    FORMAT_TABULAR: 'csv',
    NULL_VALUES: `['', ':', 'null', 'NULL', 'NA', 'NaN', 'none']`,
    SOURCE: 'user'
  },
  QUERY_FORMAT: {
    ARROW_TABLE: 'arrow-table' as const,
    ARROW_IPC: 'arrow-ipc' as const,
    ARRAY: 'array' as const
  },
  TYPE: {
    TABULAR: 'tabular' as const,
    GEOFILE: 'geofile' as const,
    PARQUET: 'parquet' as const
  },
  REGEX: {
    TABULAR: /\.(csv|tsv|text|txt)/i,
    GEO: /\.(geojson|json|gpkg|kml)/i,
    PARQUET: /\.(parquet|geoparquet)/i,
    COLUMN_VALIDATION_INTEGER: /^-?\d+$/,
    COLUMN_VALIDATION_DOUBLE: /^-?\d+(\.\d+)?$/,
    COLUMN_VALIDATION_BOOLEAN_NUMBER: /[0-1]/,
    COLUMN_VALIDATION_BOOLEAN_STRING: /^(true|false)$/i,
    COLUMN_VALIDATION_DATE:
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})?$/
  }
} as const;

// --- Type Definitions ---
export type QueryFormat =
  (typeof DUCK_CONST.QUERY_FORMAT)[keyof typeof DUCK_CONST.QUERY_FORMAT];
export type FileType = (typeof DUCK_CONST.TYPE)[keyof typeof DUCK_CONST.TYPE];

export interface FileWithId extends File {
  id: string;
}

export interface QueryOptions {
  format?: QueryFormat;
  useProxy?: boolean;
}

export type DuckDBUnsafeBindings = {
  runQuery(conn: unknown, query: string): Promise<ArrayBuffer | Uint8Array>;
};

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

export interface GetDataOptions {
  geometry?: boolean;
  columns?: string[];
  limit?: number;
  format?: QueryFormat;
}

export interface CalculateBreaksOptions {
  method?: string;
  nclass?: number;
  nclass_right?: number;
  round?: boolean;
  break_value?: number | null;
}

export interface AnalyseOptions {
  force?: boolean;
}

export interface JoinByIdOptions {
  basemaps_table?: string;
  basemap_table?: string;
  basemap_id?: string;
  basemap_others_id?: string;
}

export interface RegisterFilesOptions {
  shapefile?: boolean;
}

export type DescribeResult = {
  name: string[];
  type: string[];
};

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

// --- Cache Constants ---
export const CACHE_CONSTANTS = {
  MAX_CACHE_SIZE: 100 * 1024 * 1024,
  GEO_PARQUET_READ_RETRIES: 3,
  GEO_PARQUET_RETRY_DELAY_MS: 15,
  PARQUET_MAGIC: new Uint8Array([0x50, 0x41, 0x52, 0x31])
} as const;

// --- Validation Helpers ---
export { type DuckDBValue, type ValidationResult };
