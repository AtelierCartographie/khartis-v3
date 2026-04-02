import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const context = {
    db: { id: 'db' },
    connection: { id: 'conn' },
    loaded_files: new Map<string, unknown>(),
    registered_files: new Set<string>(),
    table_metadata: new Map<string, unknown>()
  };

  return {
    context,
    isInitializedMock: vi.fn<() => boolean>(),
    getContextMock: vi.fn(() => context),
    initEngineMock: vi.fn<() => Promise<void>>(),
    loadMacrosMock: vi.fn<(macros: string) => Promise<void>>(),
    executeQueryMock: vi.fn(),
    registerFilesMock: vi.fn(),
    readTabularMock: vi.fn(),
    readGeofileMock: vi.fn(),
    readLinkMock: vi.fn(),
    describeTableMock: vi.fn(),
    getRowCountMock: vi.fn(),
    dropRowsMock: vi.fn(),
    exportToCsvMock: vi.fn(),
    describeColumnsMock: vi.fn(),
    analyseMock: vi.fn(),
    searchInTableMock: vi.fn(),
    joinByIdMock: vi.fn(),
    applyJoinAssociationMock: vi.fn(),
    getTableMetadataMock: vi.fn(),
    markTableMutatedMock: vi.fn()
  };
});

vi.mock('$lib/features/duckdb/core/engine', () => ({
  isInitialized: mocks.isInitializedMock,
  getContext: mocks.getContextMock,
  initEngine: mocks.initEngineMock,
  loadMacros: mocks.loadMacrosMock
}));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: mocks.executeQueryMock
}));

vi.mock('$lib/features/duckdb/io/file-registry', () => ({
  registerFiles: mocks.registerFilesMock
}));

vi.mock('$lib/features/duckdb/io/readers', () => ({
  readTabular: mocks.readTabularMock,
  readGeofile: mocks.readGeofileMock,
  readLink: mocks.readLinkMock
}));

vi.mock('$lib/features/duckdb/io/exporters', () => ({
  exportToCsv: mocks.exportToCsvMock
}));

vi.mock('$lib/features/duckdb/operations/table-ops', () => ({
  describeTable: mocks.describeTableMock,
  getRowCount: mocks.getRowCountMock,
  dropRows: mocks.dropRowsMock
}));

vi.mock('$lib/features/duckdb/operations/analysis', () => ({
  describeColumns: mocks.describeColumnsMock,
  analyse: mocks.analyseMock
}));

vi.mock('$lib/features/duckdb/operations/search', () => ({
  searchInTable: mocks.searchInTableMock
}));

vi.mock('$lib/features/duckdb/operations/join', () => ({
  joinById: mocks.joinByIdMock,
  applyJoinAssociation: mocks.applyJoinAssociationMock
}));

vi.mock('$lib/features/duckdb/cache/cache-manager', () => ({
  getTableMetadata: mocks.getTableMetadataMock,
  markTableMutated: mocks.markTableMutatedMock
}));

vi.mock('$lib/features/duckdb/macros/breaks', () => ({
  breaks: 'BREAKS;'
}));
vi.mock('$lib/features/duckdb/macros/analyse', () => ({
  analyse: 'ANALYSE;'
}));
vi.mock('$lib/features/duckdb/macros/join', () => ({
  join_macros: 'JOIN;'
}));
vi.mock('$lib/features/duckdb/macros/search', () => ({
  search_macros: 'SEARCH;'
}));
vi.mock('$lib/features/duckdb/macros/simplification', () => ({
  simplification_macros: 'SIMPLIFICATION;'
}));

async function loadDuckModule() {
  vi.resetModules();
  return import('$lib/features/duckdb/duck');
}

describe('duck facade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.loaded_files = new Map<string, unknown>();
    mocks.context.registered_files = new Set<string>();
    mocks.context.table_metadata = new Map<string, unknown>();
    mocks.isInitializedMock.mockReturnValue(true);
    mocks.getContextMock.mockReturnValue(mocks.context);
  });

  it('expose context getters when engine is initialized', async () => {
    const { Duck } = await loadDuckModule();

    expect(Duck.db).toBe(mocks.context.db);
    expect(Duck.connection).toBe(mocks.context.connection);
    expect(Duck.loaded_files).toBe(mocks.context.loaded_files);
    expect(Duck.registered_files).toBe(mocks.context.registered_files);
    expect(Duck.table_metadata).toBe(mocks.context.table_metadata);
  });

  it('returns empty placeholders from getters when engine is not initialized', async () => {
    mocks.isInitializedMock.mockReturnValue(false);
    const { Duck } = await loadDuckModule();

    expect(Duck.db).toBeNull();
    expect(Duck.connection).toBeNull();
    expect(Duck.loaded_files).toBeInstanceOf(Map);
    expect(Duck.loaded_files.size).toBe(0);
    expect(Duck.registered_files).toBeInstanceOf(Set);
    expect(Duck.registered_files.size).toBe(0);
    expect(Duck.table_metadata).toBeInstanceOf(Map);
    expect(Duck.table_metadata.size).toBe(0);
  });

  it('forwards query/read/export operations to underlying modules', async () => {
    const { Duck } = await loadDuckModule();

    mocks.executeQueryMock.mockResolvedValueOnce(['q']);
    mocks.registerFilesMock.mockResolvedValueOnce(undefined);
    mocks.readTabularMock.mockResolvedValueOnce('tab_table');
    mocks.readGeofileMock.mockResolvedValueOnce('geo_table');
    mocks.readLinkMock.mockResolvedValueOnce('link_table');
    mocks.describeTableMock.mockResolvedValueOnce({ name: ['a'], type: ['b'] });
    mocks.getRowCountMock.mockResolvedValueOnce(42);
    mocks.dropRowsMock.mockResolvedValueOnce(undefined);
    mocks.exportToCsvMock.mockResolvedValueOnce('csv-content');
    mocks.describeColumnsMock.mockResolvedValueOnce([{ name: 'x' }]);
    mocks.analyseMock.mockResolvedValueOnce([{ name: 'x' }]);
    mocks.searchInTableMock.mockResolvedValueOnce({ totalRows: 1 });
    mocks.joinByIdMock.mockResolvedValueOnce([{ name: 'join' }]);
    mocks.applyJoinAssociationMock.mockResolvedValueOnce(undefined);
    mocks.getTableMetadataMock.mockReturnValueOnce({ analysis: null });

    await expect(Duck.query('SELECT 1', { format: 'array' })).resolves.toEqual([
      'q'
    ]);
    await Duck.register_files([new File(['a'], 'a.csv')]);
    await expect(Duck.read_tabular('input.csv')).resolves.toBe('tab_table');
    await expect(Duck.read_geofile(new File(['x'], 'x.geojson'))).resolves.toBe(
      'geo_table'
    );
    await expect(Duck.read_link('https://example.com')).resolves.toBe(
      'link_table'
    );
    await expect(Duck.describe_table('table_a')).resolves.toEqual({
      name: ['a'],
      type: ['b']
    });
    await expect(Duck.get_row_count('table_a')).resolves.toBe(42);
    await Duck.drop_rows('table_a', [1, 2]);
    await expect(Duck.copy_to_csv_as_string('table_a')).resolves.toBe(
      'csv-content'
    );
    await expect(Duck.describeColumns('table_a')).resolves.toEqual([
      { name: 'x' }
    ]);
    await expect(Duck.analyse('table_a')).resolves.toEqual([{ name: 'x' }]);
    await expect(Duck.searchInTable('table_a', 'paris')).resolves.toEqual({
      totalRows: 1
    });
    await expect(Duck.join_by_id('table_a', 'id')).resolves.toEqual([
      { name: 'join' }
    ]);
    await Duck.apply_join_association('table_a', 'world');
    expect(Duck.get_table_metadata('table_a')).toEqual({ analysis: null });

    expect(mocks.executeQueryMock).toHaveBeenCalledWith(
      mocks.context.connection,
      'SELECT 1',
      { format: 'array' }
    );
    expect(mocks.registerFilesMock).toHaveBeenCalledWith(
      mocks.context.db,
      mocks.context.registered_files,
      expect.any(Array),
      undefined
    );
    expect(mocks.markTableMutatedMock).not.toHaveBeenCalled();
  });

  it('invalidates and retrieves metadata through cache-manager', async () => {
    const { Duck } = await loadDuckModule();

    Duck.invalidateTableCache('table_a');
    Duck.get_table_metadata('table_a');

    expect(mocks.markTableMutatedMock).toHaveBeenCalledWith(
      mocks.context,
      'table_a'
    );
    expect(mocks.getTableMetadataMock).toHaveBeenCalledWith(
      mocks.context,
      'table_a'
    );
  });

  it('cleans up table resources when initialized', async () => {
    const { Duck } = await loadDuckModule();
    mocks.context.loaded_files.set('cities', { id: 1 });
    mocks.context.registered_files.add('tmp_cities.csv');
    mocks.context.registered_files.add('tmp_other.csv');
    mocks.context.table_metadata.set('cities', { analysis: null });

    Duck.cleanupTableResources('cities');

    expect(mocks.context.loaded_files.has('cities')).toBe(false);
    expect(
      Array.from(mocks.context.registered_files).some((id) =>
        id.includes('cities')
      )
    ).toBe(false);
    expect(mocks.context.table_metadata.has('cities')).toBe(false);
    expect(mocks.context.registered_files.has('tmp_other.csv')).toBe(true);
  });

  it('does not cleanup resources when engine is not initialized', async () => {
    mocks.isInitializedMock.mockReturnValue(false);
    const { Duck } = await loadDuckModule();
    mocks.context.loaded_files.set('cities', { id: 1 });

    Duck.cleanupTableResources('cities');

    expect(mocks.context.loaded_files.has('cities')).toBe(true);
  });
});

describe('initDuckDB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isInitializedMock.mockReturnValue(false);
  });

  it('returns early when engine is already initialized', async () => {
    mocks.isInitializedMock.mockReturnValue(true);
    const { initDuckDB } = await loadDuckModule();

    await initDuckDB();

    expect(mocks.initEngineMock).not.toHaveBeenCalled();
    expect(mocks.loadMacrosMock).not.toHaveBeenCalled();
  });

  it('initializes engine once and loads all macros in order', async () => {
    mocks.initEngineMock.mockResolvedValueOnce(undefined);
    mocks.loadMacrosMock.mockResolvedValueOnce(undefined);
    const { initDuckDB } = await loadDuckModule();

    await initDuckDB();

    expect(mocks.initEngineMock).toHaveBeenCalledTimes(1);
    expect(mocks.loadMacrosMock).toHaveBeenCalledWith(
      'BREAKS;ANALYSE;JOIN;SEARCH;SIMPLIFICATION;'
    );
  });

  it('deduplicates concurrent initialization requests', async () => {
    let resolveInit: (() => void) | undefined;
    mocks.initEngineMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveInit = resolve;
        })
    );
    mocks.loadMacrosMock.mockResolvedValueOnce(undefined);

    const { initDuckDB } = await loadDuckModule();
    const p1 = initDuckDB();
    const p2 = initDuckDB();

    expect(mocks.initEngineMock).toHaveBeenCalledTimes(1);
    resolveInit?.();
    await Promise.all([p1, p2]);
    expect(mocks.loadMacrosMock).toHaveBeenCalledTimes(1);
  });

  it('resets init promise after failure so a retry can succeed', async () => {
    mocks.initEngineMock
      .mockRejectedValueOnce(new Error('init failed'))
      .mockResolvedValueOnce(undefined);
    mocks.loadMacrosMock.mockResolvedValueOnce(undefined);

    const { initDuckDB } = await loadDuckModule();

    await expect(initDuckDB()).rejects.toThrow('init failed');
    await expect(initDuckDB()).resolves.toBeUndefined();

    expect(mocks.initEngineMock).toHaveBeenCalledTimes(2);
    expect(mocks.loadMacrosMock).toHaveBeenCalledTimes(1);
  });
});
