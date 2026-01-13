<script lang="ts">
  import {
    Button,
    Search,
    Select,
    SelectItem,
    TextInput,
    InlineNotification,
    InlineLoading
  } from 'carbon-components-svelte';
  import { ChevronLeft, ChevronRight } from 'carbon-icons-svelte';
  import { onMount, onDestroy } from 'svelte';
  import { dataToolsStore } from '../data-tools.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { duckDBOrchestrator, type SearchStats } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';

  const SEARCH_DEBOUNCE_MS = 500;
  const MIN_SEARCH_LENGTH = 3;

  export type CellHighlightType = 'exact' | 'contains' | 'partial';

  export interface CellHighlight {
    rowId: number;
    columnName: string;
    type: CellHighlightType;
  }

  export interface SearchHighlightResult {
    cellHighlights: CellHighlight[];
    currentCell: { rowId: number; columnName: string } | null;
    highlightedRowIds: number[];
  }

  interface Props {
    tableName?: string;
    onSearchResults?: (result: SearchHighlightResult) => void;
    onReplace?: (
      searchValue: string,
      replaceValue: string,
      source: string
    ) => void | Promise<void>;
  }

  let { tableName, onSearchResults, onReplace }: Props = $props();

  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const columns = $derived(selectedDataset?.columns ?? []);

  let searchQuery = $state('');
  let searchSource = $state('all');
  let replaceValue = $state('');
  let searchStats = $state<SearchStats>({
    exactCount: 0,
    containsCount: 0,
    fuzzyCount: 0,
    totalCount: 0,
    results: []
  });
  let currentResultIndex = $state(0);
  let isSearching = $state(false);
  let isSearchInProgress = $state(false);
  let pendingSearchQuery = $state<string | null>(null);
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  const cellHighlights = $derived(
    searchStats.results.map((r) => ({
      rowId: r.rowId,
      columnName: r.columnName,
      type: (r.score === 1.0
        ? 'exact'
        : r.score === 0.99
          ? 'contains'
          : 'partial') as CellHighlightType
    }))
  );

  const highlightedRowIds = $derived([
    ...new Set(searchStats.results.map((r) => r.rowId))
  ]);

  function notifySearchResults() {
    const currentResult = searchStats.results[currentResultIndex];
    onSearchResults?.({
      cellHighlights,
      currentCell: currentResult
        ? { rowId: currentResult.rowId, columnName: currentResult.columnName }
        : null,
      highlightedRowIds
    });
  }

  function clearSearchResults() {
    searchStats = {
      exactCount: 0,
      containsCount: 0,
      fuzzyCount: 0,
      totalCount: 0,
      results: []
    };
    currentResultIndex = 0;
    onSearchResults?.({
      cellHighlights: [],
      currentCell: null,
      highlightedRowIds: []
    });
  }

  function handleSearchInput() {
    dataToolsStore.setSearchQuery(searchQuery);

    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }

    const trimmedQuery = searchQuery.trim();
    if (
      !tableName ||
      !trimmedQuery ||
      trimmedQuery.length < MIN_SEARCH_LENGTH
    ) {
      clearSearchResults();
      isSearching = false;
      return;
    }

    isSearching = true;
    searchDebounceTimer = setTimeout(() => {
      executeSearch();
    }, SEARCH_DEBOUNCE_MS);
  }

  async function executeSearch() {
    const trimmedQuery = searchQuery.trim();
    if (
      !tableName ||
      !trimmedQuery ||
      trimmedQuery.length < MIN_SEARCH_LENGTH
    ) {
      clearSearchResults();
      isSearching = false;
      return;
    }

    if (isSearchInProgress) {
      pendingSearchQuery = trimmedQuery;
      return;
    }

    isSearchInProgress = true;
    const queryAtStart = trimmedQuery;

    try {
      const columnFilter = searchSource === 'all' ? undefined : searchSource;
      const stats = await duckDBOrchestrator.searchInTable(
        tableName,
        trimmedQuery,
        { threshold: 0.85, column: columnFilter }
      );

      if (searchQuery.trim() !== queryAtStart) {
        return;
      }

      searchStats = stats;
      currentResultIndex = stats.results.length > 0 ? 0 : -1;

      const highlights = stats.results.map((r) => ({
        rowId: r.rowId,
        columnName: r.columnName,
        type: (r.score === 1.0
          ? 'exact'
          : r.score === 0.99
            ? 'contains'
            : 'partial') as CellHighlightType
      }));
      const rowIds = [...new Set(stats.results.map((r) => r.rowId))];
      const firstResult = stats.results[0];

      onSearchResults?.({
        cellHighlights: highlights,
        currentCell: firstResult
          ? { rowId: firstResult.rowId, columnName: firstResult.columnName }
          : null,
        highlightedRowIds: rowIds
      });
    } catch (error) {
      logger.error('Search failed', LogCategory.UI, error);
      clearSearchResults();
    } finally {
      isSearchInProgress = false;
      isSearching = false;

      if (pendingSearchQuery && pendingSearchQuery !== queryAtStart) {
        const pending = pendingSearchQuery;
        pendingSearchQuery = null;
        if (
          pending === searchQuery.trim() &&
          pending.length >= MIN_SEARCH_LENGTH
        ) {
          isSearching = true;
          executeSearch();
        }
      }
    }
  }

  function handleSourceChange() {
    dataToolsStore.setSearchSource(searchSource);
    if (searchQuery.trim().length >= MIN_SEARCH_LENGTH) {
      isSearching = true;
      executeSearch();
    }
  }

  function handleReplace() {
    if (!searchQuery || !replaceValue) return;
    const query = searchQuery;
    const value = replaceValue;
    const source = searchSource;
    dataToolsStore.setReplaceValue(value);
    handleClear();
    onReplace?.(query, value, source);
  }

  function handlePrevResult() {
    if (searchStats.results.length === 0) return;
    currentResultIndex =
      currentResultIndex > 0
        ? currentResultIndex - 1
        : searchStats.results.length - 1;
    notifySearchResults();
  }

  function handleNextResult() {
    if (searchStats.results.length === 0) return;
    currentResultIndex =
      currentResultIndex < searchStats.results.length - 1
        ? currentResultIndex + 1
        : 0;
    notifySearchResults();
  }

  function handleClear() {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    searchQuery = '';
    dataToolsStore.setSearchQuery('');
    clearSearchResults();
  }

  onMount(() => {
    handleClear();
  });

  const hasResults = $derived(searchStats.totalCount > 0);
  const hasData = $derived(columns.length > 0);
  const hasExactMatches = $derived(searchStats.exactCount > 0);
  const isSampled = $derived(searchStats.isSampled === true);

  const resultCountText = $derived(() => {
    if (!searchQuery.trim()) return '';
    if (!hasResults) return m.search_no_results();

    const parts: string[] = [];
    if (searchStats.exactCount > 0) {
      parts.push(m.search_exact_results({ count: searchStats.exactCount }));
    }
    const partialCount = searchStats.containsCount + searchStats.fuzzyCount;
    if (partialCount > 0) {
      parts.push(m.search_partial_results({ count: partialCount }));
    }
    return parts.join(', ');
  });

  const navigationText = $derived(
    hasResults ? `${currentResultIndex + 1} / ${searchStats.totalCount}` : ''
  );
</script>

<div class="search-panel">
  {#if !hasData}
    <InlineNotification
      kind="info"
      title={m.data_tool_no_data()}
      subtitle={m.data_tool_no_data_description()}
      lowContrast
      hideCloseButton
    />
  {:else}
    <div class="field-group">
      <Search
        size="sm"
        placeholder={m.search_placeholder()}
        bind:value={searchQuery}
        on:input={handleSearchInput}
        on:clear={handleClear}
      />
    </div>

    <div class="field-group">
      <Select
        size="sm"
        labelText={m.search_source()}
        bind:selected={searchSource}
        on:change={handleSourceChange}
      >
        <SelectItem value="all" text={m.search_all_variables()} />
        {#each columns as column (column.name)}
          <SelectItem value={column.name} text={column.name} />
        {/each}
      </Select>
    </div>

    <div class="results-info">
      {#if isSearching || isSearchInProgress}
        <div class="loading-container">
          <InlineLoading description={m.search_loading()} />
        </div>
      {:else}
        <span class="result-count">{resultCountText()}</span>
      {/if}
    </div>

    {#if isSampled}
      <InlineNotification
        kind="warning"
        lowContrast
        hideCloseButton
        subtitle={m.search_large_table_warning()}
      />
    {/if}

    <div class="results-navigation">
      <span class="result-text">{navigationText}</span>
      <div class="nav-buttons">
        <Button
          kind="ghost"
          size="small"
          hasIconOnly
          icon={ChevronLeft}
          iconDescription={m.search_prev_result()}
          disabled={!hasResults}
          on:click={handlePrevResult}
        />
        <Button
          kind="ghost"
          size="small"
          hasIconOnly
          icon={ChevronRight}
          iconDescription={m.search_next_result()}
          disabled={!hasResults}
          on:click={handleNextResult}
        />
      </div>
    </div>

    <div class="field-group">
      <TextInput
        size="sm"
        labelText={m.search_replace_with()}
        placeholder={m.search_replace_placeholder()}
        bind:value={replaceValue}
      />
    </div>

    <div class="actions">
      <Button
        kind="secondary"
        size="small"
        disabled={!searchQuery || !replaceValue || !hasExactMatches}
        on:click={handleReplace}
      >
        {m.search_replace_button()}
      </Button>
      <span class="replace-hint">{m.search_replace_exact_only()}</span>
    </div>
  {/if}
</div>

<style>
  .search-panel {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
  }

  .results-info {
    padding: var(--cds-spacing-02) 0;
    min-height: 2rem;
  }

  .loading-container {
    display: flex;
    align-items: center;
  }

  .result-count {
    font-size: 0.875rem;
    color: var(--cds-text-02);
  }

  .results-navigation {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--cds-spacing-02) 0;
  }

  .result-text {
    font-size: 0.875rem;
    color: var(--cds-text-02);
  }

  .nav-buttons {
    display: flex;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
    padding-top: var(--cds-spacing-03);
  }

  .replace-hint {
    font-size: 0.75rem;
    color: var(--cds-text-helper);
    font-style: italic;
  }
</style>
