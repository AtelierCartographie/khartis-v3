import type {
  AsyncDuckDB,
  AsyncDuckDBConnection,
  DuckDBBundles
} from '@duckdb/duckdb-wasm';
import * as duckdb from '@duckdb/duckdb-wasm';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import { derived, get, writable } from 'svelte/store';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

const browser = typeof window !== 'undefined';

export interface DuckDBState {
  db: AsyncDuckDB | null;
  connection: AsyncDuckDBConnection | null;
  isInitializing: boolean;
  isReady: boolean;
  error: string | null;
}

export interface QueryState {
  isLoading: boolean;
  error: string | null;
}

const duckDbState = writable<DuckDBState>({
  db: null,
  connection: null,
  isInitializing: false,
  isReady: false,
  error: null
});

const queryState = writable<QueryState>({
  isLoading: false,
  error: null
});

export const isDbReady = derived(duckDbState, ($state) => $state.isReady);
export const dbError = derived(duckDbState, ($state) => $state.error);
export const isDbInitializing = derived(
  duckDbState,
  ($state) => $state.isInitializing
);
export const isQuerying = derived(queryState, ($state) => $state.isLoading);
export const queryError = derived(queryState, ($state) => $state.error);

async function instantiateDuckDb(): Promise<AsyncDuckDB> {
  if (!browser) throw new Error('Can only instantiate DuckDB from browser.');

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
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

class DuckDBManager {
  private static instance: DuckDBManager;

  private registeredFiles = new Set<string>();

  static getInstance(): DuckDBManager {
    if (!DuckDBManager.instance) {
      DuckDBManager.instance = new DuckDBManager();
    }
    return DuckDBManager.instance;
  }

  async initialize(): Promise<void> {
    const currentState = get(duckDbState);
    if (currentState.isReady || currentState.isInitializing) {
      return;
    }

    try {
      duckDbState.update((state) => ({
        ...state,
        isInitializing: true,
        error: null
      }));

      const db = await instantiateDuckDb();
      const connection = await db.connect();

      duckDbState.update((state) => ({
        ...state,
        db,
        connection,
        isInitializing: false,
        isReady: true,
        error: null
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to initialize DuckDB';
      logger.error('Failed to initialize DuckDB', LogCategory.DUCKDB, error);

      duckDbState.update((state) => ({
        ...state,
        isInitializing: false,
        isReady: false,
        error: errorMessage
      }));

      throw error;
    }
  }

  async registerFile(
    name: string,
    url: string,
    protocol = 4,
    cache = false
  ): Promise<void> {
    const currentState = get(duckDbState);
    if (!currentState.db) {
      throw new Error('Database not initialized');
    }

    if (this.registeredFiles.has(name)) {
      return;
    }

    try {
      await currentState.db.registerFileURL(name, url, protocol, cache);
      this.registeredFiles.add(name);
    } catch (error) {
      logger.error(
        `Failed to register file ${name}`,
        LogCategory.DUCKDB,
        error
      );
      throw error;
    }
  }

  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const currentState = get(duckDbState);
    if (!currentState.connection) {
      throw new Error('Database connection not available');
    }

    try {
      queryState.update((state) => ({
        ...state,
        isLoading: true,
        error: null
      }));

      const result = await currentState.connection.query(sql);

      const rows: T[] = [];
      for (const row of result) {
        rows.push(row as T);
      }

      queryState.update((state) => ({
        ...state,
        isLoading: false,
        error: null
      }));
      return rows;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Query failed';
      logger.error('Query failed', LogCategory.DUCKDB, error);

      queryState.update((state) => ({
        ...state,
        isLoading: false,
        error: errorMessage
      }));
      throw error;
    }
  }

  async createTableFromFile(
    tableName: string,
    fileName: string
  ): Promise<void> {
    const sql = `CREATE TABLE IF NOT EXISTS ${tableName} AS SELECT * FROM parquet_scan('${fileName}')`;
    await this.query(sql);
  }

  async reset(): Promise<void> {
    const currentState = get(duckDbState);

    if (currentState.connection) {
      await currentState.connection.close();
    }
    if (currentState.db) {
      await currentState.db.terminate();
    }

    this.registeredFiles.clear();

    duckDbState.update(() => ({
      db: null,
      connection: null,
      isInitializing: false,
      isReady: false,
      error: null
    }));
  }
}

export const duckDB = DuckDBManager.getInstance();

export { duckDbState };
