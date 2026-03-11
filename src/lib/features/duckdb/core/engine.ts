import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { resolveStaticAssetUrl } from '$lib/features/commons/utils/static-asset-url';
import type { DuckDBBundles } from '@duckdb/duckdb-wasm';
import * as duckdb from '@duckdb/duckdb-wasm';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import { DUCK_CONST, EXTENSIONS } from '../constants';
import type {
  CacheState,
  DescribeResult,
  DuckDBContext,
  ExtensionLoadPromises,
  ExtensionsLoaded,
  TableMetadata
} from '../types';
import { executeQuery } from './query';

let db: duckdb.AsyncDuckDB | null = null;
let connection: duckdb.AsyncDuckDBConnection | null = null;
const loaded_files: Map<string, string> = new Map();
const registered_files: Set<string> = new Set();
const table_metadata: Map<string, TableMetadata> = new Map();
const table_geoparquet_cache: Map<string, Uint8Array> = new Map();
const describeCache: Map<string, DescribeResult> = new Map();
const rowCountCache: Map<string, number> = new Map();
const cacheState: CacheState = { size: 0, accessOrder: [] };
const extensionsLoaded: ExtensionsLoaded = { spatial: false, httpfs: false };
const extensionLoadPromises: ExtensionLoadPromises = {
  spatial: null,
  httpfs: null
};
let localExtensionRepositoryConfigured = false;
let threadsSupported = false;
let bundleVariant: 'eh' | 'mvp' = 'eh';

let initPromise: Promise<void> | null = null;

export function isInitialized(): boolean {
  return db !== null && connection !== null;
}

export function getContext(): DuckDBContext {
  if (!db || !connection) {
    throw new DuckDBError('DuckDB not initialized. Call initEngine() first.');
  }
  return {
    db,
    connection,
    loaded_files,
    registered_files,
    table_metadata,
    table_geoparquet_cache,
    describeCache,
    rowCountCache,
    cacheState,
    extensionsLoaded,
    extensionLoadPromises,
    localExtensionRepositoryConfigured,
    threadsSupported,
    bundleVariant
  };
}

function calculateOptimalMemory(): string {
  if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
    const deviceMemory =
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 4;
    const optimalMemory = Math.min(Math.floor(deviceMemory * 0.5 * 1024), 3072);
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

async function configureRuntimeSettings(): Promise<void> {
  if (!connection) return;
  const start = performance.now();

  const pragmas: string[] = [
    `PRAGMA memory_limit='${calculateOptimalMemory()}';`,
    `PRAGMA enable_progress_bar=false;`,
    `PRAGMA preserve_insertion_order=false;`,
    `PRAGMA enable_object_cache=true;`,
    `PRAGMA temp_directory='/tmp/duckdb';`,
    `PRAGMA max_temp_directory_size='5GB';`
  ];

  if (threadsSupported) {
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
    await executeQuery(connection, pragma, {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    });
  }

  logger.debug('Runtime settings applied', LogCategory.DUCKDB, {
    durationMs: (performance.now() - start).toFixed(2)
  });
}

async function configureLocalExtensionRepository(): Promise<void> {
  if (!connection) return;
  const startTime = performance.now();
  const repositoryUrl = resolveStaticAssetUrl('/duckdb-extensions');

  try {
    await executeQuery(
      connection,
      `SET custom_extension_repository = '${repositoryUrl}'`,
      {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      }
    );
    localExtensionRepositoryConfigured = true;
    logger.debug('Local extension repository configured', LogCategory.DUCKDB, {
      bundleVariant,
      repositoryUrl,
      durationMs: (performance.now() - startTime).toFixed(2)
    });
  } catch (error) {
    logger.warn(
      'Failed to set local extension repository, using CDN fallback',
      LogCategory.DUCKDB,
      { error }
    );
  }
}

async function loadSpatialExtension(): Promise<void> {
  if (!connection || extensionsLoaded.spatial) return;

  const start = performance.now();
  try {
    await executeQuery(
      connection,
      `INSTALL ${EXTENSIONS.SPATIAL}; LOAD ${EXTENSIONS.SPATIAL};`,
      {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      }
    );
    extensionsLoaded.spatial = true;
    logger.debug('Spatial extension preloaded', LogCategory.DUCKDB, {
      durationMs: (performance.now() - start).toFixed(2)
    });
  } catch (error) {
    logger.error('Failed to preload spatial extension', LogCategory.DUCKDB, {
      error
    });
  }
}

async function loadHTTPFSExtension(): Promise<void> {
  if (!connection || extensionsLoaded.httpfs) return;

  const start = performance.now();
  try {
    await executeQuery(
      connection,
      `INSTALL ${EXTENSIONS.HTTPFS}; LOAD ${EXTENSIONS.HTTPFS};`,
      {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      }
    );
    extensionsLoaded.httpfs = true;
    logger.debug('HTTPFS extension preloaded', LogCategory.DUCKDB, {
      durationMs: (performance.now() - start).toFixed(2)
    });
  } catch (error) {
    logger.error('Failed to preload HTTPFS extension', LogCategory.DUCKDB, {
      error
    });
  }
}

async function preloadExtensions(): Promise<void> {
  const startTime = performance.now();
  logger.info('Preloading DuckDB extensions', LogCategory.DUCKDB);

  await Promise.all([loadSpatialExtension(), loadHTTPFSExtension()]);

  logger.success('Extensions preloaded', LogCategory.DUCKDB, {
    totalDurationMs: (performance.now() - startTime).toFixed(2)
  });
}

export async function initEngine(): Promise<void> {
  if (db && connection) return;
  if (initPromise) {
    await initPromise;
    return;
  }
  const startTime = performance.now();
  logger.info('DuckDB initialization started', LogCategory.DUCKDB);

  initPromise = (async () => {
    try {
      const bundleStart = performance.now();
      const MANUAL_BUNDLES: DuckDBBundles = {
        mvp: { mainModule: duckdb_wasm, mainWorker: mvp_worker },
        eh: { mainModule: duckdb_wasm_eh, mainWorker: eh_worker }
      };
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
      bundleVariant =
        bundle.mainModule === duckdb_wasm_eh || bundle.mainWorker === eh_worker
          ? 'eh'
          : 'mvp';
      threadsSupported = Boolean(bundle.pthreadWorker);
      logger.debug('DuckDB bundle selected', LogCategory.DUCKDB, {
        bundleVariant,
        threadsSupported,
        durationMs: (performance.now() - bundleStart).toFixed(2)
      });

      const workerStart = performance.now();
      const worker = new Worker(bundle.mainWorker!);
      logger.debug('DuckDB worker created', LogCategory.DUCKDB, {
        durationMs: (performance.now() - workerStart).toFixed(2)
      });

      const dbCreateStart = performance.now();
      const duckdbLogger = new duckdb.ConsoleLogger();
      db = new duckdb.AsyncDuckDB(duckdbLogger, worker);
      logger.debug('AsyncDuckDB instance ready', LogCategory.DUCKDB, {
        durationMs: (performance.now() - dbCreateStart).toFixed(2)
      });

      const instantiateStart = performance.now();
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      logger.debug('DuckDB WASM instantiated', LogCategory.DUCKDB, {
        durationMs: (performance.now() - instantiateStart).toFixed(2)
      });

      const openStart = performance.now();
      await db.open({
        filesystem: { allowFullHTTPReads: true, reliableHeadRequests: true },
        query: { castBigIntToDouble: false }
      });
      logger.debug('DuckDB database opened', LogCategory.DUCKDB, {
        durationMs: (performance.now() - openStart).toFixed(2)
      });

      const connectStart = performance.now();
      connection = await db.connect();
      logger.debug('DuckDB connection established', LogCategory.DUCKDB, {
        durationMs: (performance.now() - connectStart).toFixed(2)
      });

      await configureRuntimeSettings();
      await configureLocalExtensionRepository();
      await preloadExtensions();

      // Clear caches
      table_geoparquet_cache.clear();
      cacheState.accessOrder = [];
      cacheState.size = 0;
      logger.debug('GeoParquet cache initialized', LogCategory.DUCKDB);

      logger.success('DuckDB initialization complete', LogCategory.DUCKDB, {
        totalDurationMs: (performance.now() - startTime).toFixed(2)
      });
    } catch (error) {
      db = null;
      connection = null;
      initPromise = null;
      logger.error('Failed to initialize DuckDB', LogCategory.DUCKDB, {
        duration: `${(performance.now() - startTime).toFixed(2)}ms`,
        error
      });
      throw error;
    }
  })();

  await initPromise;
}

export async function loadMacros(macrosSql: string): Promise<void> {
  if (!connection) {
    throw new DuckDBError('Connection not established');
  }
  const macrosStart = performance.now();
  await executeQuery(connection, macrosSql, {
    format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
  });
  logger.debug('Custom macros registered', LogCategory.DUCKDB, {
    durationMs: (performance.now() - macrosStart).toFixed(2)
  });
}
