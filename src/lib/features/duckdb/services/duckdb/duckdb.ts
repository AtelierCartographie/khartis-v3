import * as duckdb from '@duckdb/duckdb-wasm';
import type { DuckDBBundles } from '@duckdb/duckdb-wasm';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import { tableFromIPC, type Table } from '@uwdata/flechette';
import {
  DataValidationError,
  DuckDBError,
  TypeInferenceError
} from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { analyse } from './analyse';
import { breaks } from './breaks';
import { join_macros } from './join';

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
  TableDescribeResult,
  ValidationResult
} from './types/index.js';

interface TableMetadata {
  analysis?: AnalysisResults | null;
  join: JoinInfo | null;
  filters: Map<number, string>;
  version?: number; // Version tracking for cache invalidation
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
  columns?: string[]; // Specific columns to select
  limit?: number; // Limit number of rows for sampling
  format?: QueryFormat; // Output format (Arrow IPC, etc.)
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

function extract_filename(url: string): string {
  return url.split('/').pop() || '';
}

function get_file_type(filename: string): FileType {
  if (DUCK_CONST.REGEX.TABULAR.test(filename)) return DUCK_CONST.TYPE.TABULAR;
  if (DUCK_CONST.REGEX.GEO.test(filename)) return DUCK_CONST.TYPE.GEOFILE;
  if (DUCK_CONST.REGEX.PARQUET.test(filename)) return DUCK_CONST.TYPE.PARQUET;
  return DUCK_CONST.TYPE.TABULAR;
}

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

function add_file_id(file: FileWithId): void {
  file.id = file.lastModified + '-' + normalize_name(file.name);
}

const isValidInteger = (value: number | string): boolean =>
  (typeof value === 'number' && Number.isInteger(value)) ||
  (typeof value === 'string' &&
    DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test(value));

const isValidFloat = (value: number | string): boolean =>
  typeof value === 'number' ||
  (typeof value === 'string' &&
    DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test(value));

const isValidBoolean = (value: number | string | boolean): boolean =>
  typeof value === 'boolean' ||
  typeof value === 'number' ||
  (typeof value === 'string' &&
    (DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_STRING.test(value) ||
      DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_NUMBER.test(value)));

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

class DuckDB {
  public db: duckdb.AsyncDuckDB | null = null;

  public connection: duckdb.AsyncDuckDBConnection | null = null;

  public loaded_files: Map<string, string> = new Map();

  public registered_files: Set<string> = new Set();

  // Query result cache with versioning for performance
  private queryCache = new Map<
    string,
    {
      result: unknown;
      timestamp: number;
      tableVersions: Map<string, number>;
    }
  >();

  private readonly CACHE_MAX_AGE = 60000; // 60 seconds cache TTL

  private readonly CACHE_MAX_SIZE = 100; // Max number of cached queries

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

  private preparedStatements: {
    describe: duckdb.AsyncPreparedStatement | null;
    rowCount: duckdb.AsyncPreparedStatement | null;
  } = {
    describe: null,
    rowCount: null
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

  constructor() {}

  private async closePreparedStatements(): Promise<void> {
    const statements = Object.values(this.preparedStatements).filter(
      (statement): statement is duckdb.AsyncPreparedStatement =>
        Boolean(statement)
    );

    await Promise.allSettled(statements.map((statement) => statement.close()));
    this.preparedStatements.describe = null;
    this.preparedStatements.rowCount = null;
  }

  private async getDescribeStatement(): Promise<duckdb.AsyncPreparedStatement> {
    if (!this.connection) {
      throw new DuckDBError('Connection not established');
    }

    if (!this.preparedStatements.describe) {
      this.preparedStatements.describe = await this.connection.prepare(
        `SELECT column_name, data_type AS column_type
         FROM information_schema.columns
         WHERE table_name = ? COLLATE NOCASE
         ORDER BY ordinal_position`
      );
    }

    return this.preparedStatements.describe;
  }

  private async getRowCountStatement(): Promise<duckdb.AsyncPreparedStatement> {
    if (!this.connection) {
      throw new DuckDBError('Connection not established');
    }

    if (!this.preparedStatements.rowCount) {
      this.preparedStatements.rowCount = await this.connection.prepare(
        `SELECT COUNT(*) as num_rows FROM query_table(?)`
      );
    }

    return this.preparedStatements.rowCount;
  }

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

  private markTableMutated(table: string): void {
    this.invalidateTableCache(table);
    this.evictGeoParquetEntry(table);
    // Also invalidate query cache entries that reference this table
    this.invalidateCacheForTable(table);
  }

  /**
   * Get cached query result if available and not stale
   */
  private getCachedQuery(sql: string, tables: string[] = []): unknown | null {
    const cacheKey = this.generateCacheKey(sql);
    const cached = this.queryCache.get(cacheKey);

    if (!cached) return null;

    // Check if cache is expired by time
    if (Date.now() - cached.timestamp > this.CACHE_MAX_AGE) {
      this.queryCache.delete(cacheKey);
      return null;
    }

    // Check if any referenced table has been modified
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

  /**
   * Cache query result with table version tracking
   */
  private setCachedQuery(
    sql: string,
    result: unknown,
    tables: string[] = []
  ): void {
    const cacheKey = this.generateCacheKey(sql);

    // Enforce cache size limit
    if (this.queryCache.size >= this.CACHE_MAX_SIZE) {
      // Remove oldest entry
      const firstKey = this.queryCache.keys().next().value;
      if (firstKey) this.queryCache.delete(firstKey);
    }

    // Track current version of all referenced tables
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

  /**
   * Generate cache key from SQL query
   */
  private generateCacheKey(sql: string): string {
    // Simple hash for now - could be improved with proper hashing
    return sql.trim().toLowerCase();
  }

  /**
   * Invalidate all cache entries that reference a specific table
   */
  private invalidateCacheForTable(table: string): void {
    for (const [key, cached] of this.queryCache.entries()) {
      if (cached.tableVersions.has(table)) {
        this.queryCache.delete(key);
      }
    }
  }

  /**
   * Clear entire query cache
   */
  clearQueryCache(): void {
    this.queryCache.clear();
  }

  private calculateOptimalMemory(): string {
    // Use deviceMemory API if available (Chrome/Edge)
    if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
      const deviceMemory =
        (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
      // Use 50% of device memory, capped at 3GB (safe under WASM 4GB limit)
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
    // Default to 2GB if deviceMemory unavailable
    return '2048MB';
  }

  private async configureRuntimeSettings(): Promise<void> {
    const start = performance.now();
    const pragmas: string[] = [
      `PRAGMA memory_limit='${this.calculateOptimalMemory()}';`,
      `PRAGMA enable_progress_bar=false;`,
      // Performance optimizations
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

  invalidateTableCache(table: string): void {
    this.describeCache.delete(table);
    this.rowCountCache.delete(table);
  }

  async init(): Promise<void> {
    const startTime = performance.now();
    logger.info('DuckDB initialization started', LogCategory.DUCKDB);

    try {
      const bundleStart = performance.now();
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
      await this.query(breaks + analyse + join_macros, {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      });
      logger.debug('Custom macros registered', LogCategory.DUCKDB, {
        durationMs: (performance.now() - macrosStart).toFixed(2)
      });

      await this.configureRuntimeSettings();

      // Preload extensions in parallel for better performance
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

  async close(): Promise<void> {
    await this.closePreparedStatements();
    await this.connection?.close();
  }

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
    await this.closePreparedStatements();
    await this.connection?.close();
    await this.db?.dropFiles();
    await this.db?.reset();
  }

  /**
   * Preload all commonly used extensions in parallel at startup
   * This avoids delays when extensions are needed later
   */
  private async preloadExtensions(): Promise<void> {
    const startTime = performance.now();
    logger.info('Preloading DuckDB extensions', LogCategory.DUCKDB);

    // Load all extensions in parallel for maximum efficiency
    const extensionPromises: Promise<void>[] = [];

    // Spatial extension - always needed for geo files
    extensionPromises.push(this.loadSpatialExtension());

    // HTTPFS extension - needed for remote files
    extensionPromises.push(this.loadHTTPFSExtension());

    // Parquet extension - usually already loaded but ensure it
    extensionPromises.push(this.loadParquetExtension());

    // Wait for all extensions to load
    const results = await Promise.allSettled(extensionPromises);

    // Log results
    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    logger.success('Extensions preloaded', LogCategory.DUCKDB, {
      successful,
      failed,
      totalDurationMs: (performance.now() - startTime).toFixed(2)
    });

    // Log any failures
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
      // Don't throw - allow app to continue, extension can be loaded on demand
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
      // Don't throw - allow app to continue
    }
  }

  private async loadParquetExtension(): Promise<void> {
    const start = performance.now();
    try {
      // Parquet is usually auto-loaded, but ensure it explicitly
      await this.query(`INSTALL parquet; LOAD parquet;`, {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      });
      logger.debug('Parquet extension preloaded', LogCategory.DUCKDB, {
        durationMs: (performance.now() - start).toFixed(2)
      });
    } catch {
      // Parquet is usually already loaded, so this is not critical
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
      return; // Already preloaded at startup
    }

    // Fallback: load on demand if preloading failed
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
      return; // Already preloaded at startup
    }

    // Fallback: load on demand if preloading failed
    if (this.extensionLoadPromises.httpfs) {
      return this.extensionLoadPromises.httpfs;
    }

    this.extensionLoadPromises.httpfs = this.loadHTTPFSExtension();
    await this.extensionLoadPromises.httpfs;
    this.extensionLoadPromises.httpfs = null;
  }

  private async add_row_id(table: string): Promise<void> {
    await this.query(`CREATE OR REPLACE SEQUENCE id_${table} START 1;`, {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    });
    await this.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS __id INTEGER DEFAULT nextval('id_${table}');`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
    );
  }

  async query(query: string, options: QueryOptions = {}): Promise<unknown> {
    const { format = DUCK_CONST.QUERY_FORMAT.ARROW_TABLE, useProxy = true } =
      options;

    const buffer = await this.connection!.useUnsafe(
      async (bindings: DuckDBUnsafeBindings, conn: unknown) => {
        return await bindings.runQuery(conn, query);
      }
    );
    if (format === DUCK_CONST.QUERY_FORMAT.ARROW_IPC) return buffer;

    const table = tableFromIPC(buffer, {
      useBigInt: true,
      useDate: true,
      useDecimalInt: false,
      useMap: true,
      useProxy
    });
    if (format === DUCK_CONST.QUERY_FORMAT.ARROW_TABLE) return table;

    if (format === DUCK_CONST.QUERY_FORMAT.ARRAY) return table.toArray();
  }

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

  get_loaded_files(): Array<{ tablename: string; filename: string }> {
    if (this.loaded_files.size === 0) return [];
    return Array.from(this.loaded_files, ([tablename, filename]) => ({
      tablename,
      filename
    }));
  }

  private get_table_metadata(table: string): TableMetadata {
    if (!this.table_metadata.has(table))
      this.table_metadata.set(table, {
        analysis: null,
        join: null,
        filters: new Map()
      });
    return this.table_metadata.get(table)!;
  }

  async read_tabular(
    input: string | File,
    options: ReadTabularOptions = {}
  ): Promise<string> {
    const start = performance.now();
    let { tablename } = options;
    const decimal_separator =
      options.decimal_separator ?? DUCK_CONST.DEFAULT.DECIMAL_SEPARATOR;
    const format = options.format ?? DUCK_CONST.DEFAULT.FORMAT_TABULAR;
    let filename: string;
    let fileid: string;
    let cleanupFileId: string | undefined;

    const sourceType = typeof input === 'string' ? 'text' : 'file';
    logger.info('Ingesting tabular data into DuckDB', LogCategory.DUCKDB, {
      tablename,
      sourceType
    });

    try {
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
      // Ensure spatial extension is loaded before processing geo files
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
      const statement = await this.getDescribeStatement();
      const resultTable = await statement.query(table);
      const records = resultTable.toArray() as unknown as TableDescribeResult[];
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
      const statement = await this.getRowCountStatement();
      const result = await statement.query(table);
      const rows = result.toArray() as unknown as Array<{ num_rows: number }>;
      const count = Number(rows[0]?.num_rows ?? 0);
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

    // Optimize column selection
    let selection: string;
    if (columns && columns.length > 0) {
      // Explicit columns requested
      selection = columns.map((col) => `"${col}"`).join(', ');
    } else if (!geometry) {
      // Exclude geometry columns for better performance
      selection = `COLUMNS(c -> c NOT ILIKE '%geom%')`;
    } else {
      // Full table including geometry
      selection = '*';
    }

    // Build optimized query
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
    // Use TABLESAMPLE for fast random sampling (constant time regardless of table size)
    const { format = DUCK_CONST.QUERY_FORMAT.ARROW_IPC } = options;

    // Build column selection
    const columnSelection = options.columns
      ? options.columns.map((col) => `"${col}"`).join(', ')
      : '*';

    // Use TABLESAMPLE for efficient sampling - much faster than LIMIT for large tables
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

    // Create temporary filename
    const filename = `${table}_export_${Date.now()}.csv`;

    try {
      // Use COPY TO to generate CSV file
      await this.query(
        `COPY ${table} TO '${filename}' (FORMAT CSV, DELIMITER '${delimiter}', HEADER ${header})`,
        {
          format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
        }
      );

      // Read the CSV file content
      const buffer = await this.db!.copyFileToBuffer(filename);

      // Convert buffer to string
      const decoder = new TextDecoder('utf-8');
      const csvString = decoder.decode(buffer);

      logger.debug('CSV export completed', LogCategory.DUCKDB, {
        table,
        byteLength: buffer.byteLength
      });

      return csvString;
    } finally {
      // Clean up temporary file
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

  async analyse(
    table: string,
    options: AnalyseOptions = {}
  ): Promise<AnalysisResults> {
    const { force = false } = options;
    const table_metadata = this.get_table_metadata(table);
    const { analysis } = table_metadata;

    if (!force && analysis) return analysis;
    if (force && analysis) delete table_metadata.analysis;

    const describe_full = (await this.query(`FROM describe_full('${table}')`, {
      format: DUCK_CONST.QUERY_FORMAT.ARRAY,
      useProxy: false
    })) as Record<string, unknown>[];

    // Batch column analysis into groups by type for efficiency
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

    // Process columns in batches by type to reduce query overhead
    const processColumnBatch = async (columns: any[], type: string) => {
      if (columns.length === 0) return [];

      const results = await Promise.all(
        columns.map(async (d) => {
          let summary_general: ArrowTableLike | null = null;
          let summary_numeric: ArrowTableLike | null = null;
          let summary_date: ArrowTableLike | null = null;
          let histogram = null;

          // Batch queries for the same type columns
          switch (type) {
            case 'numeric': {
              // Run all 3 queries for numeric columns concurrently
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
              // Run all 3 queries for date columns concurrently
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
              // Run both queries for string columns concurrently
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

    // Process all column types in parallel
    const [numericResults, dateResults, stringResults, otherResults] =
      await Promise.all([
        processColumnBatch(numericColumns, 'numeric'),
        processColumnBatch(dateColumns, 'date'),
        processColumnBatch(stringColumns, 'string'),
        Promise.resolve(otherColumns.map((d) => ({ ...d }) as AnalysisResult)) // Other types get minimal processing
      ]);

    // Combine all results in original order
    const analysis_result = describe_full.map((col) => {
      // Find the processed result for this column
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

    return analysis_result;
  }

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

    if (basemaps_table) {
      // Create unified view combining catalog and custom basemap attributes
      const unified_table = 'unified_basemap_attributes';

      // Check if custom_basemap_attributes table exists and has data
      let hasCustomAttributes = false;
      try {
        const customCheck = (await this.query(
          `SELECT COUNT(*) as count FROM custom_basemap_attributes`,
          { format: DUCK_CONST.QUERY_FORMAT.ARRAY, useProxy: false }
        )) as Array<{ count: number }>;
        const count = customCheck?.[0]?.count ?? 0;
        hasCustomAttributes = count > 0;
      } catch {
        // Table doesn't exist, that's fine
        hasCustomAttributes = false;
      }

      // Create unified view with UNION ALL
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
        // No custom attributes, use catalog only
        join_across_query = `CREATE OR REPLACE TABLE ${table_name} AS
			FROM apply_join_across_basemaps(${table}, ${table_id}, ${basemaps_table})`;
      }
    } else if (basemap_table) {
      basemap_join_ref_name = `${basemap_table}_join_ref`;
      if (basemap_others_id) {
        await this.query(
          `CREATE OR REPLACE TABLE ${basemap_join_ref_name} AS
					  FROM get_join_table_from_basemap(${basemap_table}, ${basemap_id}, ${basemap_others_id});`,
          { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
        );
        this.markTableMutated(basemap_join_ref_name);
      } else {
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

    await this.query(join_across_query, {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    });
    this.markTableMutated(table_name);
    const synthesis = await this.query(`FROM join_synthesis(${table_name})`, {
      format: DUCK_CONST.QUERY_FORMAT.ARRAY
    });

    const table_metadata = this.get_table_metadata(table);
    table_metadata.join = {
      id: table_id,
      join_results_name: table_name,
      basemap_join_ref: basemap_join_ref_name
    };

    return synthesis as AnalysisResults;
  }

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
let initializationStarted = false; // Synchronous flag to prevent race condition

async function initDuckDB(): Promise<void> {
  // If already initialized, return immediately
  if (Duck) {
    return;
  }

  // If initialization is in progress, wait for it
  if (duckInitPromise) {
    await duckInitPromise;
    return;
  }

  // Atomic check-and-set to prevent race condition
  if (initializationStarted) {
    // Another thread just started initialization, wait a tick and retry
    await new Promise((resolve) => setTimeout(resolve, 0));
    return initDuckDB(); // Recursive call will hit the duckInitPromise check
  }

  // Mark initialization as started SYNCHRONOUSLY (before any await)
  initializationStarted = true;

  // Start initialization
  duckInitPromise = (async () => {
    try {
      const instance = new DuckDB();
      await instance.init();
      Duck = instance;
    } catch (error) {
      Duck = null;
      duckInitPromise = null;
      initializationStarted = false; // Reset on error to allow retry
      throw error;
    }
    // Keep duckInitPromise set to detect concurrent calls
  })();

  await duckInitPromise;
}

export { Duck, initDuckDB };
export type { DuckDB };
