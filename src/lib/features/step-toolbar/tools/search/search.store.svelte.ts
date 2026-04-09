import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { projectStore } from '$lib/features/commons/store/project.store.svelte';
import {
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type { DatasetResult } from '$lib/features/data-pipeline';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { formatValue } from '$lib/features/commons/utils/format.utils';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import { mapHighlightStore } from '$lib/features/map/stores/map-highlight.store.svelte';
import { mapTooltipStore } from '$lib/features/map/stores/map-tooltip.store.svelte';
import type { TooltipEntry } from '$lib/features/map/types';
import type { SearchState } from './search.types';

const MIN_SEARCH_LENGTH = 2;
const ALL_SOURCES_ID = 'all';

const DEFAULT_STATE: SearchState = {
  searchValue: '',
  selectedSource: ALL_SOURCES_ID,
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

type SearchContext = {
  dataset: DatasetResult;
  tableName: string;
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
    tableName: duckDataset.tableName
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
      return `
        SELECT
          "${INTERNAL_COLUMN.ID}" AS row_id,
          '${escapedColumnLabel}' AS column_name,
          CAST("${escapedColumnName}" AS VARCHAR) AS column_value,
          1.0 AS score
        FROM "${escapedTableName}"
        WHERE "${escapedColumnName}" IS NOT NULL
          AND regexp_matches(
            CAST("${escapedColumnName}" AS VARCHAR),
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

async function persistReplaceTransformations(
  dataset: DatasetResult,
  targetColumns: string[],
  searchValue: string,
  replaceValue: string,
  replacedCount: number
): Promise<void> {
  if (replacedCount <= 0 || targetColumns.length === 0) {
    return;
  }

  datasetsStore.recordTransformation(
    dataset.id,
    `Replaced "${searchValue}" with "${replaceValue}" (${replacedCount} occurrences)`
  );

  if (!dataset.sourceFileId) {
    return;
  }

  const timestamp = new Date().toISOString();

  for (const column of targetColumns) {
    await projectStore.addColumnTransformation(dataset.sourceFileId, {
      type: 'replace',
      column,
      searchValue,
      newValue: replaceValue,
      timestamp
    });
  }
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
  tableName: string
): Promise<void> {
  try {
    const rows = (await Duck.query(
      `SELECT * EXCLUDE (geom, geometry) FROM "${tableName}" WHERE ${INTERNAL_COLUMN.ID} = ${rowId} LIMIT 1`,
      { format: 'array' }
    )) as Array<Record<string, unknown>>;

    const row = rows?.[0];
    if (!row) return;

    const entries: TooltipEntry[] = Object.entries(row)
      .filter(([key]) => !TOOLTIP_EXCLUDED_COLUMNS.has(key))
      .map(([key, val]) => ({ key, value: formatValue(val) }));

    mapTooltipStore.pinAt(160, 200, entries, null, rowId - 1);
  } catch (error) {
    logger.debug(
      'Failed to fetch tooltip data for search result',
      LogCategory.UI,
      {
        rowId,
        tableName,
        error
      }
    );
  }
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

  mapTooltipStore.unpin();
  const uniqueRows = [...new Set(results.map((result) => result.rowId))];
  mapHighlightStore.setHighlightedRows(uniqueRows);
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
        s.currentResultIndex = 0;
        s.isSearching = false;
        clearMapHighlights();
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
          .filter((result) => matcher(result.value))
          .map((result) => ({
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

      const tableName = getSearchTableName();
      const focused = s.results[index];
      if (tableName && focused) {
        void showTooltipForResult(focused.rowId, tableName);
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
        if (!s.results.length) {
          return false;
        }

        const searchContext = getSearchContext();
        const current = s.results[s.currentResultIndex];

        if (!searchContext || !current) {
          return false;
        }

        const searchValue = s.searchValue.trim();
        const replaceValue = s.replaceValue.trim();

        const replaced = await duckDBOrchestrator.replaceInColumn(
          searchContext.tableName,
          current.columnName,
          searchValue,
          replaceValue
        );

        if (replaced > 0) {
          try {
            await persistReplaceTransformations(
              searchContext.dataset,
              [current.columnName],
              searchValue,
              replaceValue,
              replaced
            );
          } catch (error) {
            logger.debug(
              'Failed to persist search replace transformation',
              LogCategory.UI,
              {
                datasetId: searchContext.dataset.id,
                column: current.columnName,
                searchValue,
                replaceValue,
                error
              }
            );
          }

          await performSearch();
          return true;
        }

        return false;
      },
      replaceAll: async (): Promise<number> => {
        const searchValue = s.searchValue.trim();
        const replaceValue = s.replaceValue.trim();

        if (!searchValue || !s.results.length) {
          return 0;
        }

        const searchContext = getSearchContext();
        if (!searchContext) {
          return 0;
        }

        const targetColumns =
          s.selectedSource === ALL_SOURCES_ID
            ? [...new Set(s.results.map((result) => result.columnName))]
            : [s.selectedSource];

        let replacedCount = 0;
        const replacedColumns = new Set<string>();

        for (const columnName of targetColumns) {
          const replacedInColumn = await duckDBOrchestrator.replaceInColumn(
            searchContext.tableName,
            columnName,
            searchValue,
            replaceValue
          );
          replacedCount += replacedInColumn;

          if (replacedInColumn > 0) {
            replacedColumns.add(columnName);
          }
        }

        if (replacedCount > 0) {
          try {
            await persistReplaceTransformations(
              searchContext.dataset,
              [...replacedColumns],
              searchValue,
              replaceValue,
              replacedCount
            );
          } catch (error) {
            logger.debug(
              'Failed to persist search replace transformations',
              LogCategory.UI,
              {
                datasetId: searchContext.dataset.id,
                columns: [...replacedColumns],
                searchValue,
                replaceValue,
                error
              }
            );
          }

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
        s.replaceValue = '';
        s.results = [];
        s.currentResultIndex = 0;
        s.isSearching = false;
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
