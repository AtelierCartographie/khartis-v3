import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';

const mocks = vi.hoisted(() => {
  const connection = {};
  const db = {
    connect: vi.fn(async () => connection),
    instantiate: vi.fn(async () => undefined),
    open: vi.fn(async () => undefined),
    terminate: vi.fn(async () => undefined)
  };

  return {
    connection,
    db,
    executeQuery: vi.fn(async (_connection: unknown, _query: string) => []),
    showWarning: vi.fn(),
    workerTerminate: vi.fn(),
    selectBundle: vi.fn(async () => ({
      eh: null,
      mainModule: 'duckdb-eh.wasm',
      mainWorker: 'duckdb-browser-eh.worker.js'
    }))
  };
});

vi.mock('./query', () => ({
  executeQuery: mocks.executeQuery
}));

vi.mock('$lib/features/commons/utils/notification.utils.svelte', () => ({
  showWarning: mocks.showWarning
}));

vi.mock('@duckdb/duckdb-wasm', () => ({
  AsyncDuckDB: vi.fn(function AsyncDuckDB() {
    return mocks.db;
  }),
  ConsoleLogger: vi.fn(function ConsoleLogger() {}),
  selectBundle: mocks.selectBundle
}));

vi.mock('@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url', () => ({
  default: 'duckdb-browser-eh.worker.js'
}));

vi.mock('@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url', () => ({
  default: 'duckdb-browser-mvp.worker.js'
}));

vi.mock('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url', () => ({
  default: 'duckdb-eh.wasm'
}));

vi.mock('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url', () => ({
  default: 'duckdb-mvp.wasm'
}));

describe('DuckDB engine initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.db.connect.mockResolvedValue(mocks.connection);
    mocks.db.instantiate.mockResolvedValue(undefined);
    mocks.db.open.mockResolvedValue(undefined);
    mocks.db.terminate.mockResolvedValue(undefined);
    mocks.executeQuery.mockResolvedValue([]);
    vi.stubGlobal(
      'Worker',
      class {
        constructor(readonly url: string) {}

        terminate(): void {
          mocks.workerTerminate();
        }
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('warms coordinate systems before loading spatial to avoid DuckDB WASM GeoParquet CRS crash', async () => {
    const { initEngine } = await import('./engine');

    await initEngine();

    const queries = mocks.executeQuery.mock.calls.map(([, query]) =>
      String(query)
    );
    const warmupIndex = queries.findIndex((query) =>
      query.includes('duckdb_coordinate_systems()')
    );
    const loadSpatialIndex = queries.findIndex((query) =>
      query.includes('LOAD spatial')
    );

    expect(warmupIndex).toBeGreaterThan(-1);
    expect(loadSpatialIndex).toBeGreaterThan(-1);
    expect(warmupIndex).toBeLessThan(loadSpatialIndex);
  });

  it('keeps DuckDB initialized when the spatial warmup query fails', async () => {
    mocks.executeQuery.mockImplementation(async (_connection, query) => {
      if (String(query).includes('duckdb_coordinate_systems()')) {
        throw new Error('warmup unavailable');
      }
      return [];
    });
    const { initEngine, isInitialized } = await import('./engine');

    await expect(initEngine()).resolves.toBeUndefined();

    expect(isInitialized()).toBe(true);
    const queries = mocks.executeQuery.mock.calls.map(([, query]) =>
      String(query)
    );
    expect(queries.some((query) => query.includes('LOAD spatial'))).toBe(true);
  });

  it('warns but keeps DuckDB initialized when spatial preload fails', async () => {
    mocks.executeQuery.mockImplementation(async (_connection, query) => {
      if (String(query).includes('LOAD spatial')) {
        throw new Error('spatial unavailable');
      }
      return [];
    });
    const { initEngine, getContext } = await import('./engine');

    await expect(initEngine()).resolves.toBeUndefined();

    expect(getContext().extensionsLoaded.spatial).toBe(false);
    expect(mocks.showWarning).toHaveBeenCalledTimes(1);
  });

  it('should terminate a pending WASM instantiation and allow a retry after timeout', async () => {
    vi.useFakeTimers();
    mocks.db.instantiate.mockImplementationOnce(
      () => new Promise<undefined>(() => undefined)
    );
    const { DUCKDB_INSTANTIATION_TIMEOUT_MS, initEngine, isInitialized } =
      await import('./engine');

    const initialization = initEngine();
    const rejection = expect(initialization).rejects.toMatchObject({
      name: 'DuckDBError',
      message: m.error_download_timeout(),
      details: {
        phase: 'instantiate',
        timeoutMs: DUCKDB_INSTANTIATION_TIMEOUT_MS
      }
    });

    await vi.advanceTimersByTimeAsync(DUCKDB_INSTANTIATION_TIMEOUT_MS);
    await rejection;

    expect(mocks.db.terminate).toHaveBeenCalledOnce();
    expect(mocks.workerTerminate).toHaveBeenCalledOnce();
    expect(isInitialized()).toBe(false);

    await expect(initEngine()).resolves.toBeUndefined();
    expect(isInitialized()).toBe(true);
  });
});
