import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  duckQuery: vi.fn(),
  searchInTable: vi.fn(),
  getDatasetBySourceFile: vi.fn(),
  pinAt: vi.fn(),
  unpin: vi.fn(),
  setHighlightedRows: vi.fn(),
  clearHighlights: vi.fn(),
  dataset: {
    id: 'dataset-1',
    sourceFileId: 'source-1',
    columns: [
      { name: 'OGC_FID', type: 'integer' },
      { name: 'NUTS_ID', type: 'text' },
      { name: 'NAME_LATN', type: 'text' },
      { name: 'geom', type: 'geometry' },
      { name: '__id', type: 'integer' }
    ]
  }
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    get selectedDataset() {
      return mocks.dataset;
    },
    get enabledDatasets() {
      return [mocks.dataset];
    },
    get datasets() {
      return [mocks.dataset];
    }
  }
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: {
    get selectedVisualization() {
      return undefined;
    }
  }
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    query: mocks.duckQuery
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    getDatasetBySourceFile: mocks.getDatasetBySourceFile,
    searchInTable: mocks.searchInTable
  }
}));

vi.mock('$lib/features/map/stores/map-highlight.store.svelte', () => ({
  mapHighlightStore: {
    setHighlightedRows: mocks.setHighlightedRows,
    clearHighlights: mocks.clearHighlights
  }
}));

vi.mock('$lib/features/map/stores/map-tooltip.store.svelte', () => ({
  mapTooltipStore: {
    pinAt: mocks.pinAt,
    unpin: mocks.unpin
  }
}));

describe('search store tooltip integration', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.duckQuery.mockReset();
    mocks.searchInTable.mockReset();
    mocks.getDatasetBySourceFile.mockReset();
    mocks.pinAt.mockReset();
    mocks.unpin.mockReset();
    mocks.setHighlightedRows.mockReset();
    mocks.clearHighlights.mockReset();

    mocks.getDatasetBySourceFile.mockReturnValue({
      tableName: 'nuts2_table'
    });
    mocks.searchInTable.mockResolvedValue({
      exactCount: 1,
      containsCount: 0,
      fuzzyCount: 0,
      totalCount: 1,
      results: [
        {
          rowId: 55,
          columnName: 'NAME_LATN',
          value: 'Braunschweig',
          score: 1
        }
      ]
    });
    const duckRow: Record<string, unknown> = {};
    Object.defineProperties(duckRow, {
      __id: { value: 55, enumerable: false },
      OGC_FID: { value: 54, enumerable: false },
      NUTS_ID: { value: 'DE91', enumerable: false },
      NAME_LATN: { value: 'Braunschweig', enumerable: false },
      geom: { value: 'binary-geom', enumerable: false }
    });
    mocks.duckQuery.mockResolvedValue([duckRow]);
  });

  it('pins a tooltip for a search result without relying on EXCLUDE geometry columns', async () => {
    const { searchActions } = await import('./search.store.svelte');

    searchActions.clearSearch();
    searchActions.setSearchValue('Braunschweig');
    await searchActions.performSearch();

    expect(mocks.searchInTable).toHaveBeenCalledWith(
      'nuts2_table',
      'Braunschweig',
      {
        threshold: 0.85,
        column: undefined
      }
    );
    expect(mocks.duckQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        'SELECT * FROM "nuts2_table" WHERE __id = 55 LIMIT 1'
      ),
      { format: 'array' }
    );
    expect(mocks.duckQuery.mock.calls[0]?.[0]).not.toContain('EXCLUDE');
    expect(mocks.setHighlightedRows).toHaveBeenCalledWith([55]);
    expect(mocks.pinAt).toHaveBeenCalledTimes(1);

    const entries = mocks.pinAt.mock.calls[0]?.[2];
    expect(entries).toEqual(
      expect.arrayContaining([
        { key: 'OGC_FID', value: '54' },
        { key: 'NUTS_ID', value: 'DE91' },
        { key: 'NAME_LATN', value: 'Braunschweig' }
      ])
    );
    expect(entries).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: '__id' }),
        expect.objectContaining({ key: 'geom' })
      ])
    );
  });
});
