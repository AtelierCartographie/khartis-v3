import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.hoisted(() => vi.fn());
const selectBundleMock = vi.hoisted(() => vi.fn());
const instantiateMock = vi.hoisted(() => vi.fn());
const openMock = vi.hoisted(() => vi.fn());
const connectMock = vi.hoisted(() => vi.fn());

vi.mock('$app/paths', () => ({
  asset: (path: string) => `/cartographie/khartisnewpprd${path}`
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    DUCKDB: 'DUCKDB'
  },
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  }
}));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: queryMock
}));

vi.mock('@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url', () => ({
  default: 'eh-worker-url'
}));

vi.mock('@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url', () => ({
  default: 'mvp-worker-url'
}));

vi.mock('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url', () => ({
  default: 'eh-module-url'
}));

vi.mock('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url', () => ({
  default: 'mvp-module-url'
}));

vi.mock('@duckdb/duckdb-wasm', () => ({
  ConsoleLogger: class {},
  AsyncDuckDB: class {
    constructor() {}

    async instantiate(
      mainModule: string,
      pthreadWorker: string | null | undefined
    ) {
      return instantiateMock(mainModule, pthreadWorker);
    }

    async open(options: unknown) {
      return openMock(options);
    }

    async connect() {
      return connectMock();
    }
  },
  selectBundle: selectBundleMock
}));

describe('duckdb engine', () => {
  beforeEach(() => {
    vi.resetModules();
    queryMock.mockReset();
    selectBundleMock.mockReset();
    instantiateMock.mockReset();
    openMock.mockReset();
    connectMock.mockReset();
    queryMock.mockResolvedValue(undefined);
    instantiateMock.mockResolvedValue(undefined);
    openMock.mockResolvedValue(undefined);
    connectMock.mockResolvedValue({ id: 'connection' });
    vi.stubGlobal(
      'Worker',
      class {
        constructor(public url: string) {}
      }
    );
  });

  it('detects eh bundles from returned URLs and configures the local repository', async () => {
    selectBundleMock.mockResolvedValue({
      mainModule: 'eh-module-url',
      mainWorker: 'eh-worker-url',
      pthreadWorker: null
    });

    const engine = await import('$lib/features/duckdb/core/engine');

    await engine.initEngine();

    expect(engine.getContext().bundleVariant).toBe('eh');
    expect(instantiateMock).toHaveBeenCalledWith('eh-module-url', null);
    expect(queryMock).toHaveBeenCalledWith(
      { id: 'connection' },
      "SET custom_extension_repository = '/cartographie/khartisnewpprd/duckdb-extensions'",
      { format: 'arrow-ipc' }
    );
  });

  it('configures the local repository for mvp bundles too', async () => {
    selectBundleMock.mockResolvedValue({
      mainModule: 'mvp-module-url',
      mainWorker: 'mvp-worker-url',
      pthreadWorker: null
    });

    const engine = await import('$lib/features/duckdb/core/engine');

    await engine.initEngine();

    expect(engine.getContext().bundleVariant).toBe('mvp');
    expect(queryMock).toHaveBeenCalledWith(
      { id: 'connection' },
      "SET custom_extension_repository = '/cartographie/khartisnewpprd/duckdb-extensions'",
      { format: 'arrow-ipc' }
    );
  });

  it('warms coordinate systems without disabling GeoParquet conversion eagerly', async () => {
    selectBundleMock.mockResolvedValue({
      mainModule: 'eh-module-url',
      mainWorker: 'eh-worker-url',
      pthreadWorker: null
    });

    const engine = await import('$lib/features/duckdb/core/engine');

    await engine.initEngine();

    const executedSql = queryMock.mock.calls.map((call) => String(call[1]));

    expect(
      executedSql.some((sql) =>
        sql.includes('SET enable_geoparquet_conversion = false;')
      )
    ).toBe(false);
    expect(
      executedSql.some((sql) => sql.includes('duckdb_coordinate_systems()'))
    ).toBe(true);
  });

  it('fails initialization if CRS warmup fails', async () => {
    selectBundleMock.mockResolvedValue({
      mainModule: 'eh-module-url',
      mainWorker: 'eh-worker-url',
      pthreadWorker: null
    });
    queryMock.mockImplementation(async (_connection, sql: string) => {
      if (sql.includes('duckdb_coordinate_systems()')) {
        throw new Error('CRS warmup failed');
      }
      return undefined;
    });

    const engine = await import('$lib/features/duckdb/core/engine');

    await expect(engine.initEngine()).rejects.toThrow('CRS warmup failed');

    const executedSql = queryMock.mock.calls.map((call) => String(call[1]));

    expect(
      executedSql.some((sql) => sql.includes('duckdb_coordinate_systems()'))
    ).toBe(true);
  });

  it('keeps browser initialization on the documented non-pthread bundles with a single worker thread', async () => {
    selectBundleMock.mockResolvedValue({
      mainModule: 'eh-module-url',
      mainWorker: 'eh-worker-url',
      pthreadWorker: null
    });

    const engine = await import('$lib/features/duckdb/core/engine');

    await engine.initEngine();

    expect(engine.getContext().threadsSupported).toBe(false);
    expect(openMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maximumThreads: 1
      })
    );
  });
});
