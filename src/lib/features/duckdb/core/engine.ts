import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { resolveStaticAssetUrl } from '$lib/features/commons/utils/static-asset-url';
import * as m from '$lib/paraglide/messages';
import type { DuckDBBundles } from '@duckdb/duckdb-wasm';
import * as duckdb from '@duckdb/duckdb-wasm';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import { DUCK_CONST, EXTENSIONS } from '../constants';
import type {
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
const describeCache: Map<string, DescribeResult> = new Map();
const rowCountCache: Map<string, number> = new Map();
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
    throw new DuckDBError(m.error_duckdb_not_initialized());
  }
  return {
    db,
    connection,
    loaded_files,
    registered_files,
    table_metadata,
    describeCache,
    rowCountCache,
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
    logger.debug(
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

  const pragmas: string[] = [
    `PRAGMA memory_limit='${calculateOptimalMemory()}';`,
    `PRAGMA enable_progress_bar=false;`,
    `PRAGMA preserve_insertion_order=false;`,
    `PRAGMA enable_object_cache=true;`,
    `PRAGMA temp_directory='/tmp/duckdb';`,
    `PRAGMA max_temp_directory_size='5GB';`
  ];

  await executeQuery(connection, pragmas.join('\n'), {
    format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
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

async function warmSpatialCoordinateSystems(): Promise<void> {
  if (!connection) return;

  try {
    await executeQuery(
      connection,
      `CREATE OR REPLACE TEMP TABLE "__khartis_crs_warmup" AS
         SELECT 1 AS marker
         FROM duckdb_coordinate_systems()
         LIMIT 1;
       DROP TABLE "__khartis_crs_warmup";`,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
    );
  } catch (error) {
    logger.error(
      'Failed to warm spatial coordinate systems',
      LogCategory.DUCKDB,
      { error }
    );
    throw error;
  }
}

async function loadSpatialExtension(): Promise<void> {
  if (!connection || extensionsLoaded.spatial) return;

  try {
    await executeQuery(
      connection,
      `INSTALL ${EXTENSIONS.SPATIAL}; LOAD ${EXTENSIONS.SPATIAL};`,
      {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      }
    );
    extensionsLoaded.spatial = true;
  } catch (error) {
    logger.error('Failed to preload spatial extension', LogCategory.DUCKDB, {
      error
    });
  }
}

async function loadHTTPFSExtension(): Promise<void> {
  if (!connection || extensionsLoaded.httpfs) return;

  try {
    await executeQuery(
      connection,
      `INSTALL ${EXTENSIONS.HTTPFS}; LOAD ${EXTENSIONS.HTTPFS};`,
      {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      }
    );
    extensionsLoaded.httpfs = true;
  } catch (error) {
    logger.error('Failed to preload HTTPFS extension', LogCategory.DUCKDB, {
      error
    });
  }
}

async function preloadExtensions(): Promise<void> {
  await Promise.all([loadSpatialExtension(), loadHTTPFSExtension()]);
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
      const manualBundles: DuckDBBundles = {
        mvp: { mainModule: duckdb_wasm, mainWorker: mvp_worker },
        eh: { mainModule: duckdb_wasm_eh, mainWorker: eh_worker }
      };
      const bundle = await duckdb.selectBundle(manualBundles);
      if (
        bundle.mainModule === duckdb_wasm_eh ||
        bundle.mainWorker === eh_worker
      ) {
        bundleVariant = 'eh';
      } else {
        bundleVariant = 'mvp';
      }

      // Keep the documented browser bundles for the DuckDB core itself. The
      // page now runs in a cross-origin-isolated document so browser worker
      // paths used by spatial readers can initialize, but the core stays on
      // the extension-compatible eh/mvp bundles.
      threadsSupported = false;
      logger.debug('DuckDB bundle selected', LogCategory.DUCKDB, {
        bundleVariant,
        threadsSupported,
        crossOriginIsolated:
          typeof crossOriginIsolated !== 'undefined'
            ? crossOriginIsolated
            : false,
        durationMs: (performance.now() - bundleStart).toFixed(2)
      });

      const worker = new Worker(bundle.mainWorker!);

      const duckdbLogger = new duckdb.ConsoleLogger();
      db = new duckdb.AsyncDuckDB(duckdbLogger, worker);

      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

      await db.open({
        maximumThreads: 1,
        filesystem: { allowFullHTTPReads: true, reliableHeadRequests: true },
        query: { castBigIntToDouble: false }
      });

      connection = await db.connect();

      await configureRuntimeSettings();
      await configureLocalExtensionRepository();
      await warmSpatialCoordinateSystems();
      await preloadExtensions();

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
    throw new DuckDBError(m.error_connection_not_established());
  }
  await executeQuery(connection, macrosSql, {
    format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
  });
}
