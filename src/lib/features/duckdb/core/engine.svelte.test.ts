import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const connection = {};
  const db = {
    connect: vi.fn(async () => connection),
    instantiate: vi.fn(async () => undefined),
    open: vi.fn(async () => undefined)
  };

  return {
    db,
    executeQuery: vi.fn(async (_connection: unknown, _query: string) => []),
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
    vi.stubGlobal(
      'Worker',
      class {
        constructor(readonly url: string) {}
      }
    );
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
});
