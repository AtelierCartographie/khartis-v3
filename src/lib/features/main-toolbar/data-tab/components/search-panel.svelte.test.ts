import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_CONSTANTS } from '../../constants';
import SearchPanel from './search-panel.svelte';

const mocks = vi.hoisted(() => ({
  dataToolsState: {
    activeTool: 'search',
    replaceValue: '',
    searchQuery: '',
    searchSource: 'all'
  },
  searchInTable: vi.fn()
}));

vi.mock('../data-tools.store.svelte', () => ({
  dataToolsStore: {
    get activeTool() {
      return mocks.dataToolsState.activeTool;
    },
    get searchQuery() {
      return mocks.dataToolsState.searchQuery;
    },
    get searchSource() {
      return mocks.dataToolsState.searchSource;
    },
    get replaceValue() {
      return mocks.dataToolsState.replaceValue;
    },
    setSearchQuery(query: string) {
      mocks.dataToolsState.searchQuery = query;
    },
    setSearchSource(source: string) {
      mocks.dataToolsState.searchSource = source;
    },
    setReplaceValue(value: string) {
      mocks.dataToolsState.replaceValue = value;
    }
  }
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    get selectedDataset() {
      return {
        columns: [
          { name: 'place_name' },
          { name: 'category' },
          { name: 'segment' }
        ]
      };
    }
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    UI: 'ui'
  },
  logger: {
    error: vi.fn()
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    searchInTable: mocks.searchInTable
  }
}));

describe('SearchPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.searchInTable.mockReset();
    mocks.dataToolsState.searchQuery = '';
    mocks.dataToolsState.searchSource = 'all';
    mocks.dataToolsState.replaceValue = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps search results active after a query and enables exact-match replacement', async () => {
    mocks.searchInTable.mockResolvedValue({
      exactCount: 1,
      containsCount: 0,
      fuzzyCount: 0,
      totalCount: 1,
      results: [{ rowId: 2, columnName: 'place_name', score: 1.0 }]
    });

    const onSearchResults = vi.fn();

    render(SearchPanel, {
      props: {
        tableName: 'visualization_toolbox_cases',
        onSearchResults
      }
    });

    const searchbox = screen.getByRole('searchbox');
    await fireEvent.input(searchbox, { target: { value: 'Paris' } });

    await vi.advanceTimersByTimeAsync(UI_CONSTANTS.SEARCH_DEBOUNCE_MS);

    await waitFor(() => {
      expect(mocks.searchInTable).toHaveBeenCalledWith(
        'visualization_toolbox_cases',
        'Paris',
        { threshold: 0.85, column: undefined }
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /remplacer/i })).toBeEnabled();
      expect(
        screen.getByRole('button', { name: /résultat suivant/i })
      ).toBeEnabled();
    });

    expect(onSearchResults).toHaveBeenLastCalledWith({
      cellHighlights: [{ rowId: 2, columnName: 'place_name', type: 'exact' }],
      currentCell: { rowId: 2, columnName: 'place_name' },
      highlightedRowIds: [2]
    });
  });
});
