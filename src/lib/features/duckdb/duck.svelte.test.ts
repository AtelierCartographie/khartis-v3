import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DuckDBContext } from './types';

const mocks = vi.hoisted(() => ({
  getContext: vi.fn(),
  initEngine: vi.fn(),
  isInitialized: vi.fn(),
  dropRegisteredFile: vi.fn(),
  loadMacros: vi.fn()
}));

vi.mock('./core/engine', () => ({
  getContext: mocks.getContext,
  initEngine: mocks.initEngine,
  isInitialized: mocks.isInitialized,
  loadMacros: mocks.loadMacros
}));

vi.mock('./core/query', () => ({
  executeQuery: vi.fn(),
  executeQueryStreaming: vi.fn()
}));

vi.mock('./io', () => ({
  readGeofile: vi.fn(),
  readTabular: vi.fn()
}));

vi.mock('./io/exporters', () => ({
  exportToCsv: vi.fn()
}));

vi.mock('./io/file-registry', () => ({
  dropRegisteredFile: mocks.dropRegisteredFile,
  registerFiles: vi.fn()
}));

vi.mock('./operations/analysis', () => ({
  analyse: vi.fn(),
  describeColumns: vi.fn()
}));

vi.mock('./operations/search', () => ({
  searchInTable: vi.fn()
}));

const { Duck, initDuckDB } = await import('./duck');

function createContext(): DuckDBContext {
  return {
    db: {} as DuckDBContext['db'],
    connection: {} as DuckDBContext['connection'],
    loaded_files: new Map([['sales', 'sales.csv']]),
    registered_files: new Set([
      'f_100-sales.csv',
      'f_200-sales_backup.csv',
      'f_300-other.csv'
    ]),
    table_files: new Map([['sales', 'f_100-sales.csv']]),
    table_metadata: new Map([['sales', {} as never]]),
    describeCache: new Map([['sales', { name: [], type: [] }]]),
    rowCountCache: new Map([['sales', 42]]),
    extensionsLoaded: { spatial: true, httpfs: false },
    extensionLoadPromises: { spatial: null, httpfs: null },
    localExtensionRepositoryConfigured: false,
    threadsSupported: false,
    bundleVariant: 'eh'
  };
}

describe('Duck.cleanupTableResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isInitialized.mockReturnValue(true);
    mocks.dropRegisteredFile.mockResolvedValue(undefined);
  });

  it('should drop the exact registered file id when the table has a recorded handle', () => {
    const ctx = createContext();
    mocks.getContext.mockReturnValue(ctx);

    Duck.cleanupTableResources('sales');

    expect(mocks.dropRegisteredFile).toHaveBeenCalledTimes(1);
    expect(mocks.dropRegisteredFile).toHaveBeenCalledWith(
      ctx.db,
      ctx.registered_files,
      'f_100-sales.csv'
    );
    expect(ctx.table_files.has('sales')).toBe(false);
    expect(ctx.loaded_files.has('sales')).toBe(false);
    expect(ctx.table_metadata.has('sales')).toBe(false);
    expect(ctx.describeCache.has('sales')).toBe(false);
    expect(ctx.rowCountCache.has('sales')).toBe(false);
  });

  it('should not drop any file when the table has no recorded handle', () => {
    const ctx = createContext();
    ctx.table_files.clear();
    mocks.getContext.mockReturnValue(ctx);

    Duck.cleanupTableResources('sales');

    expect(mocks.dropRegisteredFile).not.toHaveBeenCalled();
    expect(ctx.registered_files.size).toBe(3);
  });
});

describe('initDuckDB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isInitialized.mockReturnValue(false);
  });

  it('should share the active initialization when the engine becomes partially available', async () => {
    let resolveEngine: (() => void) | undefined;
    let resolveMacros: (() => void) | undefined;
    mocks.initEngine.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveEngine = resolve;
        })
    );
    mocks.loadMacros.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMacros = resolve;
        })
    );

    const initialization = initDuckDB();
    mocks.isInitialized.mockReturnValue(true);
    const concurrentInitialization = initDuckDB();
    let concurrentSettled = false;
    void concurrentInitialization.finally(() => {
      concurrentSettled = true;
    });

    await Promise.resolve();
    expect(concurrentSettled).toBe(false);

    resolveEngine?.();
    await vi.waitFor(() => expect(mocks.loadMacros).toHaveBeenCalledOnce());
    expect(concurrentSettled).toBe(false);

    resolveMacros?.();
    await Promise.all([initialization, concurrentInitialization]);

    expect(mocks.initEngine).toHaveBeenCalledOnce();
    expect(mocks.loadMacros).toHaveBeenCalledOnce();
  });
});
