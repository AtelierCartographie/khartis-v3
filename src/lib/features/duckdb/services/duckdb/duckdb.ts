import {
  DataValidationError,
  DuckDBError,
  TypeInferenceError
} from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { DuckDBBundles } from '@duckdb/duckdb-wasm';
import * as duckdb from '@duckdb/duckdb-wasm';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import { tableFromIPC, type Table } from '@uwdata/flechette';
import { analyse } from './analyse';
import { breaks } from './breaks';
import { join_macros } from './join';

// --- Transaction Mutex ---
class TransactionMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

// --- Constants used by Duck class ---
const DUCK_CONST = {
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
};

// --- HELPER FUNCTIONS ---
type QueryFormat =
  (typeof DUCK_CONST.QUERY_FORMAT)[keyof typeof DUCK_CONST.QUERY_FORMAT];
type FileType = (typeof DUCK_CONST.TYPE)[keyof typeof DUCK_CONST.TYPE];

interface FileWithId extends File {
  id: string;
}

interface QueryOptions {
  format?: QueryFormat;
  useProxy?: boolean;
}

type DuckDBUnsafeBindings = {
  runQuery(conn: unknown, query: string): Promise<ArrayBuffer | Uint8Array>;
};

import type {
  AnalysisResult,
  AnalysisResults,
  ArrowTableLike,
  BreakInsideResult,
  BreaksResult,
  BreaksRoundedResult,
  DuckDBMetadata,
  DuckDBValue,
  ValidationResult
} from './types/index.js';

interface TableMetadata {
  analysis?: AnalysisResults | null;
  join: JoinInfo | null;
  filters: Map<number, string>;
  version?: number; // Used to invalidate cached queries when tables change
}

interface JoinInfo {
  id: string;
  join_results_name: string;
  basemap_join_ref: string | null;
}

interface ReadTabularOptions {
  tablename?: string;
  decimal_separator?: string;
  format?: string;
}

interface ReadGeofileOptions {
  tablename?: string;
  meta?: boolean;
  shapefile?: boolean;
}

interface ReadLinkOptions {
  tablename?: string;
  decimal_separator?: string;
}

interface GetDataOptions {
  geometry?: boolean;
  columns?: string[];
  limit?: number;
  format?: QueryFormat;
}

interface CalculateBreaksOptions {
  method?: string;
  nclass?: number;
  nclass_right?: number;
  round?: boolean;
  break_value?: number | null;
}

interface AnalyseOptions {
  force?: boolean;
}

interface JoinByIdOptions {
  basemaps_table?: string;
  basemap_table?: string;
  basemap_id?: string;
  basemap_others_id?: string;
}

interface RegisterFilesOptions {
  shapefile?: boolean;
}

type DescribeResult = {
  name: string[];
  type: string[];
};

/**
 * Normalizes a string by removing accents, special characters, etc.
 * @param {string} str The string to normalize.
 * @returns {string} The normalized string.
 */
function normalize_name(str: string): string {
  let normalized = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\.\.|[/\\\\])/g, '')
    .replace(/[^a-zA-Z0-9_.]/g, '_');

  if (/^[0-9]/.test(normalized)) {
    normalized = 'a_' + normalized;
  }

  const maxLength = 150;
  if (normalized.length > maxLength) {
    normalized = normalized.substring(0, maxLength);
  }

  return normalized;
}

/**
 * Extract the filename from an url.
 * @param {string} url The url.
 * @returns {string} filename The filename.
 */
function extract_filename(url: string): string {
  return url.split('/').pop() || '';
}

/**
 * Get the type of file.
 * @param {string} filename The filename.
 * @returns {string} The type of file.
 */
function get_file_type(filename: string): FileType {
  if (DUCK_CONST.REGEX.TABULAR.test(filename)) return DUCK_CONST.TYPE.TABULAR;
  if (DUCK_CONST.REGEX.GEO.test(filename)) return DUCK_CONST.TYPE.GEOFILE;
  if (DUCK_CONST.REGEX.PARQUET.test(filename)) return DUCK_CONST.TYPE.PARQUET;
  return DUCK_CONST.TYPE.TABULAR;
}

/**
 * Generates a unique table name from a filename.
 * @param {string} filename The original filename.
 * @param {Map<string, string>} existingNames A Map where keys are existing table names.
 * @returns {string} A unique table name.
 */
function generate_unique_table_name(
  filename: string,
  existingNames: Map<string, string>
): string {
  const split_filename = (name: string): string => {
    const index = name.indexOf('.');
    if (index === -1) return name;
    return name.slice(0, index);
  };
  let tablename = normalize_name(filename);
  let counter = 1;
  tablename = split_filename(tablename);
  while (existingNames.has(tablename)) {
    tablename = `${tablename}_${counter}`;
    counter++;
  }
  return tablename;
}

/**
 * Adds a unique identifier to a file object.
 * The ID is a combination of the file's last modified timestamp and a normalized version of its name.
 * This ensures each file has a distinct identifier, even if multiple files share the same name.
 *
 * @param {Object} file - The file object to which the ID will be added.
 * @param {number} file.lastModified - The last modified time of the file.
 * @param {string} file.name - The name of the file.
 */
function add_file_id(file: FileWithId): void {
  file.id = file.lastModified + '-' + normalize_name(file.name);
}

/**
 * Check if the value is an integer.
 * @param {number|string} value - The value to validate.
 * @returns {boolean} - Returns true if the value is a valid integer, otherwise false.
 */
const isValidInteger = (value: number | string): boolean =>
  (typeof value === 'number' && Number.isInteger(value)) ||
  (typeof value === 'string' &&
    DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test(value));

/**
 * Check if the value is a float.
 * @param {number|string} value - The value to validate.
 * @returns {boolean} - Returns true if the value is a valid float, otherwise false.
 */
const isValidFloat = (value: number | string): boolean =>
  typeof value === 'number' ||
  (typeof value === 'string' &&
    DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test(value));

/**
 * Check if the value is a boolean.
 * @param {number|string|boolean} value - The value to validate.
 * @returns {boolean} - Returns true if the value is a valid boolean, otherwise false.
 */
const isValidBoolean = (value: number | string | boolean): boolean =>
  typeof value === 'boolean' ||
  typeof value === 'number' ||
  (typeof value === 'string' &&
    (DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_STRING.test(value) ||
      DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_NUMBER.test(value)));

/**
 * Validates and potentially casts a value based on a specified column type.
 * @param {*} new_value The value to validate.
 * @param {string} column_type The type of the column.
 * @returns {{isValid: boolean, value: *}} An object with isValid and the potentially cast value.
 */
function validate_and_cast_value(
  new_value: unknown,
  column_type: string
): ValidationResult {
  let isValid = false;
  let value: DuckDBValue = new_value as DuckDBValue;

  switch (column_type.toLowerCase()) {
    case 'integer':

    /* falls through */
    case 'bigint':
      isValid = isValidInteger(new_value as string | number);
      value =
        typeof new_value === 'string'
          ? parseInt(new_value, 10)
          : (new_value as number);
      break;

    case 'number':
      isValid = isValidFloat(new_value as string | number);
      value =
        typeof new_value === 'string'
          ? parseFloat(new_value)
          : (new_value as number);
      break;

    case 'string':
      isValid = true;
      value = String(new_value);
      break;

    case 'boolean':
      isValid = isValidBoolean(new_value as string | number | boolean);
      if (typeof new_value === 'number' || typeof new_value === 'boolean')
        value = Boolean(new_value);
      else if (typeof new_value === 'string') {
        if (new_value.toLowerCase() === 'true' || new_value === '1')
          value = true;
        if (new_value.toLowerCase() === 'false' || new_value === '0')
          value = false;
      }
      break;

    case 'date':
      if (
        new_value instanceof Date ||
        (typeof new_value === 'string' && !isNaN(Date.parse(new_value)))
      ) {
        isValid = true;
        if (!(new_value instanceof Date)) value = new Date(new_value);
      }
      break;

    case 'geometry':

    /* falls through */
    case 'other':

    /* falls through */
    default:
      throw new TypeInferenceError(
        `Unsupported column type: ${column_type}.`,
        undefined,
        {
          columnType: column_type
        }
      );
  }
  return { isValid, value };
}

// --- DuckDB Class ---
/**
 * DuckDB class provides an interface to interact with DuckDB, a high-performance analytical database.
 * It supports operations such as initializing the database, reading tabular data, registering files,
 * generating unique table names, and performing spatial operations.
 *
 * @class DuckDB
 * @property {Object} db - The DuckDB instance.
 * @property {Object} connection - The connection to the DuckDB instance.
 * @property {Map} loaded_files - A map storing table names and their corresponding filenames.
 * @property {Set} registered_files - A set storing registered files.
 * @property {Map} table_metadata - A map storing metadata for each table (analysis, filters, join associations).
 *
 *
 * @method constructor() - Initializes a new instance of the DuckDB class.
 * @method init() - Initializes the DuckDB instance and connects to the database.
 * @method close() - Closes the DuckDB connection.
 * @method reset() - Resets the DuckDB instance but keeps the database open and the session.
 * @method #add_row_id(table) - Adds a row ID column to a specified table.
 * @method query(query, options) - Executes a SQL query and returns the result in the specified format.
 * @method register_files(files, options) - Registers files with the DuckDB instance.
 * @method get_loaded_files() - Retrieves the list of loaded files.
 * @method #get_table_metadata() - Retrieves the metadata for a given table.
 * @method read_tabular(input, options) - Reads tabular data from a given input and creates a table in DuckDB.
 * @method read_geofile(geofile, options) - Reads a geofile and optionally retrieves its metadata or creates a table from it.
 * @method read_link(url, options) - Reads a file from a given URL and creates a table in the database.
 * @method describe_table(table) - Describes the structure of a specified table by querying its columns.
 * @method get_row_count(table) - Retrieves the row count of a specified table.
 * @method get_data(table, options) - Retrieves data from the specified table as an arrow table.
 * @method sort_table(table, column, order) - Sorts a table by a specified column in the given order.
 * @method rename_column(table, old_name, new_name) - Renames a column in a specified table.
 * @method change_column_type(table, column, new_type) - Changes the data type of a specified column in a given table.
 * @method change_column_case(table, column, caseType) - Changes the case of all values in a specified column of a table.
 * @method trim_column(table, column) - Trims whitespace from the specified column in the given table.
 * @method drop_column(table, column) - Drops a column from a specified table in the database.
 * @method drop_rows(table, rows_id) - Drops rows from a specified table where the column value matches the specified value.
 * @method update_cell(table, id_column, id_value, column, new_value) - Update a cell value in the table.
 * @method add_filter(table, key_index, filter) - Adds a filter to the specified table.
 * @method remove_filter(table, key_index) - Removes a filter from the specified table.
 * @method apply_filters(table) - Applies the filters and executes the query for a specific table.
 * @method latlon_to_point(table, columns) - Converts latitude and longitude columns to a geometric point and adds it to the specified table.
 * @method copy_to_geoparquet_as_buffer(table) - Copies a table to a GeoParquet file with ZSTD compression and returns it as a buffer.
 * @method export_table(table, format) - Exports a table to a specified format (CSV, Parquet, or GeoParquet).
 * @method calculate_class_breaks(table, column, options) - Retrieves break points for a specified column in a table using various methods.
 * @method add_class(table, column, breaks) - Adds a classification column to the specified table based on the provided breaks.
 * @method analyse(table) - Analyzes the specified table and returns various statistical summaries and histograms.
 * @method join_by_id(table, table_id, options) - Joins a table to one or multiple basemaps based on the similarity of an ID column.
 * @method apply_join_association(table, basemap) - Applies a join association to a table based on a previously performed join operation.
 */
class DuckDB {
  public db: duckdb.AsyncDuckDB | null = null;

  public connection: duckdb.AsyncDuckDBConnection | null = null;

  public loaded_files: Map<string, string> = new Map();

  public registered_files: Set<string> = new Set();

  private queryCache = new Map<
    string,
    {
      result: unknown;
      timestamp: number;
      tableVersions: Map<string, number>;
    }
  >();

  private readonly CACHE_MAX_AGE = 60000; // ms TTL for query cache

  private readonly CACHE_MAX_SIZE = 100;

  public table_metadata: Map<string, TableMetadata> = new Map();

  public table_geoparquet_cache: Map<string, Uint8Array> = new Map();

  private readonly MAX_CACHE_SIZE = 100 * 1024 * 1024;

  private readonly GEO_PARQUET_READ_RETRIES = 3;

  private readonly GEO_PARQUET_RETRY_DELAY_MS = 15;

  private readonly PARQUET_MAGIC = new Uint8Array([0x50, 0x41, 0x52, 0x31]);

  private describeCache = new Map<string, DescribeResult>();

  private rowCountCache = new Map<string, number>();

  private cacheState: {
    size: number;
    accessOrder: string[];
  } = {
    size: 0,
    accessOrder: []
  };

  private extensionsLoaded = {
    spatial: false,
    httpfs: false
  };

  private extensionLoadPromises = {
    spatial: null as Promise<void> | null,
    httpfs: null as Promise<void> | null
  };

  private threadsSupported = false;

  private transactionMutex = new TransactionMutex();

  constructor() {}

  private evictGeoParquetEntry(table: string): void {
    if (!this.table_geoparquet_cache.has(table)) {
      return;
    }

    const cachedBuffer = this.table_geoparquet_cache.get(table);
    if (cachedBuffer) {
      this.cacheState.size -= cachedBuffer.byteLength;
    }

    this.table_geoparquet_cache.delete(table);
    const index = this.cacheState.accessOrder.indexOf(table);
    if (index > -1) {
      this.cacheState.accessOrder.splice(index, 1);
    }
  }

  invalidateTableCache(table: string): void {
    this.describeCache.delete(table);
    this.rowCountCache.delete(table);
  }

  private markTableMutated(table: string): void {
    this.invalidateTableCache(table);
    this.evictGeoParquetEntry(table);
    this.invalidateCacheForTable(table);
  }

  private getCachedQuery(sql: string, tables: string[] = []): unknown | null {
    const cacheKey = this.generateCacheKey(sql);
    const cached = this.queryCache.get(cacheKey);

    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.CACHE_MAX_AGE) {
      this.queryCache.delete(cacheKey);
      return null;
    }

    for (const table of tables) {
      const currentVersion = this.table_metadata.get(table)?.version || 0;
      const cachedVersion = cached.tableVersions.get(table) || 0;
      if (currentVersion !== cachedVersion) {
        this.queryCache.delete(cacheKey);
        return null;
      }
    }

    logger.debug('Cache hit for query', LogCategory.DUCKDB, {
      sql: sql.substring(0, 100)
    });
    return cached.result;
  }

  private setCachedQuery(
    sql: string,
    result: unknown,
    tables: string[] = []
  ): void {
    const cacheKey = this.generateCacheKey(sql);

    if (this.queryCache.size >= this.CACHE_MAX_SIZE) {
      const firstKey = this.queryCache.keys().next().value;
      if (firstKey) this.queryCache.delete(firstKey);
    }

    const tableVersions = new Map<string, number>();
    for (const table of tables) {
      const version = this.table_metadata.get(table)?.version || 0;
      tableVersions.set(table, version);
    }

    this.queryCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      tableVersions
    });
  }

  private generateCacheKey(sql: string): string {
    return sql.trim().toLowerCase();
  }

  private invalidateCacheForTable(table: string): void {
    for (const [key, cached] of this.queryCache.entries()) {
      if (cached.tableVersions.has(table)) {
        this.queryCache.delete(key);
      }
    }
  }

  clearQueryCache(): void {
    this.queryCache.clear();
  }

  private calculateOptimalMemory(): string {
    if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
      const deviceMemory =
        (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
      const optimalMemory = Math.min(
        Math.floor(deviceMemory * 0.5 * 1024),
        3072
      );
      logger.info(
        'Dynamic memory allocation based on device',
        LogCategory.DUCKDB,
        {
          deviceMemory: `${deviceMemory}GB`,
          allocatedMemory: `${optimalMemory}MB`
        }
      );
      return `${optimalMemory}MB`;
    }
    return '2048MB';
  }

  private async configureRuntimeSettings(): Promise<void> {
    const start = performance.now();
    const pragmas: string[] = [
      `PRAGMA memory_limit='${this.calculateOptimalMemory()}';`,
      `PRAGMA enable_progress_bar=false;`,
      `PRAGMA preserve_insertion_order=false;`, // Allow query optimizer to reorder
      `PRAGMA enable_object_cache=true;`, // Cache parsed objects
      `PRAGMA temp_directory='/tmp/duckdb';`, // Enable disk spilling for large operations
      `PRAGMA max_temp_directory_size='5GB';` // Limit temp space usage
    ];

    if (this.threadsSupported) {
      const desiredThreads =
        typeof navigator !== 'undefined' && navigator.hardwareConcurrency
          ? Math.max(1, Math.min(navigator.hardwareConcurrency, 8))
          : 4;
      pragmas.unshift(`PRAGMA threads=${desiredThreads};`);
      logger.info('Configuring DuckDB threads', LogCategory.DUCKDB, {
        desiredThreads
      });
    }

    for (const pragma of pragmas) {
      await this.query(pragma, { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC });
    }

    try {
      await this.query('INSTALL httpfs; LOAD httpfs;', {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      });
      logger.debug('HTTPFS extension loaded', LogCategory.DUCKDB);
    } catch (error) {
      logger.warn('Failed to load HTTPFS extension', LogCategory.DUCKDB, error);
    }

    logger.debug('Runtime settings applied', LogCategory.DUCKDB, {
      durationMs: (performance.now() - start).toFixed(2)
    });
  }

  private async runInTransaction(
    callback: () => Promise<void>,
    context = 'transaction'
  ): Promise<void> {
    if (!this.connection) {
      throw new DuckDBError('Connection not established');
    }
    const start = performance.now();

    await this.transactionMutex.acquire();

    try {
      logger.debug('Starting DuckDB transaction', LogCategory.DUCKDB, {
        context
      });
      await this.connection.query('BEGIN TRANSACTION;');
      try {
        await callback();
        await this.connection.query('COMMIT;');
        logger.info('DuckDB transaction committed', LogCategory.DUCKDB, {
          context,
          durationMs: (performance.now() - start).toFixed(2)
        });
      } catch (error) {
        await this.connection.query('ROLLBACK;');
        logger.error('DuckDB transaction rolled back', LogCategory.DUCKDB, {
          context,
          durationMs: (performance.now() - start).toFixed(2),
          error
        });
        throw error;
      }
    } finally {
      this.transactionMutex.release();
    }
  }

  private async dropRegisteredFile(fileId: string | undefined): Promise<void> {
    if (!fileId || !this.db) {
      return;
    }
    try {
      await this.db.dropFile(fileId);
    } catch (error) {
      logger.warn('Failed to drop registered DuckDB file', LogCategory.DUCKDB, {
        fileId,
        error
      });
    } finally {
      this.registered_files.delete(fileId);
    }
  }

  // New DuckDb instance + spatial extension
  async init(): Promise<void> {
    const startTime = performance.now();
    logger.info('DuckDB initialization started', LogCategory.DUCKDB);

    try {
      const bundleStart = performance.now();
      // Select a bundle based on browser checks
      const MANUAL_BUNDLES: DuckDBBundles = {
        mvp: {
          mainModule: duckdb_wasm,
          mainWorker: mvp_worker
        },
        eh: {
          mainModule: duckdb_wasm_eh,
          mainWorker: eh_worker
        }
      };
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
      const bundleVariant = bundle === MANUAL_BUNDLES.eh ? 'eh' : 'mvp';
      this.threadsSupported = Boolean(bundle.pthreadWorker);
      logger.debug('DuckDB bundle selected', LogCategory.DUCKDB, {
        bundleVariant,
        threadsSupported: this.threadsSupported,
        durationMs: (performance.now() - bundleStart).toFixed(2)
      });

      const workerStart = performance.now();
      const worker = new Worker(bundle.mainWorker!);
      logger.debug('DuckDB worker created', LogCategory.DUCKDB, {
        durationMs: (performance.now() - workerStart).toFixed(2)
      });

      const dbCreateStart = performance.now();
      const duckdbLogger = new duckdb.ConsoleLogger();
      // Instantiate the asynchronous version of DuckDB-wasm
      this.db = new duckdb.AsyncDuckDB(duckdbLogger, worker);
      logger.debug('AsyncDuckDB instance ready', LogCategory.DUCKDB, {
        durationMs: (performance.now() - dbCreateStart).toFixed(2)
      });

      const instantiateStart = performance.now();
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      logger.debug('DuckDB WASM instantiated', LogCategory.DUCKDB, {
        durationMs: (performance.now() - instantiateStart).toFixed(2)
      });

      const openStart = performance.now();
      await this.db.open({
        filesystem: { allowFullHTTPReads: true, reliableHeadRequests: true },
        query: { castBigIntToDouble: false }
      });
      logger.debug('DuckDB database opened', LogCategory.DUCKDB, {
        durationMs: (performance.now() - openStart).toFixed(2)
      });

      const connectStart = performance.now();
      this.connection = await this.db.connect();
      logger.debug('DuckDB connection established', LogCategory.DUCKDB, {
        durationMs: (performance.now() - connectStart).toFixed(2)
      });

      const macrosStart = performance.now();
      // load all macro for discretization, data analysis and join operations
      await this.query(breaks + analyse + join_macros, {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      });
      logger.debug('Custom macros registered', LogCategory.DUCKDB, {
        durationMs: (performance.now() - macrosStart).toFixed(2)
      });

      await this.configureRuntimeSettings();

      await this.preloadExtensions();

      this.clearGeoParquetCache();
      logger.debug('GeoParquet cache initialized', LogCategory.DUCKDB);

      logger.success('DuckDB initialization complete', LogCategory.DUCKDB, {
        totalDurationMs: (performance.now() - startTime).toFixed(2)
      });
    } catch (error) {
      logger.error('Failed to initialize DuckDB', LogCategory.DUCKDB, {
        duration: `${(performance.now() - startTime).toFixed(2)}ms`,
        error
      });
      throw error;
    }
  }

  /**
   * Close DuckDB connection.
   */
  async close(): Promise<void> {
    await this.connection?.close();
  }

  /**
   * Reset the DuckDB instance but keep the database open and the session.
   */
  async reset(): Promise<void> {
    this.loaded_files.clear();
    this.registered_files.clear();
    this.table_metadata.clear();
    this.table_geoparquet_cache.clear();
    this.describeCache.clear();
    this.rowCountCache.clear();
    this.cacheState.accessOrder = [];
    this.cacheState.size = 0;
    this.extensionsLoaded.spatial = false;
    this.extensionsLoaded.httpfs = false;
    this.extensionLoadPromises.spatial = null;
    this.extensionLoadPromises.httpfs = null;
    await this.connection?.close();
    await this.db?.dropFiles();
    await this.db?.reset();
  }

  /**
   * Preload common extensions in parallel to avoid runtime delays.
   */
  private async preloadExtensions(): Promise<void> {
    const startTime = performance.now();
    logger.info('Preloading DuckDB extensions', LogCategory.DUCKDB);

    const extensionPromises: Promise<void>[] = [];

    extensionPromises.push(this.loadSpatialExtension());
    extensionPromises.push(this.loadHTTPFSExtension());
    extensionPromises.push(this.loadParquetExtension());

    const results = await Promise.allSettled(extensionPromises);

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    logger.success('Extensions preloaded', LogCategory.DUCKDB, {
      successful,
      failed,
      totalDurationMs: (performance.now() - startTime).toFixed(2)
    });

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const extensionName = ['spatial', 'httpfs', 'parquet'][index];
        logger.warn(
          `Failed to preload ${extensionName} extension`,
          LogCategory.DUCKDB,
          {
            reason: result.reason
          }
        );
      }
    });
  }

  private async loadSpatialExtension(): Promise<void> {
    if (this.extensionsLoaded.spatial) {
      return;
    }

    const start = performance.now();
    try {
      await this.query(`INSTALL spatial; LOAD spatial;`, {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      });
      this.extensionsLoaded.spatial = true;
      logger.debug('Spatial extension preloaded', LogCategory.DUCKDB, {
        durationMs: (performance.now() - start).toFixed(2)
      });
    } catch (error) {
      logger.error('Failed to preload spatial extension', LogCategory.DUCKDB, {
        error
      });
    }
  }

  private async loadHTTPFSExtension(): Promise<void> {
    if (this.extensionsLoaded.httpfs) {
      return;
    }

    const start = performance.now();
    try {
      await this.query(`INSTALL httpfs; LOAD httpfs;`, {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      });
      this.extensionsLoaded.httpfs = true;
      logger.debug('HTTPFS extension preloaded', LogCategory.DUCKDB, {
        durationMs: (performance.now() - start).toFixed(2)
      });
    } catch (error) {
      logger.error('Failed to preload HTTPFS extension', LogCategory.DUCKDB, {
        error
      });
    }
  }

  private async loadParquetExtension(): Promise<void> {
    const start = performance.now();
    try {
      await this.query(`INSTALL parquet; LOAD parquet;`, {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      });
      logger.debug('Parquet extension preloaded', LogCategory.DUCKDB, {
        durationMs: (performance.now() - start).toFixed(2)
      });
    } catch {
      logger.debug(
        'Parquet extension already loaded or not needed',
        LogCategory.DUCKDB
      );
    }
  }

  /**
   * Ensure spatial extension is loaded (now mostly a no-op due to preloading)
   * This is kept for backward compatibility
   */
  async ensureSpatialExtension(): Promise<void> {
    if (this.extensionsLoaded.spatial) {
      return;
    }

    if (this.extensionLoadPromises.spatial) {
      return this.extensionLoadPromises.spatial;
    }

    this.extensionLoadPromises.spatial = this.loadSpatialExtension();
    await this.extensionLoadPromises.spatial;
    this.extensionLoadPromises.spatial = null;
  }

  /**
   * Ensure HTTPFS extension is loaded (now mostly a no-op due to preloading)
   * This is kept for backward compatibility
   */
  async ensureHTTPFSExtension(): Promise<void> {
    if (this.extensionsLoaded.httpfs) {
      return;
    }

    if (this.extensionLoadPromises.httpfs) {
      return this.extensionLoadPromises.httpfs;
    }

    this.extensionLoadPromises.httpfs = this.loadHTTPFSExtension();
    await this.extensionLoadPromises.httpfs;
    this.extensionLoadPromises.httpfs = null;
  }

  /**
   * Adds a row ID column to a specified table.
   *
   * @param {string} table - The name of the table to add the row ID column to.
   */
  private async add_row_id(table: string): Promise<void> {
    await this.query(`CREATE OR REPLACE SEQUENCE id_${table} START 1;`, {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    });
    await this.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS __id INTEGER DEFAULT nextval('id_${table}');`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
    );
  }

  /**
   * Executes a SQL query and returns the result in the specified format.
   * The default format is an Arrow table.
   * Use @uwdata/flechette under the hood to convert Arrow buffer (IPC) to Arrow table.
   *
   * @param {string} query - The SQL query to execute.
   * @param {Object} [options={}] - Optional settings for the query execution.
   * @param {string} [options.format='arrow-table'] - The format of the result. Can be 'arrow-table', 'arrow-ipc', or 'array'.
   * @param {boolean} [options.useProxy=true] - Whether to use Proxy object for performance optimization.
   * @returns {Promise<*>} - The result of the query in the specified format.
   */
  async query(query: string, options: QueryOptions = {}): Promise<unknown> {
    const { format = DUCK_CONST.QUERY_FORMAT.ARROW_TABLE, useProxy = true } =
      options;

    // Return an Arrow table with Flechette
    // 1. return an arrow IPC (buffer)
    const buffer = await this.connection!.useUnsafe(
      async (bindings: DuckDBUnsafeBindings, conn: unknown) => {
        return await bindings.runQuery(conn, query);
      }
    );
    if (format === DUCK_CONST.QUERY_FORMAT.ARROW_IPC) return buffer;

    // 2. Return an Arrow table with Flechette
    const table = tableFromIPC(buffer, {
      useBigInt: true,
      useDate: true,
      useDecimalInt: false,
      useMap: true,
      useProxy // Le véritable gain de performance se fait avec l'utilisation de Proxy
    });
    if (format === DUCK_CONST.QUERY_FORMAT.ARROW_TABLE) return table;

    // 3. Return an array with proxy or a pure js array of objects
    if (format === DUCK_CONST.QUERY_FORMAT.ARRAY) return table.toArray();
  }

  /**
   * Registers a list of files with the DuckDB database.
   *
   * This method iterates over the provided files, assigns an ID to each file,
   * and registers the file with the DuckDB database if it hasn't been registered already.
   *
   * @async
   * @param {File[]} files - An array of File objects to be registered.
   * @param {Object} [options={}] - Optional parameters.
   * @param {boolean} [options.shapefile=false] - If true, all sibling files will have the same id, necessary for the spatial extension.
   * @returns {Promise<void>} - A promise that resolves when all files are registered.
   */
  async register_files(
    files: File[],
    options: RegisterFilesOptions = {}
  ): Promise<void> {
    const { shapefile = false } = options;
    let shape_date: number | undefined;
    if (shapefile) {
      const shp = files.reverse().find((file) => file.name.endsWith('.shp'));
      shape_date = shp?.lastModified;
    }
    for (const file of files) {
      const fileWithId = file as FileWithId;
      if (shapefile && shape_date) {
        fileWithId.id = shape_date + '-' + normalize_name(file.name);
      } else {
        add_file_id(fileWithId);
      }
      if (this.registered_files.has(fileWithId.id)) {
        continue;
      }
      await this.db!.registerFileHandle(
        fileWithId.id,
        file,
        duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
        true
      );
      this.registered_files.add(fileWithId.id);
    }
  }

  /**
   * Retrieves the list of loaded files.
   *
   * @returns {Array<{tablename: string, filename: string}>} An array of objects, each containing:
   *   - {string} tablename - The name of the table in the database.
   *   - {string} filename - The original filename associated with the table.
   *
   */
  get_loaded_files(): Array<{ tablename: string; filename: string }> {
    if (this.loaded_files.size === 0) return [];
    return Array.from(this.loaded_files, ([tablename, filename]) => ({
      tablename,
      filename
    }));
  }

  /**
   * Retrieves the metadata for a given table.
   *
   * @param {string} table - The name of the table.
   * @returns {Object} - The metadata object for the table, containing:
   *   - {Object|null} analysis - The analysis results for the table, or null if not analyzed.
   *   - {Object|null} join - The join association information for the table, or null if no join has been performed.
   *     - {string} id - The name of the ID column used for the join.
   *     - {string} join_results_name - The name of the table containing the join results.
   *     - {string|null} basemap_join_ref - The name of the basemap join reference table, or null if not applicable.
   *   - {Map<number, string>} filters - A map of filters applied to the table, where the key is the filter index and the value is the filter condition.
   */
  private get_table_metadata(table: string): TableMetadata {
    if (!this.table_metadata.has(table))
      this.table_metadata.set(table, {
        analysis: null,
        join: null,
        filters: new Map()
      });
    return this.table_metadata.get(table)!;
  }

  /**
   * Reads tabular data from a given input and creates a table in DuckDB.
   *
   * @async
   * @param {string|File} input - The input data, either a string or a File object.
   * @param {Object} [options] - Optional parameters.
   * @param {string} [options.tablename] - The name of the table to create. If not provided, a unique name will be generated.
   * @param {string} [options.decimal_separator=','] - The decimal separator used in the CSV data.
   * @param {string} [options.format='csv'] - The format of the input data. Can be 'csv' or 'parquet'.
   * @returns {Promise<string>} - The name of the created table.
   * @throws {Error} - Throws an error if the input type is invalid or if the table creation fails.
   */
  async read_tabular(
    input: string | File,
    options: ReadTabularOptions = {}
  ): Promise<string> {
    const start = performance.now();
    let { tablename } = options;
    const decimal_separator =
      options.decimal_separator ?? DUCK_CONST.DEFAULT.DECIMAL_SEPARATOR;
    const format = options.format ?? DUCK_CONST.DEFAULT.FORMAT_TABULAR;
    let filename: string; // original filename
    let fileid: string; // filename use for registering the file in DuckDB
    let cleanupFileId: string | undefined;

    const sourceType = typeof input === 'string' ? 'text' : 'file';
    logger.info('Ingesting tabular data into DuckDB', LogCategory.DUCKDB, {
      tablename,
      sourceType
    });

    try {
      // input = COPY-PASTE
      if (typeof input === 'string') {
        if (!tablename)
          tablename = generate_unique_table_name(
            'data_paste',
            this.loaded_files
          );
        filename = tablename;
        fileid = tablename;
        await this.db!.registerFileText(fileid, input);
        this.registered_files.add(fileid);
        cleanupFileId = fileid;
      } else if (input instanceof File) {
        // input = FILE
        filename = input.name;

        if (!tablename)
          tablename = generate_unique_table_name(filename, this.loaded_files);

        await this.register_files([input]);
        fileid = (input as FileWithId).id;
      } else {
        throw new DataValidationError(
          'Invalid input type. Expected a string or a File.',
          undefined,
          { receivedType: typeof input }
        );
      }

      // Read the tabular data and create a table
      await this.runInTransaction(async () => {
        if (!tablename) {
          throw new DuckDBError('Unable to determine target table name');
        }
        if (format === DUCK_CONST.DEFAULT.FORMAT_TABULAR) {
          const query = `CREATE OR REPLACE TABLE ${tablename} AS FROM read_csv('${fileid}', header=true, decimal_separator="${decimal_separator}", normalize_names=true, nullstr=${DUCK_CONST.DEFAULT.NULL_VALUES});`;
          await this.query(query, {
            format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
          });
        }
        if (format === DUCK_CONST.TYPE.PARQUET) {
          await this.query(
            `CREATE OR REPLACE TABLE ${tablename} AS FROM read_parquet('${fileid}');`,
            { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
          );
        }
        await this.add_row_id(tablename!);
      }, 'read_tabular');

      if (!tablename) {
        throw new DuckDBError('Unable to determine target table name');
      }

      this.loaded_files.set(tablename, filename);
      this.markTableMutated(tablename);
      logger.success('Tabular data ingested', LogCategory.DUCKDB, {
        tablename,
        filename,
        durationMs: (performance.now() - start).toFixed(2)
      });
      return tablename;
    } catch (error) {
      logger.error('Failed to read tabular data', LogCategory.DUCKDB, error);
      throw error;
    } finally {
      if (cleanupFileId) {
        await this.dropRegisteredFile(cleanupFileId);
      }
    }
  }

  async read_geofile(
    geofile: File,
    options: ReadGeofileOptions = {}
  ): Promise<DuckDBMetadata | string> {
    const start = performance.now();
    let { tablename } = options;
    const meta = options.meta ?? false;
    const shapefile = options.shapefile ?? false;
    try {
      await this.ensureSpatialExtension();

      await this.register_files([geofile], { shapefile });
      const geofileWithId = geofile as FileWithId;
      if (meta) {
        const result = await this
          .query(`FROM ST_Read_Meta('${geofileWithId.id}')
					SELECT
						file_name AS name,
						driver_short_name AS format,
						layers[1].feature_count AS nb_entities,
						layers[1].geometry_fields[1].type AS geometry,
						layers[1].geometry_fields[1].crs.name AS crs`);
        return result as DuckDBMetadata;
      }
      if (!tablename) {
        tablename = generate_unique_table_name(geofile.name, this.loaded_files);
      }

      await this.runInTransaction(async () => {
        await this.query(
          `CREATE OR REPLACE TABLE ${tablename} AS FROM ST_Read('${geofileWithId.id}');`,
          {
            format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
          }
        );
        await this.add_row_id(tablename!);
      }, 'read_geofile');

      if (!tablename) {
        throw new DuckDBError('Unable to determine target table name');
      }

      this.loaded_files.set(tablename, geofile.name);
      this.markTableMutated(tablename);
      logger.success('Geofile ingested', LogCategory.DUCKDB, {
        tablename,
        filename: geofile.name,
        durationMs: (performance.now() - start).toFixed(2)
      });
      return tablename;
    } catch (error) {
      logger.error('Failed to read geofile', LogCategory.DUCKDB, error);
      throw error;
    }
  }

  async read_link(url: string, options: ReadLinkOptions = {}): Promise<string> {
    const start = performance.now();
    let { tablename } = options;
    const decimal_separator =
      options.decimal_separator ?? DUCK_CONST.DEFAULT.DECIMAL_SEPARATOR;

    const filename = extract_filename(url);
    const file_type = get_file_type(filename);

    if (!tablename)
      tablename = generate_unique_table_name(filename, this.loaded_files);
    logger.info('Ingesting remote file into DuckDB', LogCategory.DUCKDB, {
      url,
      filename,
      inferredType: file_type,
      tablename
    });
    await this.db!.registerFileURL(
      filename,
      url,
      duckdb.DuckDBDataProtocol.HTTP,
      false
    );

    try {
      await this.runInTransaction(async () => {
        if (!tablename) {
          throw new DuckDBError('Unable to determine target table name');
        }
        switch (file_type) {
          case DUCK_CONST.TYPE.TABULAR:
            await this.query(
              `CREATE OR REPLACE TABLE ${tablename} AS FROM read_csv('${filename}', header=true, decimal_separator="${decimal_separator}", normalize_names=true, nullstr=${DUCK_CONST.DEFAULT.NULL_VALUES});`,
              { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
            );
            break;

          case DUCK_CONST.TYPE.PARQUET:
            await this.query(
              `CREATE OR REPLACE TABLE ${tablename} AS FROM read_parquet('${filename}');`,
              { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
            );
            break;

          case DUCK_CONST.TYPE.GEOFILE:
            await this.query(
              `CREATE OR REPLACE TABLE ${tablename} AS FROM ST_Read('${filename}');`,
              {
                format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
              }
            );
            break;
        }
        await this.add_row_id(tablename);
      }, 'read_link');
      if (!tablename) {
        throw new DuckDBError('Unable to determine target table name');
      }

      this.loaded_files.set(tablename, filename);
      this.markTableMutated(tablename);
      logger.success('Remote file ingested', LogCategory.DUCKDB, {
        tablename,
        filename,
        durationMs: (performance.now() - start).toFixed(2)
      });
      return tablename;
    } catch (error) {
      logger.error('Failed to read file url', LogCategory.DUCKDB, error);
      throw error;
    }
  }

  async describe_table(
    table: string
  ): Promise<{ name: string[]; type: string[] }> {
    const cached = this.describeCache.get(table);
    if (cached) {
      return cached;
    }
    try {
      const records = (await this.query(
        `SELECT column_name, data_type AS column_type
         FROM information_schema.columns
         WHERE table_name = '${table}' COLLATE NOCASE
         ORDER BY ordinal_position`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      )) as Array<{ column_name: string; column_type: string }>;

      const names = records.map((row) => row.column_name);
      const types = records.map((row) => row.column_type);

      const describe = { name: names, type: types };
      this.describeCache.set(table, describe);
      return describe;
    } catch (error) {
      logger.error('Failed to describe table', LogCategory.DUCKDB, {
        table,
        error
      });
      throw error;
    }
  }

  async get_row_count(table: string): Promise<number> {
    const cached = this.rowCountCache.get(table);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const result = (await this.query(
        `SELECT CAST(COUNT(*) AS DOUBLE) as num_rows FROM ${table}`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      )) as Array<{ num_rows: number }>;
      const count = Number(result[0]?.num_rows ?? 0);
      this.rowCountCache.set(table, count);
      return count;
    } catch (error) {
      logger.error('Failed to get row count', LogCategory.DUCKDB, {
        table,
        error
      });
      throw error;
    }
  }

  async get_data(
    table: string,
    options: GetDataOptions = {}
  ): Promise<Uint8Array> {
    const { geometry = false, columns, limit } = options;

    let selection: string;
    if (columns && columns.length > 0) {
      selection = columns.map((col) => `"${col}"`).join(', ');
    } else if (!geometry) {
      selection = `COLUMNS(c -> c NOT ILIKE '%geom%')`;
    } else {
      selection = '*';
    }

    let query = `SELECT ${selection} FROM ${table}`;
    if (limit && limit > 0) {
      query += ` LIMIT ${limit}`;
    }

    const result = (await this.query(query, {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    })) as ArrayBuffer | Uint8Array;
    return result instanceof Uint8Array ? result : new Uint8Array(result);
  }

  async get_data_sample(
    table: string,
    limit = 1000,
    options: GetDataOptions = {}
  ): Promise<Uint8Array> {
    const { format = DUCK_CONST.QUERY_FORMAT.ARROW_IPC } = options;

    const columnSelection = options.columns
      ? options.columns.map((col) => `"${col}"`).join(', ')
      : '*';

    const query = `SELECT ${columnSelection} FROM ${table} USING SAMPLE ${limit} ROWS`;

    logger.debug('Using TABLESAMPLE for preview', LogCategory.DUCKDB, {
      table,
      limit,
      query: query.substring(0, 100)
    });

    const result = await this.query(query, { format });
    return result as Uint8Array;
  }

  async sort_table(
    table: string,
    column: string,
    order?: string
  ): Promise<Table> {
    const result =
      order === undefined
        ? await this.query(`FROM ${table}`)
        : await this.query(`FROM ${table} ORDER BY "${column}" ${order}`);
    return result as Table;
  }

  async rename_column(
    table: string,
    old_name: string,
    new_name: string
  ): Promise<void> {
    await this.query(
      `ALTER TABLE ${table} RENAME "${old_name}" to "${new_name}"`,
      {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      }
    );
    this.markTableMutated(table);
  }

  async change_column_type(
    table: string,
    column: string,
    new_type: string
  ): Promise<void> {
    await this.query(
      `ALTER TABLE ${table} ALTER "${column}" SET DATA TYPE ${new_type} USING try_cast("${column}" AS ${new_type})`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
    );
    this.markTableMutated(table);
  }

  async change_column_case(
    table: string,
    column: string,
    caseType: 'lower' | 'upper' = 'lower'
  ): Promise<void> {
    await this.query(
      `UPDATE ${table} set "${column}" = ${caseType}("${column}")`,
      {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      }
    );
    this.markTableMutated(table);
  }

  async trim_column(table: string, column: string): Promise<void> {
    await this.query(`UPDATE ${table} set "${column}" = trim("${column}")`, {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    });
    this.markTableMutated(table);
  }

  async drop_column(table: string, column: string): Promise<void> {
    await this.query(`ALTER TABLE ${table} DROP "${column}"`, {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    });
    this.markTableMutated(table);
  }

  async drop_rows(table: string, rows_id: number[]): Promise<void> {
    await this.query(
      `DELETE FROM ${table} WHERE __id IN (${rows_id.toString()})`,
      {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      }
    );
    this.markTableMutated(table);
  }

  async update_cell(
    table: string,
    id_column: string,
    id_value: string | number,
    column: string,
    new_value: DuckDBValue
  ): Promise<void> {
    const columns_info = await this.analyse(table);
    const column_info = columns_info.find((c) => c.name === column);
    if (!column_info) {
      throw new DuckDBError(
        `Column "${column}" not found in table "${table}"`,
        undefined,
        { table, column, availableColumns: columns_info.map((c) => c.name) }
      );
    }

    const validationResult = validate_and_cast_value(
      new_value,
      column_info.type_js as string
    );
    if (!validationResult.isValid) {
      throw new DataValidationError(
        `Invalid value type for column "${column}". Expected type: ${column_info.type_js}, received: ${typeof new_value}`,
        column,
        {
          expectedType: column_info.type_js,
          receivedType: typeof new_value,
          value: new_value
        }
      );
    }
    new_value = validationResult.value;

    let value_for_query: string | number | boolean;
    switch (typeof new_value) {
      case 'string':
        value_for_query = `'${new_value.replace(/'/g, "''")}'`;
        break;

      case 'number':
        value_for_query = new_value;
        break;

      case 'boolean':
        value_for_query = new_value ? 'TRUE' : 'FALSE';
        break;

      default:
        if (new_value instanceof Date) {
          value_for_query = `'${new_value.toISOString()}'`;
        } else if (new_value === null) {
          value_for_query = 'NULL';
        } else if (
          typeof new_value === 'string' ||
          typeof new_value === 'number' ||
          typeof new_value === 'boolean'
        ) {
          value_for_query = new_value;
        } else {
          value_for_query = String(new_value);
        }
    }

    if (typeof id_value === 'string') {
      id_value = id_value.replace(/'/g, "''");
    }
    await this.query(
      `UPDATE ${table} SET "${column}" = ${value_for_query} WHERE "${id_column}" = ${id_value}`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
    );
  }

  add_filter(table: string, key_index: number, filter: string): void {
    const table_metadata = this.get_table_metadata(table);
    table_metadata.filters.set(key_index, filter);
  }

  remove_filter(table: string, key_index: number): void {
    const { filters } = this.get_table_metadata(table);
    filters.delete(key_index);
  }

  async apply_filters(table: string): Promise<Table> {
    try {
      let query = `SELECT * FROM ${table}`;
      const { filters } = this.get_table_metadata(table);
      if (filters.size > 0) {
        const filterConditions = Array.from(filters.values()).join(' AND ');
        query += ` WHERE ${filterConditions}`;
      }
      const result = await this.query(query);
      return result as Table;
    } catch (error) {
      logger.error('Failed to apply filters', LogCategory.DUCKDB, error);
      throw error;
    }
  }

  async latlon_to_point(
    table: string,
    lat_column: string,
    lon_column: string
  ): Promise<void> {
    await this.query(
      `CREATE OR REPLACE TABLE ${table} AS
			FROM ${table}
			SELECT
				*,
				ST_Point("${lon_column}", "${lat_column}") as geom;`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
    );
    this.markTableMutated(table);
  }

  clearGeoParquetCache(): void {
    this.table_geoparquet_cache.clear();
    this.cacheState.accessOrder = [];
    this.cacheState.size = 0;
  }

  async copy_to_csv_as_string(
    table: string,
    options?: { delimiter?: string; header?: boolean }
  ): Promise<string> {
    const delimiter = options?.delimiter || ',';
    const header = options?.header !== false;

    const filename = `${table}_export_${Date.now()}.csv`;

    try {
      await this.query(
        `COPY ${table} TO '${filename}' (FORMAT CSV, DELIMITER '${delimiter}', HEADER ${header})`,
        {
          format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
        }
      );

      const buffer = await this.db!.copyFileToBuffer(filename);

      const decoder = new TextDecoder('utf-8');
      const csvString = decoder.decode(buffer);

      logger.debug('CSV export completed', LogCategory.DUCKDB, {
        table,
        byteLength: buffer.byteLength
      });

      return csvString;
    } finally {
      try {
        await this.db!.dropFile(filename);
      } catch (error) {
        logger.warn(
          'Failed to remove temporary CSV file',
          LogCategory.DUCKDB,
          error
        );
      }
    }
  }

  async copy_to_geoparquet_as_buffer(table: string): Promise<Uint8Array> {
    if (this.table_geoparquet_cache.has(table)) {
      const index = this.cacheState.accessOrder.indexOf(table);
      if (index > -1) {
        this.cacheState.accessOrder.splice(index, 1);
        this.cacheState.accessOrder.push(table);
      }
      const cachedBuffer = this.table_geoparquet_cache.get(table)!;
      return cachedBuffer.slice();
    }

    await this.query(
      `COPY ${table} TO '${table}.parquet' (FORMAT PARQUET, CODEC 'ZSTD');`,
      {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      }
    );
    const filename = `${table}.parquet`;
    let stableBuffer: Uint8Array | null = null;
    try {
      stableBuffer = await this.readStableParquetBuffer(filename);
    } finally {
      try {
        await this.db!.dropFile(filename);
      } catch (error) {
        logger.warn(
          'Failed to remove temporary GeoParquet file',
          LogCategory.DUCKDB,
          error
        );
      }
    }
    if (!stableBuffer) {
      throw new DuckDBError(
        `Failed to materialize GeoParquet buffer for ${table}`
      );
    }
    logger.debug('GeoParquet buffer materialized', LogCategory.DUCKDB, {
      table,
      byteLength: stableBuffer.byteLength
    });

    while (
      this.cacheState.size + stableBuffer.byteLength > this.MAX_CACHE_SIZE &&
      this.cacheState.accessOrder.length > 0
    ) {
      const oldest = this.cacheState.accessOrder.shift()!;
      const oldBuffer = this.table_geoparquet_cache.get(oldest);
      if (oldBuffer) {
        this.cacheState.size -= oldBuffer.byteLength;
        this.table_geoparquet_cache.delete(oldest);
      }
    }

    this.table_geoparquet_cache.set(table, stableBuffer);
    this.cacheState.accessOrder.push(table);
    this.cacheState.size += stableBuffer.byteLength;

    return stableBuffer.slice();
  }

  private async readStableParquetBuffer(filename: string): Promise<Uint8Array> {
    if (!this.db) {
      throw new DuckDBError('DuckDB not initialized');
    }

    for (let attempt = 0; attempt < this.GEO_PARQUET_READ_RETRIES; attempt++) {
      const rawBuffer = await this.db.copyFileToBuffer(filename);
      const sourceView =
        rawBuffer instanceof Uint8Array ? rawBuffer : new Uint8Array(rawBuffer);
      const stableBuffer = new Uint8Array(sourceView.byteLength);
      stableBuffer.set(sourceView);

      if (this.isValidParquetBuffer(stableBuffer)) {
        if (attempt > 0) {
          logger.debug(
            'GeoParquet buffer validated after retry',
            LogCategory.DUCKDB,
            { filename, attempt: attempt + 1 }
          );
        }
        return stableBuffer;
      }

      logger.warn(
        'GeoParquet buffer incomplete, retrying',
        LogCategory.DUCKDB,
        {
          filename,
          byteLength: stableBuffer.byteLength,
          attempt: attempt + 1
        }
      );

      await new Promise((resolve) =>
        setTimeout(resolve, this.GEO_PARQUET_RETRY_DELAY_MS * (attempt + 1))
      );
    }

    throw new DuckDBError(
      `Failed to read valid GeoParquet buffer from ${filename}`
    );
  }

  private isValidParquetBuffer(buffer: Uint8Array): boolean {
    if (buffer.byteLength < 8) {
      return false;
    }

    const magicLength = this.PARQUET_MAGIC.length;
    for (let i = 0; i < magicLength; i++) {
      if (buffer[i] !== this.PARQUET_MAGIC[i]) {
        return false;
      }
    }

    for (let i = 0; i < magicLength; i++) {
      if (
        buffer[buffer.byteLength - magicLength + i] !== this.PARQUET_MAGIC[i]
      ) {
        return false;
      }
    }

    return true;
  }

  async filter_datasets_with_geometry(): Promise<
    Array<{ tablename: string; filename: string }>
  > {
    try {
      const with_geom = (await this.query(
        `FROM information_schema.columns
         SELECT table_name
         WHERE (column_name = 'geom' OR column_name = 'geometry') AND data_type = 'GEOMETRY'`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      )) as Array<{ table_name: string }>;

      const datasets = Array.from(
        this.loaded_files,
        ([tablename, filename]) => ({
          tablename,
          filename
        })
      );

      const filtered = datasets.filter((dataset) =>
        with_geom.map((d) => d.table_name).includes(dataset.tablename)
      );

      return filtered;
    } catch (error) {
      logger.error(
        'Failed to filter datasets with geometry',
        LogCategory.DUCKDB,
        error
      );
      return [];
    }
  }

  async export_table(
    table: string,
    format: string = DUCK_CONST.DEFAULT.FORMAT_TABULAR
  ): Promise<Uint8Array> {
    const filename = table + '.' + format;
    await this.query(
      `COPY ${table} TO '${filename}' WITH (FORMAT '${format}')`,
      {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      }
    );
    const buffer = await this.db!.copyFileToBuffer(filename);
    return buffer;
  }

  async insert_arrow_table(table: unknown, tablename: string): Promise<void> {
    if (!this.connection) {
      throw new DuckDBError('Connection not established');
    }

    await this.connection.insertArrowTable(table as never, {
      name: tablename,
      create: true
    });
    this.markTableMutated(tablename);
  }

  async calculate_class_breaks(
    table: string,
    column: string,
    options: CalculateBreaksOptions = {}
  ): Promise<number[]> {
    const {
      method = 'quantile',
      nclass = 5,
      nclass_right = nclass,
      round = true,
      break_value = null
    } = options;

    let breaks: number[];

    if (!break_value) {
      const result = (await this.query(
        `SELECT ${method}('FROM query_table(${table}) SELECT "${column}"', "${column}", nb := ${nclass}) as breaks`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      )) as BreaksResult[];
      breaks = result[0].breaks;
    } else {
      const break_is_inside = (await this.query(
        `FROM query_table(${table}) SELECT min("${column}") as min, max("${column}") as max, ${break_value} BETWEEN min AND max as is_inside`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      )) as BreakInsideResult[];
      if (break_is_inside[0].is_inside === false)
        throw new DataValidationError(
          `break_value ${break_value.toLocaleString()} is outside the column extent`,
          column,
          {
            breakValue: break_value,
            min: break_is_inside[0].min,
            max: break_is_inside[0].max
          }
        );
      const breaks_below = (await this.query(
        `SELECT ${method}('FROM query_table(${table}) SELECT "${column}" WHERE "${column}" < ${break_value}', "${column}", nb := ${nclass}) as breaks`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      )) as BreaksResult[];
      const breaks_above = (await this.query(
        `SELECT ${method}('FROM query_table(${table}) SELECT "${column}" WHERE "${column}" >= ${break_value}', "${column}", nb := ${nclass_right}) as breaks`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      )) as BreaksResult[];

      breaks = [
        ...breaks_below[0].breaks,
        +break_value,
        ...breaks_above[0].breaks
      ];
    }

    if (round) {
      const result = (await this.query(
        `SELECT round_thresholds([${breaks}], ${table}, "${column}") as breaks_rounded`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      )) as BreaksRoundedResult[];
      const breaks_rounded = result[0].breaks_rounded;
      if (break_value) {
        const break_value_index = breaks.findIndex((d) => d === break_value);
        breaks_rounded[break_value_index] = break_value;
      }
      return breaks_rounded;
    } else {
      return breaks;
    }
  }

  async add_class(
    table: string,
    column: string,
    breaks: number[]
  ): Promise<string> {
    const class_column_name = '_class_' + class_name_counter++;
    await this.query(
      `CREATE OR REPLACE TABLE ${table} AS
			 SELECT *, add_class("${column}", [${breaks}]) as ${class_column_name} FROM ${table}`
    );
    this.markTableMutated(table);
    return class_column_name;
  }

  async describeColumns(table: string): Promise<AnalysisResults> {
    const describe_full = (await this.query(`FROM describe_full('${table}')`, {
      format: DUCK_CONST.QUERY_FORMAT.ARRAY,
      useProxy: false
    })) as Record<string, unknown>[];

    return describe_full as AnalysisResults;
  }

  /**
   * Analyzes the specified table and returns an array of indicators with summaries and histograms.
   *
   * @param {string} table - The name of the table to analyze.
   * @param {Object} [options={}] - Optional parameters for the analysis.
   * @param {boolean} [options.force=false] - If true, forces a re-analysis of the table, bypassing the cache.
   * @returns {Promise<Array<Object>>} A promise that resolves to an array of indicator objects, each containing:
   *   - {string} name - The name of the column.
   *   - {string} type_simple - The simplified type of the column (e.g., 'numeric', 'date', 'string').
   *   - {Object} [summary_general] - General summary statistics for the column.
   *   - {Object} [summary_numeric] - Numeric summary statistics for the column (if applicable).
   *   - {Object} [summary_date] - Date summary statistics for the column (if applicable).
   *   - {Object} [histogram] - Histogram data for the column. To later generate summary plots.
   */
  async analyse(
    table: string,
    options: AnalyseOptions = {}
  ): Promise<AnalysisResults> {
    const { force = false } = options;
    const table_metadata = this.get_table_metadata(table);
    const { analysis } = table_metadata;

    // Check if the table has already been analyzed
    if (!force && analysis) return analysis; // Return cached results
    // force analysis => remove previous cached results
    if (force && analysis) delete table_metadata.analysis;

    const describe_full = (await this.query(`FROM describe_full('${table}')`, {
      format: DUCK_CONST.QUERY_FORMAT.ARRAY,
      useProxy: false
    })) as Record<string, unknown>[];

    const numericColumns = describe_full.filter(
      (d) => d.type_simple === 'numeric'
    );
    const dateColumns = describe_full.filter((d) => d.type_simple === 'date');
    const stringColumns = describe_full.filter(
      (d) => d.type_simple === 'string'
    );
    const otherColumns = describe_full.filter(
      (d) =>
        d.type_simple !== 'numeric' &&
        d.type_simple !== 'date' &&
        d.type_simple !== 'string'
    );

    const processColumnBatch = async (columns: any[], type: string) => {
      if (columns.length === 0) return [];

      const results = await Promise.all(
        columns.map(async (d) => {
          let summary_general: ArrowTableLike | null = null;
          let summary_numeric: ArrowTableLike | null = null;
          let summary_date: ArrowTableLike | null = null;
          let histogram = null;

          switch (type) {
            case 'numeric': {
              const [general, numeric, hist] = await Promise.all([
                this.query(`FROM summary_general(${table}, "${d.name}")`, {
                  useProxy: false
                }) as Promise<ArrowTableLike>,
                this.query(`FROM summary_numeric(${table}, "${d.name}")`, {
                  useProxy: false
                }) as Promise<ArrowTableLike>,
                this.query(`FROM histogram_numeric(${table}, "${d.name}")`)
              ]);
              summary_general = general;
              summary_numeric = numeric;
              histogram = hist;
              break;
            }

            case 'date': {
              const [generalDate, dateSum, histDate] = await Promise.all([
                this.query(`FROM summary_general(${table}, "${d.name}")`, {
                  useProxy: false
                }) as Promise<ArrowTableLike>,
                this.query(`FROM summary_date(${table}, "${d.name}")`, {
                  useProxy: false
                }) as Promise<ArrowTableLike>,
                this.query(`FROM histogram_numeric(${table}, "${d.name}")`)
              ]);
              summary_general = generalDate;
              summary_date = dateSum;
              histogram = histDate;
              break;
            }

            case 'string': {
              const [generalStr, histStr] = await Promise.all([
                this.query(`FROM summary_general(${table}, "${d.name}")`, {
                  useProxy: false
                }) as Promise<ArrowTableLike>,
                this.query(`FROM histogram_categorical(${table}, "${d.name}")`)
              ]);
              summary_general = generalStr;
              histogram = histStr;
              break;
            }
            //'geometry' and 'other' types are not handled
          }

          return {
            ...d,
            ...(summary_general?.get(0) ?? {}),
            ...(summary_numeric?.get(0) ?? {}),
            ...(summary_date?.get(0) ?? {}),
            histogram
          } as AnalysisResult;
        })
      );

      return results;
    };

    const [numericResults, dateResults, stringResults, otherResults] =
      await Promise.all([
        processColumnBatch(numericColumns, 'numeric'),
        processColumnBatch(dateColumns, 'date'),
        processColumnBatch(stringColumns, 'string'),
        Promise.resolve(otherColumns.map((d) => ({ ...d }) as AnalysisResult))
      ]);

    const analysis_result = describe_full.map((col) => {
      const allResults = [
        ...numericResults,
        ...dateResults,
        ...stringResults,
        ...otherResults
      ];
      return (
        allResults.find((r) => r.name === col.name) || (col as AnalysisResult)
      );
    });

    table_metadata.analysis = analysis_result;

    // Store the analysis results in the tableMetada map
    return analysis_result;
  }

  /**
   * JOINTURES
   * - ✅ join_by_id
   *   - ATTENTION : si basemap importé, besoin de l'analyser pour des stats à la colonne et un typage sémio.
   *    Par défaut conserver les colonnes qui ont un typage sémio égale à 'geoid' et trié par "score" et "share_uniques".
   * - join_by_bbox (test vers tous les fonds de carte de Khartis via Bbox)
   * - ✅ apply_join_association (joint l'id du fond de carte sélectionné au jeu de données + la typologie de match)
   *   /!\ L'association manuelle par l'utilisateur est gérée par la méthode update_cell
   */

  /**
   * Joins a table to one or multiple basemaps based on the similarity of an ID column.
   *
   * This method provides a unified interface for joining a table to either multiple basemaps
   * (using `basemaps_table`) or a single basemap (using `basemap_table`, `basemap_id`, and
   * optionally `basemap_others_id`). It uses the `apply_join_across_basemaps` macro to perform
   * the join and then generates a synthesis of the join results using the `join_synthesis` macro.
   *
   * @async
   * @param {string} table - The name of the table to join.
   * @param {string} table_id - The name of the ID column in the table.
   * @param {Object} options - An object containing the join options.
   * @param {string} [options.basemaps_table] - The name of the table containing multiple basemaps.
   * @param {string} [options.basemap_table] - The name of a single basemap table provided by the user.
   * @param {string} [options.basemap_id] - The name of the main ID column in the single basemap table.
   * @param {string} [options.basemap_others_id] - A comma-separated string of other ID column names in the single basemap table. Optional.
   * @returns {Promise<Object>} - A promise that resolves to the synthesis of the join results.
   *   - basemap: The name of the basemap.
   *   - share_basemap: The share of the basemap in the join results.
   *   - share_candidate: The share of the candidate in the join results.
   * @throws {Error} - Throws an error if neither `basemaps_table` nor `basemap_table` is provided,
   *   or if `basemap_id` is missing when `basemap_table` is used.
   * @description This method simplifies the process of joining a table to basemaps by handling
   *   both multiple and single basemap scenarios. It prepares the basemap table if necessary
   *   and then performs the join, returning a synthesis of the results.
   * @example
   * // Example usage:
   * await duckdb.join_by_id('my_data_table', 'my_id_column', { basemaps_table: 'khartis_basemaps' });
   * await duckdb.join_by_id('my_data_table', 'my_id_column', { basemap_table: 'user_basemap', basemap_id: 'basemap_id', basemap_others_id: 'list_value(['other_id1', 'other_id2'])' });
   */
  async join_by_id(
    table: string,
    table_id: string,
    options: JoinByIdOptions = {}
  ): Promise<AnalysisResults> {
    const { basemaps_table, basemap_table, basemap_id, basemap_others_id } =
      options;

    if (!basemaps_table && !basemap_table) {
      throw new DataValidationError(
        'Either basemaps_table or basemap_table must be provided in options.',
        undefined,
        { options }
      );
    }
    if (basemap_table && !basemap_id) {
      throw new DataValidationError(
        'basemap_id must be provided when using basemap_table.',
        'basemap_id',
        { basemap_table }
      );
    }
    const table_name = `${table}_join_results`;
    let basemap_join_ref_name: string | null = null;
    let join_across_query: string;

    // Case 1: Joining to multiple basemaps (using basemaps_table)
    if (basemaps_table) {
      const unified_table = 'unified_basemap_attributes';

      let hasCustomAttributes = false;
      try {
        const customCheck = (await this.query(
          `SELECT COUNT(*) as count FROM custom_basemap_attributes`,
          { format: DUCK_CONST.QUERY_FORMAT.ARRAY, useProxy: false }
        )) as Array<{ count: number }>;
        const count = customCheck?.[0]?.count ?? 0;
        hasCustomAttributes = count > 0;
      } catch {
        hasCustomAttributes = false;
      }

      if (hasCustomAttributes) {
        await this.query(
          `CREATE OR REPLACE TABLE ${unified_table} AS
          SELECT * FROM ${basemaps_table}
          UNION ALL
          SELECT * FROM custom_basemap_attributes`,
          { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
        );
        this.markTableMutated(unified_table);

        join_across_query = `CREATE OR REPLACE TABLE ${table_name} AS
			FROM apply_join_across_basemaps(${table}, ${table_id}, ${unified_table})`;
      } else {
        join_across_query = `CREATE OR REPLACE TABLE ${table_name} AS
			FROM apply_join_across_basemaps(${table}, ${table_id}, ${basemaps_table})`;
      }
      // Case 2: Joining to a single basemap (using basemap_table, basemap_id, basemap_others_id)
    } else if (basemap_table) {
      basemap_join_ref_name = `${basemap_table}_join_ref`;
      // prepare the basemap table as a join reference table
      if (basemap_others_id) {
        // With alternative ID columns
        await this.query(
          `CREATE OR REPLACE TABLE ${basemap_join_ref_name} AS
					  FROM get_join_table_from_basemap(${basemap_table}, ${basemap_id}, ${basemap_others_id});`,
          { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
        );
        this.markTableMutated(basemap_join_ref_name);
      } else {
        // With a single ID column
        await this.query(
          `CREATE OR REPLACE TABLE ${basemap_join_ref_name} AS
					  FROM get_join_table_from_basemap(${basemap_table}, ${basemap_id})`,
          { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
        );
        this.markTableMutated(basemap_join_ref_name);
      }

      join_across_query = `CREATE OR REPLACE TABLE ${table_name} AS
			FROM apply_join_across_basemaps(${table}, ${table_id}, ${basemap_join_ref_name})`;
    } else {
      throw new DataValidationError(
        'Invalid options configuration',
        undefined,
        { options }
      );
    }

    // Apply the join query
    await this.query(join_across_query, {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    });
    this.markTableMutated(table_name);
    // Generate the synthesis of the join results
    const synthesis = await this.query(`FROM join_synthesis(${table_name})`, {
      format: DUCK_CONST.QUERY_FORMAT.ARRAY
    });

    // Store association
    const table_metadata = this.get_table_metadata(table);
    table_metadata.join = {
      id: table_id,
      join_results_name: table_name,
      basemap_join_ref: basemap_join_ref_name
    };

    return synthesis as AnalysisResults;
  }

  /**
   * Applies a join association to a table based on a previously performed join operation.
   *
   * This method retrieves the join association information stored during a previous join operation
   * (either `join_by_id_to_basemaps` or `join_by_id_to_one_basemap`) and applies the join to the
   * specified table. It adds columns from the join table to the original table, including the
   * basemap ID and the type of match (exact, partial, etc.).
   *
   * @async
   * @param {string} table - The name of the table to which the join association will be applied.
   * @param {string} basemap - The name of the basemap to filter the join results by.
   * @throws {Error} - Throws an error if no join association is found for the specified table.
   */
  async apply_join_association(table: string, basemap: string): Promise<void> {
    const { join } = this.get_table_metadata(table);
    if (!join) {
      throw new DuckDBError(
        'No join association found for the specified table',
        undefined,
        { table, basemap }
      );
    }
    const { id, join_results_name } = join;
    await this.query(`CREATE OR REPLACE TABLE ${table} AS
				FROM ${table} as t
				SELECT
					t.*,
					j.id as basemap_id,
					j.typo_match
				LEFT JOIN ${join_results_name} as j
				ON t.${id} = j.geoname
				WHERE j.basemap = '${basemap}'`);
    this.markTableMutated(table);
  }
}

let class_name_counter = 0;
let Duck: DuckDB | null = null;
let duckInitPromise: Promise<void> | null = null;
let initializationStarted = false; // guard against concurrent init

async function initDuckDB(): Promise<void> {
  if (Duck) {
    return;
  }

  if (duckInitPromise) {
    await duckInitPromise;
    return;
  }

  if (initializationStarted) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    return initDuckDB();
  }

  initializationStarted = true;

  duckInitPromise = (async () => {
    try {
      const instance = new DuckDB();
      await instance.init();
      Duck = instance;
    } catch (error) {
      Duck = null;
      duckInitPromise = null;
      initializationStarted = false; // allow retry after failure
      throw error;
    }
  })();

  await duckInitPromise;
}

export { Duck, initDuckDB };
export type { DuckDB };
