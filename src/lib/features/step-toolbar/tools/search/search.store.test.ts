import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { searchState, searchActions } from './search.store.svelte';
import type { SearchState } from './search.types';

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    datasets: [],
    selectedDataset: null,
    enabledDatasets: [],
    recordTransformation: vi.fn()
  }
}));

vi.mock('$lib/features/commons/store/project.store.svelte', () => ({
  projectStore: {
    addColumnTransformation: vi.fn()
  }
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: {
    selectedVisualization: null
  }
}));

vi.mock('$lib/features/duckdb', () => ({
  duckDBOrchestrator: {
    getDatasetBySourceFile: vi.fn(),
    searchInTable: vi.fn(),
    replaceInColumn: vi.fn()
  }
}));

vi.mock('$lib/features/map/stores/map-highlight.store.svelte', () => ({
  mapHighlightStore: {
    setHighlightedRows: vi.fn(),
    clearHighlights: vi.fn()
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  },
  LogCategory: {
    UI: 'UI'
  }
}));

import { duckDBOrchestrator } from '$lib/features/duckdb';
import { mapHighlightStore } from '$lib/features/map/stores/map-highlight.store.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';

const mockedOrchestrator = vi.mocked(duckDBOrchestrator);
const mockedHighlightStore = vi.mocked(mapHighlightStore);
const mockedDatasetsStore = vi.mocked(datasetsStore);

describe('search.store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchActions.clearSearch();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('has correct default values', () => {
      expect(searchState.searchValue).toBe('');
      expect(searchState.selectedSource).toBe('all');
      expect(searchState.replaceValue).toBe('');
      expect(searchState.results).toEqual([]);
      expect(searchState.currentResultIndex).toBe(0);
      expect(searchState.isSearching).toBe(false);
    });
  });

  describe('setSearchValue', () => {
    it('updates search value', () => {
      searchActions.setSearchValue('test');
      expect(searchState.searchValue).toBe('test');
    });

    it('does not search when value is too short', () => {
      searchActions.setSearchValue('a');

      vi.advanceTimersByTime(300);

      expect(mockedOrchestrator.searchInTable).not.toHaveBeenCalled();
    });

    it('debounces search requests', async () => {
      mockedDatasetsStore.enabledDatasets = [
        { id: 'ds1', sourceFileId: 'sf1' } as never
      ];
      mockedOrchestrator.getDatasetBySourceFile.mockReturnValue({
        tableName: 'test_table'
      } as never);
      mockedOrchestrator.searchInTable.mockResolvedValue({
        exactCount: 0,
        containsCount: 0,
        fuzzyCount: 0,
        totalCount: 0,
        results: []
      });

      searchActions.setSearchValue('test');
      searchActions.setSearchValue('testing');
      searchActions.setSearchValue('tested');

      expect(mockedOrchestrator.searchInTable).not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);

      expect(mockedOrchestrator.searchInTable).toHaveBeenCalledTimes(1);
      expect(mockedOrchestrator.searchInTable).toHaveBeenCalledWith(
        'test_table',
        'tested',
        expect.objectContaining({ threshold: 0.85 })
      );
    });

    it('clears results when search value is cleared', () => {
      searchActions.setSearchValue('test');
      vi.advanceTimersByTime(300);

      searchActions.setSearchValue('');

      expect(searchState.results).toEqual([]);
      expect(mockedHighlightStore.clearHighlights).toHaveBeenCalled();
    });
  });

  describe('setSelectedSource', () => {
    it('updates selected source', () => {
      searchActions.setSelectedSource('country');
      expect(searchState.selectedSource).toBe('country');
    });
  });

  describe('setReplaceValue', () => {
    it('updates replace value', () => {
      searchActions.setReplaceValue('new_value');
      expect(searchState.replaceValue).toBe('new_value');
    });
  });

  describe('toggleCaseSensitive', () => {
    it('toggles case sensitivity', () => {
      expect(searchState.caseSensitive).toBe(false);

      searchActions.toggleCaseSensitive();
      expect(searchState.caseSensitive).toBe(true);

      searchActions.toggleCaseSensitive();
      expect(searchState.caseSensitive).toBe(false);
    });
  });

  describe('toggleUseRegex', () => {
    it('toggles regex mode', () => {
      expect(searchState.useRegex).toBe(false);

      searchActions.toggleUseRegex();
      expect(searchState.useRegex).toBe(true);

      searchActions.toggleUseRegex();
      expect(searchState.useRegex).toBe(false);
    });
  });

  describe('toggleWholeWord', () => {
    it('toggles whole word mode', () => {
      expect(searchState.wholeWord).toBe(false);

      searchActions.toggleWholeWord();
      expect(searchState.wholeWord).toBe(true);

      searchActions.toggleWholeWord();
      expect(searchState.wholeWord).toBe(false);
    });
  });

  describe('goToNextResult', () => {
    it('does nothing when no results', () => {
      searchActions.goToNextResult();
      expect(searchState.currentResultIndex).toBe(0);
    });

    it('moves to next result', () => {
      (searchState as unknown as { results: SearchState['results'] }).results =
        [
          { rowId: 1, columnName: 'name', value: 'test1', score: 1 },
          { rowId: 2, columnName: 'name', value: 'test2', score: 0.9 }
        ];
      (
        searchState as unknown as { currentResultIndex: number }
      ).currentResultIndex = 0;

      searchActions.goToNextResult();
      expect(searchState.currentResultIndex).toBe(1);
    });

    it('wraps to first result from last', () => {
      (searchState as unknown as { results: SearchState['results'] }).results =
        [
          { rowId: 1, columnName: 'name', value: 'test1', score: 1 },
          { rowId: 2, columnName: 'name', value: 'test2', score: 0.9 }
        ];
      (
        searchState as unknown as { currentResultIndex: number }
      ).currentResultIndex = 1;

      searchActions.goToNextResult();
      expect(searchState.currentResultIndex).toBe(0);
    });
  });

  describe('goToPreviousResult', () => {
    it('does nothing when no results', () => {
      searchActions.goToPreviousResult();
      expect(searchState.currentResultIndex).toBe(0);
    });

    it('moves to previous result', () => {
      (searchState as unknown as { results: SearchState['results'] }).results =
        [
          { rowId: 1, columnName: 'name', value: 'test1', score: 1 },
          { rowId: 2, columnName: 'name', value: 'test2', score: 0.9 }
        ];
      (
        searchState as unknown as { currentResultIndex: number }
      ).currentResultIndex = 1;

      searchActions.goToPreviousResult();
      expect(searchState.currentResultIndex).toBe(0);
    });

    it('wraps to last result from first', () => {
      (searchState as unknown as { results: SearchState['results'] }).results =
        [
          { rowId: 1, columnName: 'name', value: 'test1', score: 1 },
          { rowId: 2, columnName: 'name', value: 'test2', score: 0.9 }
        ];
      (
        searchState as unknown as { currentResultIndex: number }
      ).currentResultIndex = 0;

      searchActions.goToPreviousResult();
      expect(searchState.currentResultIndex).toBe(1);
    });
  });

  describe('goToResult', () => {
    it('navigates to specific result index', () => {
      (searchState as unknown as { results: SearchState['results'] }).results =
        [
          { rowId: 1, columnName: 'name', value: 'test1', score: 1 },
          { rowId: 2, columnName: 'name', value: 'test2', score: 0.9 },
          { rowId: 3, columnName: 'name', value: 'test3', score: 0.8 }
        ];

      searchActions.goToResult(2);
      expect(searchState.currentResultIndex).toBe(2);
    });

    it('does nothing for invalid index', () => {
      (searchState as unknown as { results: SearchState['results'] }).results =
        [{ rowId: 1, columnName: 'name', value: 'test1', score: 1 }];
      (
        searchState as unknown as { currentResultIndex: number }
      ).currentResultIndex = 0;

      searchActions.goToResult(5);
      expect(searchState.currentResultIndex).toBe(0);
    });
  });

  describe('clearSearch', () => {
    it('resets all search state', () => {
      searchActions.setSearchValue('test');
      searchActions.setReplaceValue('new');
      (searchState as unknown as { results: SearchState['results'] }).results =
        [{ rowId: 1, columnName: 'name', value: 'test', score: 1 }];

      searchActions.clearSearch();

      expect(searchState.searchValue).toBe('');
      expect(searchState.replaceValue).toBe('');
      expect(searchState.results).toEqual([]);
      expect(searchState.isSearching).toBe(false);
      expect(mockedHighlightStore.clearHighlights).toHaveBeenCalled();
    });
  });
});
