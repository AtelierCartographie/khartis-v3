import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const stateData = {
    initialized: true,
    initPromise: null as Promise<void> | null,
    datasetsVersion: 0,
    batch: false,
    metadataPrefetches: new Map<string, Promise<void>>(),
    datasets: [] as Array<Record<string, unknown>>,
    filtersByTable: new Map<string, Array<Record<string, unknown>>>(),
    currentTableName: null as string | null,
    filterCounter: 0
  };

  const getDatasetByTable = (tableName: string) =>
    stateData.datasets.find((d) => d.tableName === tableName);
  const getDatasetById = (id: string) =>
    stateData.datasets.find((d) => d.id === id);
  const getDatasetBySourceFile = (sourceFileId: string) =>
    stateData.datasets.find((d) => d.sourceFileId === sourceFileId);
  const findDatasetByIdOrSourceFile = (idOrSourceFileId: string) =>
    getDatasetById(idOrSourceFileId) ??
    getDatasetBySourceFile(idOrSourceFileId);

  const DuckMock = {
    query: vi.fn(),
    analyse: vi.fn(),
    invalidateTableCache: vi.fn()
  };

  return {
    stateData,
    DuckMock,
    initDuckDBMock: vi.fn(),
    showErrorMock: vi.fn(),
    loggerInfoMock: vi.fn(),
    loggerSuccessMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    loggerDebugMock: vi.fn(),
    extractMetadataMock: vi.fn(),
    detectSemioTypeMock: vi.fn(),
    createFilterRecordMock: vi.fn(),
    registerExistingTableMock: vi.fn(),
    updateDatasetTableNameMock: vi.fn(),
    processFileMock: vi.fn(),
    updateDatasetJoinInfoMock: vi.fn(),
    updateDatasetColumnsMock: vi.fn(),
    dropTableMock: vi.fn(),
    getBasemapAttributesIdMock: vi.fn(),
    computeJoinStatsMock: vi.fn(),
    applyJoinCorrectionsMock: vi.fn(),
    finalizeJoinMock: vi.fn(),
    getJoinedArrowTableMock: vi.fn(),
    joinDataWithBasemapMock: vi.fn(),
    getGPSArrowTableMock: vi.fn(),
    getGPSBoundsMock: vi.fn(),
    getTableDataMock: vi.fn(),
    getRowCountMock: vi.fn(),
    getRowPositionMock: vi.fn(),
    getRowStatsMock: vi.fn(),
    analyzeTableMock: vi.fn(),
    getBasicColumnInfoMock: vi.fn(),
    getFullAnalysisMock: vi.fn(),
    getExcludedRowIdsMock: vi.fn(),
    runQueryMock: vi.fn(),
    renameColumnMock: vi.fn(),
    changeColumnTypeMock: vi.fn(),
    dropColumnMock: vi.fn(),
    dropRowsMock: vi.fn(),
    refineColumnMock: vi.fn(),
    replaceInColumnMock: vi.fn(),
    addCalculatedColumnMock: vi.fn(),
    testExpressionMock: vi.fn(),
    buildYearFilterWhereClauseMock: vi.fn(),
    getArrowTableDirectMock: vi.fn(),
    getArrowTableWithCacheMock: vi.fn(),
    createArrowTableWithMetadataMock: vi.fn(),
    convertToProcessedDatasetMock: vi.fn(),
    searchInTableMock: vi.fn(),
    loadGeometryIntoDuckDBMock: vi.fn(),
    isInitializedMock: vi.fn(() => stateData.initialized),
    setInitializedMock: vi.fn((value: boolean) => {
      stateData.initialized = value;
    }),
    getInitPromiseMock: vi.fn(() => stateData.initPromise),
    setInitPromiseMock: vi.fn((value: Promise<void> | null) => {
      stateData.initPromise = value;
    }),
    getMetadataPrefetchesMock: vi.fn(() => stateData.metadataPrefetches),
    getDatasetsVersionMock: vi.fn(() => stateData.datasetsVersion),
    bumpDatasetsVersionMock: vi.fn(() => {
      stateData.datasetsVersion += 1;
    }),
    isBatchProcessingMock: vi.fn(() => stateData.batch),
    beginBatchMock: vi.fn(() => {
      stateData.batch = true;
    }),
    endBatchMock: vi.fn(() => {
      stateData.batch = false;
      stateData.datasetsVersion += 1;
    }),
    findDatasetByIdOrSourceFileMock: vi.fn((idOrSourceFileId: string) =>
      findDatasetByIdOrSourceFile(idOrSourceFileId)
    ),
    getDatasetByIdMock: vi.fn((id: string) => getDatasetById(id)),
    getDatasetByTableMock: vi.fn((tableName: string) =>
      getDatasetByTable(tableName)
    ),
    getDatasetBySourceFileMock: vi.fn((sourceFileId: string) =>
      getDatasetBySourceFile(sourceFileId)
    ),
    getAllDatasetsMock: vi.fn(() => [...stateData.datasets]),
    setDatasetArrowTableMock: vi.fn(
      (tableName: string, arrowTable: unknown) => {
        const dataset = getDatasetByTable(tableName);
        if (dataset) {
          dataset.arrowTableWithMetadata = arrowTable;
        }
      }
    ),
    getFiltersMock: vi.fn((tableName: string) => [
      ...(stateData.filtersByTable.get(tableName) ?? [])
    ]),
    setFiltersMock: vi.fn(
      (tableName: string, filters: Array<Record<string, unknown>>) => {
        stateData.filtersByTable.set(tableName, filters);
      }
    ),
    clearFiltersForTableMock: vi.fn((tableName: string) => {
      stateData.filtersByTable.set(tableName, []);
    }),
    getNextFilterIdMock: vi.fn(() => `f-${++stateData.filterCounter}`),
    getCurrentTableNameMock: vi.fn(() => stateData.currentTableName),
    setCurrentTableNameMock: vi.fn((tableName: string | null) => {
      stateData.currentTableName = tableName;
    }),
    clearStateMock: vi.fn(() => {
      stateData.datasets = [];
      stateData.filtersByTable = new Map();
      stateData.currentTableName = null;
      stateData.datasetsVersion += 1;
    })
  };
});

vi.mock('$lib/features/duckdb/duck', () => ({
  Duck: mocks.DuckMock,
  initDuckDB: mocks.initDuckDBMock
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    DUCKDB: 'DUCKDB',
    DATA: 'DATA'
  },
  logger: {
    info: mocks.loggerInfoMock,
    success: mocks.loggerSuccessMock,
    error: mocks.loggerErrorMock,
    debug: mocks.loggerDebugMock
  }
}));

vi.mock('$lib/features/commons/utils/notification.utils.svelte', () => ({
  showError: mocks.showErrorMock
}));

vi.mock('$lib/paraglide/messages', () => ({
  error_duckdb_init_title: () => 'DuckDB init',
  error_duckdb_init_message: () => 'Init failed',
  error_process_file_title: () => 'Process file',
  error_unknown: () => 'Unknown'
}));

vi.mock('$lib/features/data-pipeline', () => ({
  extractGeoArrowMetadata: mocks.extractMetadataMock
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    loadGeometryIntoDuckDB: mocks.loadGeometryIntoDuckDBMock
  }
}));

vi.mock('$lib/features/commons/utils/semio-detector.utils', () => ({
  detectSemioType: mocks.detectSemioTypeMock
}));

vi.mock('$lib/features/duckdb/orchestrator/arrow-ops', () => ({
  createArrowTableWithMetadata: mocks.createArrowTableWithMetadataMock,
  buildYearFilterWhereClause: mocks.buildYearFilterWhereClauseMock,
  getArrowTableDirect: mocks.getArrowTableDirectMock,
  getArrowTableWithCache: mocks.getArrowTableWithCacheMock
}));

vi.mock('$lib/features/duckdb/orchestrator/column-ops', () => ({
  renameColumn: mocks.renameColumnMock,
  changeColumnType: mocks.changeColumnTypeMock,
  dropColumn: mocks.dropColumnMock,
  dropRows: mocks.dropRowsMock,
  refineColumn: mocks.refineColumnMock,
  replaceInColumn: mocks.replaceInColumnMock,
  addCalculatedColumn: mocks.addCalculatedColumnMock,
  testExpression: mocks.testExpressionMock
}));

vi.mock('$lib/features/duckdb/orchestrator/conversion-ops', () => ({
  convertToProcessedDataset: mocks.convertToProcessedDatasetMock
}));

vi.mock('$lib/features/duckdb/orchestrator/dataset-ops', () => ({
  registerExistingTable: mocks.registerExistingTableMock,
  updateDatasetTableName: mocks.updateDatasetTableNameMock,
  processFile: mocks.processFileMock,
  updateDatasetJoinInfo: mocks.updateDatasetJoinInfoMock,
  updateDatasetColumns: mocks.updateDatasetColumnsMock,
  dropTable: mocks.dropTableMock
}));

vi.mock('$lib/features/duckdb/orchestrator/filter-ops', () => ({
  buildFilterWhereClause: vi.fn(() => null),
  createFilterRecord: mocks.createFilterRecordMock
}));

vi.mock('$lib/features/duckdb/orchestrator/gps-ops', () => ({
  getGPSArrowTable: mocks.getGPSArrowTableMock,
  getGPSBounds: mocks.getGPSBoundsMock
}));

vi.mock('$lib/features/duckdb/orchestrator/join-ops', () => ({
  getBasemapAttributesId: mocks.getBasemapAttributesIdMock,
  computeJoinStats: mocks.computeJoinStatsMock,
  applyJoinCorrections: mocks.applyJoinCorrectionsMock,
  finalizeJoin: mocks.finalizeJoinMock,
  getJoinedArrowTable: mocks.getJoinedArrowTableMock,
  joinDataWithBasemap: mocks.joinDataWithBasemapMock
}));

vi.mock('$lib/features/duckdb/orchestrator/search-ops', () => ({
  searchInTable: mocks.searchInTableMock
}));

vi.mock('$lib/features/duckdb/orchestrator/table-data-ops', () => ({
  getTableData: mocks.getTableDataMock,
  getRowCount: mocks.getRowCountMock,
  getRowPosition: mocks.getRowPositionMock,
  getRowStats: mocks.getRowStatsMock,
  analyzeTable: mocks.analyzeTableMock,
  getBasicColumnInfo: mocks.getBasicColumnInfoMock,
  getFullAnalysis: mocks.getFullAnalysisMock,
  getExcludedRowIds: mocks.getExcludedRowIdsMock,
  runQuery: mocks.runQueryMock
}));

vi.mock('$lib/features/duckdb/orchestrator/state.svelte', () => ({
  isInitialized: mocks.isInitializedMock,
  setInitialized: mocks.setInitializedMock,
  getInitPromise: mocks.getInitPromiseMock,
  setInitPromise: mocks.setInitPromiseMock,
  getMetadataPrefetches: mocks.getMetadataPrefetchesMock,
  getDatasetsVersion: mocks.getDatasetsVersionMock,
  bumpDatasetsVersion: mocks.bumpDatasetsVersionMock,
  isBatchProcessing: mocks.isBatchProcessingMock,
  beginBatch: mocks.beginBatchMock,
  endBatch: mocks.endBatchMock,
  findDatasetByIdOrSourceFile: mocks.findDatasetByIdOrSourceFileMock,
  getDatasetById: mocks.getDatasetByIdMock,
  getDatasetByTable: mocks.getDatasetByTableMock,
  getDatasetBySourceFile: mocks.getDatasetBySourceFileMock,
  getAllDatasets: mocks.getAllDatasetsMock,
  setDatasetArrowTable: mocks.setDatasetArrowTableMock,
  getFilters: mocks.getFiltersMock,
  getFiltersMap: vi.fn(() => mocks.stateData.filtersByTable),
  setFilters: mocks.setFiltersMock,
  clearFiltersForTable: mocks.clearFiltersForTableMock,
  getNextFilterId: mocks.getNextFilterIdMock,
  getCurrentTableName: mocks.getCurrentTableNameMock,
  setCurrentTableName: mocks.setCurrentTableNameMock,
  clearState: mocks.clearStateMock
}));

async function loadOrchestrator() {
  vi.resetModules();
  return import('$lib/features/duckdb/orchestrator/orchestrator.svelte');
}

function resetStateData() {
  mocks.stateData.initialized = true;
  mocks.stateData.initPromise = null;
  mocks.stateData.datasetsVersion = 0;
  mocks.stateData.batch = false;
  mocks.stateData.metadataPrefetches = new Map();
  mocks.stateData.datasets = [];
  mocks.stateData.filtersByTable = new Map();
  mocks.stateData.currentTableName = null;
  mocks.stateData.filterCounter = 0;
}

describe('duckDBOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStateData();
    mocks.initDuckDBMock.mockResolvedValue(undefined);
    mocks.createFilterRecordMock.mockImplementation(
      (
        _tableName: string,
        input: Record<string, unknown>,
        filterId: string
      ) => ({
        ...input,
        id: filterId,
        label: 'label',
        sql: 'sql'
      })
    );
  });

  it('initializes once and reuses existing init promise', async () => {
    mocks.stateData.initialized = false;
    const { duckDBOrchestrator } = await loadOrchestrator();

    await duckDBOrchestrator.waitForInitialization();

    expect(mocks.initDuckDBMock).toHaveBeenCalledTimes(1);
    expect(mocks.setInitializedMock).toHaveBeenCalledWith(true);
    expect(mocks.setInitPromiseMock).toHaveBeenCalledTimes(1);

    mocks.initDuckDBMock.mockClear();
    mocks.stateData.initialized = false;
    mocks.stateData.initPromise = Promise.resolve();

    await duckDBOrchestrator.waitForInitialization();
    expect(mocks.initDuckDBMock).not.toHaveBeenCalled();
  });

  it('surfaces init errors and reports UI notification', async () => {
    mocks.stateData.initialized = false;
    mocks.initDuckDBMock.mockRejectedValueOnce(new Error('boom'));
    const { duckDBOrchestrator } = await loadOrchestrator();

    await expect(duckDBOrchestrator.waitForInitialization()).rejects.toThrow(
      'boom'
    );

    expect(mocks.showErrorMock).toHaveBeenCalledWith(
      'DuckDB init',
      'Init failed'
    );
    expect(mocks.setInitPromiseMock).toHaveBeenLastCalledWith(null);
  });

  it('returns null and notifies when processFile fails', async () => {
    mocks.processFileMock.mockRejectedValueOnce(new Error('invalid csv'));
    const { duckDBOrchestrator } = await loadOrchestrator();

    const result = await duckDBOrchestrator.processFile({
      id: 'f1',
      name: 'bad.csv'
    } as never);

    expect(result).toBeNull();
    expect(mocks.showErrorMock).toHaveBeenCalledWith(
      'Process file',
      'invalid csv'
    );
  });

  it('applies join corrections and refreshes dataset columns', async () => {
    const dataset = {
      id: 'd1',
      sourceFileId: 's1',
      tableName: 'world_data'
    };
    mocks.stateData.datasets = [dataset];
    mocks.DuckMock.analyse.mockResolvedValueOnce([{ name: 'country' }]);
    const { duckDBOrchestrator } = await loadOrchestrator();

    await duckDBOrchestrator.applyJoinCorrections('d1', 'country', {
      Armenia: 'Armenie'
    });

    expect(mocks.applyJoinCorrectionsMock).toHaveBeenCalledWith(
      dataset,
      'country',
      { Armenia: 'Armenie' },
      mocks.DuckMock
    );
    expect(mocks.DuckMock.invalidateTableCache).toHaveBeenCalledWith(
      'world_data'
    );
    expect(mocks.updateDatasetColumnsMock).toHaveBeenCalledWith('d1', [
      { name: 'country' }
    ]);
  });

  it('forwards dataset/join/table operations to dedicated modules', async () => {
    const dataset = {
      id: 'd1',
      sourceFileId: 's1',
      tableName: 'world_data',
      columns: [{ name: 'country' }]
    };
    mocks.stateData.datasets = [dataset];

    mocks.registerExistingTableMock.mockResolvedValueOnce({ id: 'registered' });
    mocks.updateDatasetTableNameMock.mockResolvedValueOnce({ id: 'updated' });
    mocks.computeJoinStatsMock.mockResolvedValueOnce({ score: 0.9 });
    mocks.finalizeJoinMock.mockResolvedValueOnce({
      joinedBasemap: 'world.parquet',
      geoColumn: 'country'
    });
    mocks.getJoinedArrowTableMock.mockResolvedValueOnce({ rows: 1 });
    mocks.getGPSArrowTableMock.mockResolvedValueOnce({
      table: { rows: 1 },
      latColumn: 'lat',
      lonColumn: 'lon'
    });
    mocks.getGPSBoundsMock.mockResolvedValueOnce({
      minLon: -1,
      minLat: 40,
      maxLon: 2,
      maxLat: 50
    });
    mocks.getTableDataMock.mockResolvedValueOnce({ rows: 10 });
    mocks.getRowCountMock.mockResolvedValueOnce(10);
    mocks.getRowPositionMock.mockResolvedValueOnce(3);
    mocks.getRowStatsMock.mockResolvedValueOnce({ rows: 10 });
    mocks.analyzeTableMock.mockResolvedValueOnce([{ name: 'country' }]);
    mocks.getBasicColumnInfoMock.mockResolvedValueOnce([{ name: 'country' }]);
    mocks.getFullAnalysisMock.mockResolvedValueOnce([{ name: 'country' }]);
    mocks.renameColumnMock.mockResolvedValueOnce(undefined);
    mocks.changeColumnTypeMock.mockResolvedValueOnce(undefined);
    mocks.dropColumnMock.mockResolvedValueOnce(undefined);
    mocks.dropRowsMock.mockResolvedValueOnce(undefined);
    mocks.refineColumnMock.mockResolvedValueOnce(undefined);
    mocks.replaceInColumnMock.mockResolvedValueOnce(2);
    mocks.addCalculatedColumnMock.mockResolvedValueOnce([{ name: 'ratio' }]);
    mocks.testExpressionMock.mockResolvedValueOnce(42);
    mocks.runQueryMock.mockResolvedValueOnce({ rows: 1 });
    mocks.convertToProcessedDatasetMock.mockResolvedValueOnce({
      id: 'processed'
    });
    mocks.joinDataWithBasemapMock.mockResolvedValueOnce('joined_table');
    mocks.searchInTableMock.mockResolvedValueOnce({ totalRows: 2 });
    mocks.processFileMock.mockResolvedValueOnce({ id: 'processed-file' });

    const { duckDBOrchestrator } = await loadOrchestrator();

    expect(
      await duckDBOrchestrator.registerExistingTable(
        'table_a',
        'sf1',
        'file.csv'
      )
    ).toEqual({ id: 'registered' });
    expect(
      await duckDBOrchestrator.updateDatasetTableName('s1', 'renamed')
    ).toEqual({ id: 'updated' });
    expect(
      await duckDBOrchestrator.computeJoinStats(
        'd1',
        { file: 'world.parquet' } as never,
        'country'
      )
    ).toEqual({ score: 0.9 });
    await duckDBOrchestrator.finalizeJoin(
      'd1',
      { file: 'world.parquet' } as never,
      'country'
    );
    expect(
      await duckDBOrchestrator.getJoinedArrowTable('world_data', 'world')
    ).toEqual({ rows: 1 });
    expect(await duckDBOrchestrator.getGPSArrowTable('d1')).toEqual({
      table: { rows: 1 },
      latColumn: 'lat',
      lonColumn: 'lon'
    });
    expect(await duckDBOrchestrator.getGPSBounds('d1')).toEqual({
      minLon: -1,
      minLat: 40,
      maxLon: 2,
      maxLat: 50
    });
    expect(await duckDBOrchestrator.getTableData('world_data')).toEqual({
      rows: 10
    });
    expect(await duckDBOrchestrator.getRowCount('world_data')).toBe(10);
    expect(await duckDBOrchestrator.getRowPosition('world_data', 7)).toBe(3);
    expect(await duckDBOrchestrator.getRowStats('world_data')).toEqual({
      rows: 10
    });
    expect(await duckDBOrchestrator.analyzeTable('world_data')).toEqual([
      { name: 'country' }
    ]);
    expect(await duckDBOrchestrator.getBasicColumnInfo('world_data')).toEqual([
      { name: 'country' }
    ]);
    expect(await duckDBOrchestrator.getFullAnalysis('world_data')).toEqual([
      { name: 'country' }
    ]);
    await duckDBOrchestrator.renameColumn(
      'world_data',
      'country',
      'country_name'
    );
    await duckDBOrchestrator.changeColumnType(
      'world_data',
      'country_name',
      'TEXT'
    );
    await duckDBOrchestrator.dropColumn('world_data', 'obsolete');
    await duckDBOrchestrator.dropRows('world_data', [1, 2]);
    await duckDBOrchestrator.refineColumn(
      'world_data',
      'country_name',
      'lowercase' as never
    );
    expect(
      await duckDBOrchestrator.replaceInColumn(
        'world_data',
        'country_name',
        'fr',
        'france'
      )
    ).toBe(2);
    await duckDBOrchestrator.addCalculatedColumn('world_data', 'ratio', '1');
    expect(await duckDBOrchestrator.testExpression('world_data', '1 + 1')).toBe(
      42
    );
    expect(await duckDBOrchestrator.runQuery('SELECT 1')).toEqual({ rows: 1 });
    expect(
      await duckDBOrchestrator.processFile({ id: 'f-1' } as never)
    ).toEqual({
      id: 'processed-file'
    });
    expect(
      await duckDBOrchestrator.convertToProcessedDataset(dataset as never)
    ).toEqual({
      id: 'processed'
    });
    expect(
      await duckDBOrchestrator.joinDataWithBasemap(
        'world_data',
        'country_name',
        'basemap_table',
        'id'
      )
    ).toBe('joined_table');
    expect(await duckDBOrchestrator.searchInTable('world_data', 'fra')).toEqual(
      {
        totalRows: 2
      }
    );

    expect(mocks.updateDatasetJoinInfoMock).toHaveBeenCalledWith('d1', {
      joinedBasemap: 'world.parquet',
      geoColumn: 'country'
    });
    expect(mocks.updateDatasetColumnsMock).toHaveBeenCalledWith('d1', [
      { name: 'ratio' }
    ]);
  });

  it('throws explicit errors when join dataset is missing', async () => {
    const { duckDBOrchestrator } = await loadOrchestrator();

    await expect(
      duckDBOrchestrator.computeJoinStats(
        'missing',
        { file: 'world.parquet' } as never,
        'country'
      )
    ).rejects.toThrow('Dataset not found');
  });

  it('logs and rethrows finalizeJoin failures', async () => {
    const dataset = { id: 'd1', sourceFileId: 's1', tableName: 'world_data' };
    mocks.stateData.datasets = [dataset];
    mocks.finalizeJoinMock.mockRejectedValueOnce(new Error('join fail'));
    const { duckDBOrchestrator } = await loadOrchestrator();

    await expect(
      duckDBOrchestrator.finalizeJoin(
        'd1',
        { file: 'world.parquet' } as never,
        'country'
      )
    ).rejects.toThrow('join fail');

    expect(mocks.loggerErrorMock).toHaveBeenCalled();
  });

  it('renames filtered columns and updates cache/version', async () => {
    mocks.stateData.filtersByTable.set('world_data', [
      {
        id: 'f-1',
        column: 'old_name',
        operator: 'equals',
        value: 'A',
        label: 'old',
        sql: 'old'
      },
      {
        id: 'f-2',
        column: 'other_col',
        operator: 'equals',
        value: 'B',
        label: 'other',
        sql: 'other'
      }
    ]);
    const { duckDBOrchestrator } = await loadOrchestrator();

    await duckDBOrchestrator.renameColumn('world_data', 'old_name', 'new_name');

    expect(mocks.renameColumnMock).toHaveBeenCalledWith(
      'world_data',
      'old_name',
      'new_name',
      mocks.DuckMock,
      undefined
    );
    const updated = mocks.stateData.filtersByTable.get('world_data') ?? [];
    expect(updated[0].column).toBe('new_name');
    expect(updated[1].column).toBe('other_col');
    expect(mocks.DuckMock.invalidateTableCache).toHaveBeenCalledWith(
      'world_data'
    );
    expect(mocks.bumpDatasetsVersionMock).toHaveBeenCalled();
  });

  it('supports skipAnalysis on rename without invalidating cache', async () => {
    mocks.stateData.filtersByTable.set('world_data', []);
    const { duckDBOrchestrator } = await loadOrchestrator();

    await duckDBOrchestrator.renameColumn(
      'world_data',
      'old_name',
      'new_name',
      { skipAnalysis: true }
    );

    expect(mocks.DuckMock.invalidateTableCache).not.toHaveBeenCalled();
    expect(mocks.bumpDatasetsVersionMock).not.toHaveBeenCalled();
  });

  it('deletes filtered rows only when excluded ids exist', async () => {
    const { duckDBOrchestrator } = await loadOrchestrator();

    mocks.getExcludedRowIdsMock.mockResolvedValueOnce([]);
    await expect(
      duckDBOrchestrator.deleteFilteredRows('world_data')
    ).resolves.toEqual({ count: 0, rowIds: [] });
    expect(mocks.dropRowsMock).not.toHaveBeenCalled();

    mocks.getExcludedRowIdsMock.mockResolvedValueOnce([7, 8, 9]);
    await expect(
      duckDBOrchestrator.deleteFilteredRows('world_data')
    ).resolves.toEqual({ count: 3, rowIds: [7, 8, 9] });
    expect(mocks.dropRowsMock).toHaveBeenCalledWith(
      'world_data',
      [7, 8, 9],
      mocks.DuckMock
    );
    expect(mocks.DuckMock.invalidateTableCache).toHaveBeenCalledWith(
      'world_data'
    );
  });

  it('wraps Arrow table failures into DuckDBError', async () => {
    mocks.getArrowTableWithCacheMock.mockRejectedValueOnce(new Error('ipc'));
    const { duckDBOrchestrator } = await loadOrchestrator();

    await expect(
      duckDBOrchestrator.getArrowTable('bad_table')
    ).rejects.toMatchObject({
      name: 'DuckDBError',
      message: 'Failed to get Arrow table for bad_table'
    });
    expect(mocks.loggerErrorMock).toHaveBeenCalled();
  });

  it('adds and removes table filters in state', async () => {
    const { duckDBOrchestrator } = await loadOrchestrator();

    const added = await duckDBOrchestrator.addFilter('world_data', {
      column: 'country',
      operator: 'contains',
      value: 'fra'
    });
    expect(added).toHaveLength(1);
    expect(added[0].id).toBe('f-1');
    expect(mocks.stateData.datasetsVersion).toBe(1);

    const removed = await duckDBOrchestrator.removeFilter('world_data', 'f-1');
    expect(removed).toEqual([]);
    expect(mocks.stateData.datasetsVersion).toBe(2);

    duckDBOrchestrator.clearFilters('world_data');
    expect(mocks.stateData.datasetsVersion).toBe(3);
  });

  it('builds direct Arrow reads with year-filter helper', async () => {
    const cachedArrow = { name: 'cached-arrow' };
    mocks.stateData.datasets = [
      {
        id: 'd1',
        tableName: 'world_data',
        arrowTableWithMetadata: cachedArrow
      }
    ];
    mocks.buildYearFilterWhereClauseMock.mockReturnValueOnce(
      'WHERE year = 2020'
    );
    mocks.getArrowTableDirectMock.mockResolvedValueOnce({
      name: 'arrow-table'
    });
    const { duckDBOrchestrator } = await loadOrchestrator();

    const table = await duckDBOrchestrator.getArrowTableDirect('world_data', {
      column: 'year',
      value: 2020
    });

    expect(table).toEqual({ name: 'arrow-table' });
    expect(mocks.getArrowTableDirectMock).toHaveBeenCalledWith(
      'world_data',
      mocks.DuckMock,
      expect.any(Function),
      expect.any(Function),
      'WHERE year = 2020'
    );
  });

  it('clears orchestrator by dropping all tables and resetting state', async () => {
    mocks.stateData.datasets = [
      { id: 'd1', tableName: 'table_a' },
      { id: 'd2', tableName: 'table_b' }
    ];
    const { duckDBOrchestrator } = await loadOrchestrator();

    await duckDBOrchestrator.clear();

    expect(mocks.dropTableMock).toHaveBeenCalledWith('table_a', mocks.DuckMock);
    expect(mocks.dropTableMock).toHaveBeenCalledWith('table_b', mocks.DuckMock);
    expect(mocks.clearFiltersForTableMock).toHaveBeenCalledWith('table_a');
    expect(mocks.clearFiltersForTableMock).toHaveBeenCalledWith('table_b');
    expect(mocks.clearStateMock).toHaveBeenCalled();
  });

  it('handles missing datasets in GPS methods', async () => {
    const { duckDBOrchestrator } = await loadOrchestrator();

    await expect(
      duckDBOrchestrator.getGPSArrowTable('missing')
    ).rejects.toThrow('Dataset missing not found');
    await expect(
      duckDBOrchestrator.getGPSBounds('missing')
    ).resolves.toBeNull();
  });
});
