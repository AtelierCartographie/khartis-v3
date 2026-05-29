import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import {
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  INTERNAL_COLUMN,
  JOINED_BASEMAP_COLUMNS
} from '$lib/features/commons/constants/data.constants';
import type { DatasetResult } from '$lib/features/data-pipeline';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { formatValue } from '$lib/features/commons/utils/format.utils';
import { projectHtmlLikeText } from '$lib/features/commons/utils/html-like-text.utils';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { mapHighlightStore } from '$lib/features/map/stores/map-highlight.store.svelte';
import { mapTooltipStore } from '$lib/features/map/stores/map-tooltip.store.svelte';
import type { TooltipEntry } from '$lib/features/map/types';
import { centerMapOnTableRow } from '$lib/features/map/services/center-on-table-row.service';
import type { SearchState } from '../../types/search.types';

const MIN_SEARCH_LENGTH = 2;
const ALL_SOURCES_ID = 'all';

const DEFAULT_STATE: SearchState = {
  searchValue: '',
  selectedSource: ALL_SOURCES_ID,
  results: [],
  currentResultIndex: -1,
  isSearching: false,
  caseSensitive: false,
  wholeWord: false,
  isSampled: false
};

type SearchActions = {
  setSearchValue: (value: string) => void;
  setSelectedSource: (source: string) => void;
  performSearch: () => Promise<void>;
  goToNextResult: () => void;
  goToPreviousResult: () => void;
  goToResult: (index: number) => void;
  toggleCaseSensitive: () => void;
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

type SearchContext = {
  dataset: DatasetResult;
  tableName: string;
  sourceFileId?: string;
  joinedBasemap?: string;
  gpsColumns?: {
    lat: string;
    lon: string;
  };
};

function getSearchContext(): SearchContext | null {
  const dataset = resolveSearchDataset();
  if (!dataset?.sourceFileId) {
    return null;
  }

  const duckDataset = duckDBOrchestrator.getDatasetBySourceFile(
    dataset.sourceFileId
  );

  if (!duckDataset?.tableName) {
    return null;
  }

  return {
    dataset,
    tableName: duckDataset.tableName,
    sourceFileId: dataset.sourceFileId,
    joinedBasemap: duckDataset.joinedBasemap,
    gpsColumns: duckDataset.gpsColumns
  };
}

function isSearchableColumn(columnName: string, columnType: string): boolean {
  if (columnType === 'geometry') return false;
  if (columnName === INTERNAL_COLUMN.ID) return false;
  if (JOINED_BASEMAP_COLUMNS.includes(columnName)) return false;
  return true;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchMatcher(
  query: string,
  options: Pick<SearchState, 'caseSensitive' | 'wholeWord'>
): (value: unknown) => boolean {
  if (options.wholeWord) {
    const regex = new RegExp(
      `(?:^|\\b)${escapeRegExp(query)}(?:\\b|$)`,
      options.caseSensitive ? '' : 'i'
    );
    return (value: unknown) => regex.test(String(value ?? ''));
  }

  if (options.caseSensitive) {
    return (value: unknown) => String(value ?? '').includes(query);
  }

  const loweredQuery = query.toLowerCase();
  return (value: unknown) =>
    String(value ?? '')
      .toLowerCase()
      .includes(loweredQuery);
}

const TOOLTIP_EXCLUDED_COLUMNS = new Set<string>([
  INTERNAL_COLUMN.ID,
  INTERNAL_COLUMN.GEOM,
  INTERNAL_COLUMN.GEOMETRY,
  ...JOINED_BASEMAP_COLUMNS
]);

async function showTooltipForResult(
  rowId: number,
  searchContext: SearchContext
): Promise<void> {
  try {
    const rows = (await Duck.query(
      `SELECT * FROM "${searchContext.tableName}" WHERE ${INTERNAL_COLUMN.ID} = ${rowId} LIMIT 1`,
      { format: 'array' }
    )) as Array<Record<string, unknown>>;

    const row = rows?.[0];
    if (!row) return;

    const entries: TooltipEntry[] = searchContext.dataset.columns
      .map((column) => column.name)
      .filter((columnName) => !TOOLTIP_EXCLUDED_COLUMNS.has(columnName))
      .map((columnName) => ({
        key: columnName,
        value: formatValue(
          typeof row[columnName] === 'string'
            ? projectHtmlLikeText(row[columnName])
            : row[columnName]
        )
      }));

    mapTooltipStore.pinAt(160, 200, entries, null, rowId - 1);
  } catch {
    // Tooltip failure must not block result navigation.
  }
}

async function centerMapOnRow(
  rowId: number,
  searchContext: SearchContext
): Promise<void> {
  await centerMapOnTableRow({
    tableName: searchContext.tableName,
    rowId,
    sourceFileId: searchContext.sourceFileId,
    joinedBasemap: searchContext.joinedBasemap,
    gpsColumns: searchContext.gpsColumns
  });
}

function clearMapHighlights(): void {
  mapHighlightStore.clearHighlights();
}

function setHighlightsFromResults(
  results: SearchState['results'],
  focusIndex: number
): void {
  if (!results.length) {
    clearMapHighlights();
    return;
  }

  const focused = results[focusIndex];
  if (!focused) {
    clearMapHighlights();
    return;
  }

  mapHighlightStore.setHighlightedRows([focused.rowId]);
}

const { state, actions } = createToolStore<SearchState, SearchActions>(
  DEFAULT_STATE,
  (s) => {
    let latestRequestId = 0;
    let searchDebounceTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const rerunSearchIfNeeded = () => {
      if (s.searchValue.trim().length >= MIN_SEARCH_LENGTH) {
        void performSearch();
      }
    };

    const performSearch = async (): Promise<void> => {
      const query = s.searchValue.trim();
      const searchContext = getSearchContext();
      const tableName = searchContext?.tableName ?? null;

      if (!query || query.length < MIN_SEARCH_LENGTH || !tableName) {
        s.results = [];
        s.currentResultIndex = -1;
        s.isSearching = false;
        s.isSampled = false;
        clearMapHighlights();
        mapTooltipStore.unpin();
        return;
      }

      s.isSearching = true;
      const requestId = ++latestRequestId;

      try {
        const matcher = buildSearchMatcher(query, {
          caseSensitive: s.caseSensitive,
          wholeWord: s.wholeWord
        });
        const columnFilter =
          s.selectedSource === ALL_SOURCES_ID ? undefined : s.selectedSource;

        const stats = await duckDBOrchestrator.searchInTable(tableName, query, {
          threshold: 0.85,
          column: columnFilter
        });

        if (requestId !== latestRequestId) {
          return;
        }

        const searchableColumnNames = new Set(
          searchContext?.dataset.columns
            .filter((column) => isSearchableColumn(column.name, column.type))
            .map((column) => column.name) ?? []
        );

        s.results = stats.results
          .filter((result) => searchableColumnNames.has(result.columnName))
          .map((result) => {
            const projectedValue =
              typeof result.value === 'string'
                ? projectHtmlLikeText(result.value)
                : String(result.value ?? '');

            return {
              rowId: result.rowId,
              columnName: result.columnName,
              value: projectedValue,
              score: result.score
            };
          })
          .filter((result) => matcher(result.value));
        s.isSampled = stats.isSampled ?? false;
        s.currentResultIndex = s.results.length > 0 ? 0 : -1;

        if (s.results.length > 0) {
          navigateTo(0);
        } else {
          clearMapHighlights();
          mapTooltipStore.unpin();
        }
      } catch (error) {
        logger.error('Map search failed', LogCategory.UI, {
          tableName,
          query,
          selectedSource: s.selectedSource,
          error
        });
        s.results = [];
        s.currentResultIndex = -1;
        s.isSampled = false;
        clearMapHighlights();
        mapTooltipStore.unpin();
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
      setHighlightsFromResults(s.results, s.currentResultIndex);

      const searchContext = getSearchContext();
      const focused = s.results[index];
      if (searchContext && focused) {
        void showTooltipForResult(focused.rowId, searchContext);
        void centerMapOnRow(focused.rowId, searchContext);
      }
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
          s.currentResultIndex = -1;
          s.isSampled = false;
          clearMapHighlights();
          mapTooltipStore.unpin();
        }
      },
      setSelectedSource: (source: string) => {
        s.selectedSource = source;

        if (s.searchValue.trim().length >= MIN_SEARCH_LENGTH) {
          void performSearch();
        }
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
        rerunSearchIfNeeded();
      },
      toggleWholeWord: () => {
        s.wholeWord = !s.wholeWord;
        rerunSearchIfNeeded();
      },
      clearSearch: () => {
        if (searchDebounceTimeoutId) {
          clearTimeout(searchDebounceTimeoutId);
          searchDebounceTimeoutId = null;
        }
        s.searchValue = '';
        s.results = [];
        s.currentResultIndex = -1;
        s.isSearching = false;
        s.isSampled = false;
        clearMapHighlights();
        mapTooltipStore.unpin();
      }
    };
  },
  {
    key: 'search',
    serializeFilter: ({
      results: _results,
      currentResultIndex: _currentResultIndex,
      isSearching: _isSearching,
      ...persisted
    }) => persisted
  }
);

export const searchState = state;
export const searchActions = actions;
