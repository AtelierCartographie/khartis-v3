import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import {
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import type { DatasetResult } from '$lib/features/data-pipeline';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import { duckDBOrchestrator } from '$lib/features/duckdb';
import { mapHighlightStore } from '$lib/features/map/stores/map-highlight.store.svelte';
import type { SearchState } from './search.types';

const MIN_SEARCH_LENGTH = 2;

const DEFAULT_STATE: SearchState = {
  searchValue: '',
  selectedSource: 'all',
  replaceValue: '',
  results: [],
  currentResultIndex: 0,
  isSearching: false,
  caseSensitive: false,
  wholeWord: false,
  useRegex: false
};

type SearchActions = {
  setSearchValue: (value: string) => void;
  setSelectedSource: (source: string) => void;
  setReplaceValue: (value: string) => void;
  performSearch: () => Promise<void>;
  replaceNext: () => Promise<boolean>;
  replaceAll: () => Promise<number>;
  goToNextResult: () => void;
  goToPreviousResult: () => void;
  goToResult: (index: number) => void;
  toggleCaseSensitive: () => void;
  toggleUseRegex: () => void;
  toggleWholeWord: () => void;
  clearSearch: () => void;
};

function resolveSearchDataset(): DatasetResult | undefined {
  const selectedVisualization: VisualizationConfig | undefined =
    visualizationStore.selectedVisualization;

  if (selectedVisualization) {
    const datasetFromViz = datasetsStore.datasets.find(
      (dataset) => dataset.id === selectedVisualization.datasetId
    );
    if (datasetFromViz) {
      return datasetFromViz;
    }
  }

  if (datasetsStore.selectedDataset) {
    return datasetsStore.selectedDataset;
  }

  return datasetsStore.enabledDatasets[0];
}

function getSearchTableName(): string | null {
  const dataset = resolveSearchDataset();
  if (!dataset?.sourceFileId) {
    return null;
  }

  const duckDataset = duckDBOrchestrator.getDatasetBySourceFile(
    dataset.sourceFileId
  );

  return duckDataset?.tableName ?? null;
}

function clearMapHighlights(): void {
  mapHighlightStore.clearHighlights();
}

function setHighlightsFromResults(
  results: SearchState['results'],
  focusIndex: number,
  focusCurrentOnly: boolean
): void {
  if (!results.length) {
    clearMapHighlights();
    return;
  }

  if (focusCurrentOnly) {
    const focused = results[focusIndex];
    if (focused) {
      mapHighlightStore.setHighlightedRows([focused.rowId]);
      return;
    }
  }

  const uniqueRows = [...new Set(results.map((result) => result.rowId))];
  mapHighlightStore.setHighlightedRows(uniqueRows);
}

const { state, actions } = createToolStore<SearchState, SearchActions>(
  DEFAULT_STATE,
  (s) => {
    let latestRequestId = 0;
    let searchDebounceTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const performSearch = async (): Promise<void> => {
      const query = s.searchValue.trim();
      const tableName = getSearchTableName();

      if (!query || query.length < MIN_SEARCH_LENGTH || !tableName) {
        s.results = [];
        s.currentResultIndex = 0;
        s.isSearching = false;
        clearMapHighlights();
        return;
      }

      s.isSearching = true;
      const requestId = ++latestRequestId;

      try {
        const columnFilter =
          s.selectedSource === 'all' ? undefined : s.selectedSource;
        const stats = await duckDBOrchestrator.searchInTable(tableName, query, {
          threshold: 0.85,
          column: columnFilter
        });

        if (requestId !== latestRequestId) {
          return;
        }

        s.results = stats.results.map((result) => ({
          rowId: result.rowId,
          columnName: result.columnName,
          value: result.value,
          score: result.score
        }));
        s.currentResultIndex = s.results.length > 0 ? 0 : -1;

        setHighlightsFromResults(s.results, s.currentResultIndex, false);
      } catch (error) {
        logger.error('Map search failed', LogCategory.UI, {
          tableName,
          query,
          selectedSource: s.selectedSource,
          error
        });
        s.results = [];
        s.currentResultIndex = -1;
        clearMapHighlights();
      } finally {
        if (requestId === latestRequestId) {
          s.isSearching = false;
        }
      }
    };

    const navigateTo = (index: number): void => {
      if (!s.results.length) return;
      if (index < 0 || index >= s.results.length) return;

      s.currentResultIndex = index;
      setHighlightsFromResults(s.results, s.currentResultIndex, true);
    };

    return {
      performSearch,
      setSearchValue: (value: string) => {
        s.searchValue = value;

        if (searchDebounceTimeoutId) {
          clearTimeout(searchDebounceTimeoutId);
          searchDebounceTimeoutId = null;
        }

        if (value.trim().length >= MIN_SEARCH_LENGTH) {
          searchDebounceTimeoutId = setTimeout(() => {
            searchDebounceTimeoutId = null;
            void performSearch();
          }, 250);
        } else {
          s.results = [];
          s.currentResultIndex = 0;
          clearMapHighlights();
        }
      },
      setSelectedSource: (source: string) => {
        s.selectedSource = source;

        if (s.searchValue.trim().length >= MIN_SEARCH_LENGTH) {
          void performSearch();
        }
      },
      setReplaceValue: (value: string) => {
        s.replaceValue = value;
      },
      replaceNext: async (): Promise<boolean> => {
        if (!s.replaceValue.trim() || !s.results.length) {
          return false;
        }

        const tableName = getSearchTableName();
        const current = s.results[s.currentResultIndex];

        if (!tableName || !current) {
          return false;
        }

        const replaced = await duckDBOrchestrator.replaceInColumn(
          tableName,
          current.columnName,
          s.searchValue.trim(),
          s.replaceValue.trim()
        );

        if (replaced > 0) {
          await performSearch();
          return true;
        }

        return false;
      },
      replaceAll: async (): Promise<number> => {
        const searchValue = s.searchValue.trim();
        const replaceValue = s.replaceValue.trim();

        if (!searchValue || !replaceValue || !s.results.length) {
          return 0;
        }

        const tableName = getSearchTableName();
        if (!tableName) {
          return 0;
        }

        const targetColumns =
          s.selectedSource === 'all'
            ? [...new Set(s.results.map((result) => result.columnName))]
            : [s.selectedSource];

        let replacedCount = 0;

        for (const columnName of targetColumns) {
          replacedCount += await duckDBOrchestrator.replaceInColumn(
            tableName,
            columnName,
            searchValue,
            replaceValue
          );
        }

        if (replacedCount > 0) {
          await performSearch();
        }

        return replacedCount;
      },
      goToNextResult: () => {
        if (!s.results.length) return;
        const nextIndex = (s.currentResultIndex + 1) % s.results.length;
        navigateTo(nextIndex);
      },
      goToPreviousResult: () => {
        if (!s.results.length) return;
        const prevIndex =
          s.currentResultIndex === 0
            ? s.results.length - 1
            : s.currentResultIndex - 1;
        navigateTo(prevIndex);
      },
      goToResult: (index: number) => {
        navigateTo(index);
      },
      toggleCaseSensitive: () => {
        s.caseSensitive = !s.caseSensitive;
      },
      toggleUseRegex: () => {
        s.useRegex = !s.useRegex;
      },
      toggleWholeWord: () => {
        s.wholeWord = !s.wholeWord;
      },
      clearSearch: () => {
        if (searchDebounceTimeoutId) {
          clearTimeout(searchDebounceTimeoutId);
          searchDebounceTimeoutId = null;
        }
        s.searchValue = '';
        s.replaceValue = '';
        s.results = [];
        s.currentResultIndex = 0;
        s.isSearching = false;
        clearMapHighlights();
      }
    };
  }
);

export const searchState = state;
export const searchActions = actions;
