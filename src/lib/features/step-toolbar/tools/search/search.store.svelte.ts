import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import {
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type { DatasetResult } from '$lib/features/data-pipeline';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { formatValue } from '$lib/features/commons/utils/format.utils';
import { projectHtmlLikeText } from '$lib/features/commons/utils/html-like-text.utils';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import { Duck } from '$lib/features/duckdb';
import { buildStripHtmlTextSqlExpression } from '$lib/features/duckdb/html-like-text';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { mapHighlightStore } from '$lib/features/map/stores/map-highlight.store.svelte';
import { mapTooltipStore } from '$lib/features/map/stores/map-tooltip.store.svelte';
import type { TooltipEntry } from '$lib/features/map/types';
import { centerMapOnTableRow } from '$lib/features/map/utils/center-on-table-row.utils';
import type { SearchState } from './search.types';

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
  useRegex: false,
  replaceValue: ''
};

type SearchActions = {
  setSearchValue: (value: string) => void;
  setSelectedSource: (source: string) => void;
  performSearch: () => Promise<void>;
  goToNextResult: () => void;
  goToPreviousResult: () => void;
  goToResult: (index: number) => void;
  toggleCaseSensitive: () => void;
  toggleUseRegex: () => void;
  toggleWholeWord: () => void;
  clearSearch: () => void;
  setReplaceValue: (value: string) => void;
  replaceCurrentResult: () => Promise<void>;
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

type SearchResultItem = SearchState['results'][number];

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

function getSearchTableName(): string | null {
  return getSearchContext()?.tableName ?? null;
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''");
}

function escapeIdentifier(identifier: string): string {
  return identifier.replaceAll('"', '""');
}

function resolveSearchColumns(
  dataset: DatasetResult,
  selectedSource: string
): string[] {
  const columnNames = dataset.columns
    .filter(
      (column) =>
        column.type !== 'geometry' && column.name !== INTERNAL_COLUMN.ID
    )
    .map((column) => column.name);

  if (selectedSource === ALL_SOURCES_ID) {
    return columnNames;
  }

  return columnNames.includes(selectedSource) ? [selectedSource] : [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchMatcher(
  query: string,
  options: Pick<SearchState, 'caseSensitive' | 'wholeWord' | 'useRegex'>
): (value: unknown) => boolean {
  if (options.useRegex) {
    try {
      const regex = new RegExp(query, options.caseSensitive ? '' : 'i');
      return (value: unknown) => regex.test(String(value ?? ''));
    } catch {
      return () => false;
    }
  }

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

async function performRegexSearch(
  searchContext: SearchContext,
  query: string,
  options: Pick<SearchState, 'caseSensitive' | 'selectedSource'>
): Promise<SearchResultItem[]> {
  try {
    new RegExp(query, options.caseSensitive ? '' : 'i');
  } catch {
    return [];
  }

  const targetColumns = resolveSearchColumns(
    searchContext.dataset,
    options.selectedSource
  );

  if (targetColumns.length === 0) {
    return [];
  }

  const escapedPattern = escapeSqlString(query);
  const regexFlags = options.caseSensitive ? 'c' : 'i';
  const escapedTableName = escapeIdentifier(searchContext.tableName);

  const unionQuery = targetColumns
    .map((columnName) => {
      const escapedColumnName = escapeIdentifier(columnName);
      const escapedColumnLabel = escapeSqlString(columnName);
      const projectedColumnValue = buildStripHtmlTextSqlExpression(
        `"${escapedColumnName}"`
      );
      return `
        SELECT
          "${INTERNAL_COLUMN.ID}" AS row_id,
          '${escapedColumnLabel}' AS column_name,
          ${projectedColumnValue} AS column_value,
          1.0 AS score
        FROM "${escapedTableName}"
        WHERE "${escapedColumnName}" IS NOT NULL
          AND regexp_matches(
            ${projectedColumnValue},
            '${escapedPattern}',
            '${regexFlags}'
          )
      `;
    })
    .join('\nUNION ALL\n');

  const rows = (await Duck.query(
    `${unionQuery}
     ORDER BY row_id, column_name
     LIMIT 500`,
    { format: 'array' }
  )) as Array<{
    row_id: number;
    column_name: string;
    column_value: string;
    score: number;
  }>;

  return rows.map((row) => ({
    rowId: row.row_id,
    columnName: row.column_name,
    value: row.column_value,
    score: row.score
  }));
}

const TOOLTIP_EXCLUDED_COLUMNS = new Set([
  INTERNAL_COLUMN.ID,
  INTERNAL_COLUMN.GEOM,
  INTERNAL_COLUMN.GEOMETRY,
  'basemap_id',
  'typo_match'
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
     
  } catch (error) {
    console.error(error);
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
      const tableName = getSearchTableName();

      if (!query || query.length < MIN_SEARCH_LENGTH || !tableName) {
        s.results = [];
        s.currentResultIndex = -1;
        s.isSearching = false;
        clearMapHighlights();
        mapTooltipStore.unpin();
        return;
      }

      s.isSearching = true;
      const requestId = ++latestRequestId;

      try {
        const matcher = buildSearchMatcher(query, {
          caseSensitive: s.caseSensitive,
          wholeWord: s.wholeWord,
          useRegex: s.useRegex
        });
        const searchContext = getSearchContext();
        const columnFilter =
          s.selectedSource === ALL_SOURCES_ID ? undefined : s.selectedSource;
        const regexResults =
          s.useRegex && searchContext
            ? await performRegexSearch(searchContext, query, {
                caseSensitive: s.caseSensitive,
                selectedSource: s.selectedSource
              })
            : null;

        const stats =
          regexResults !== null
            ? {
                exactCount: regexResults.length,
                containsCount: 0,
                fuzzyCount: 0,
                totalCount: regexResults.length,
                results: regexResults
              }
            : await duckDBOrchestrator.searchInTable(tableName, query, {
                threshold: 0.85,
                column: columnFilter
              });

        if (requestId !== latestRequestId) {
          return;
        }

        s.results = stats.results
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
          .filter((result) => matcher(result.value))
          .map((result) => ({
            rowId: result.rowId,
            columnName: result.columnName,
            value: result.value,
            score: result.score
          }));
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
      toggleUseRegex: () => {
        s.useRegex = !s.useRegex;
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
        clearMapHighlights();
        mapTooltipStore.unpin();
      },
      setReplaceValue: (value: string) => {
        s.replaceValue = value;
      },
      replaceCurrentResult: async (): Promise<void> => {
        const focused = s.results[s.currentResultIndex];
        const searchContext = getSearchContext();
        if (!focused || !searchContext || !s.replaceValue.trim()) return;

        const escapedTable = escapeIdentifier(searchContext.tableName);
        const escapedCol = escapeIdentifier(focused.columnName);
        const escapedNewVal = escapeSqlString(s.replaceValue);

        try {
          await Duck.query(
            `UPDATE "${escapedTable}" SET "${escapedCol}" = '${escapedNewVal}' WHERE ${INTERNAL_COLUMN.ID} = ${focused.rowId}`,
            { format: 'array' }
          );
          Duck.invalidateTableCache(searchContext.tableName);
          duckDBOrchestrator.bumpDatasetsVersion();

          const prevIndex = s.currentResultIndex;
          s.results = s.results.filter((_, i) => i !== prevIndex);

          if (s.results.length > 0) {
            navigateTo(Math.min(prevIndex, s.results.length - 1));
          } else {
            s.currentResultIndex = -1;
            clearMapHighlights();
            mapTooltipStore.unpin();
          }
        } catch (error) {
          logger.error('Replace failed', LogCategory.UI, {
            rowId: focused.rowId,
            column: focused.columnName,
            error
          });
        }
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
