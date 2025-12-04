<script lang="ts">
  import {
    Button,
    Search,
    Select,
    SelectItem,
    TextInput,
    InlineNotification
  } from 'carbon-components-svelte';
  import { ChevronLeft, ChevronRight } from 'carbon-icons-svelte';
  import { onMount } from 'svelte';
  import { dataToolsStore } from '../data-tools.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { duckDBOrchestrator, type SearchStats } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';

  export interface SearchHighlightResult {
    exactIds: number[];
    partialIds: number[];
    currentId: number | null;
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
    partialCount: 0,
    results: []
  });
  let currentResultIndex = $state(0);
  let isSearching = $state(false);

  const searchResultIds = $derived(searchStats.results.map((r) => r.id));
  const exactIds = $derived(
    searchStats.results.filter((r) => r.score === 1).map((r) => r.id)
  );
  const partialIds = $derived(
    searchStats.results.filter((r) => r.score < 1).map((r) => r.id)
  );

  function notifySearchResults() {
    const currentId =
      currentResultIndex >= 0 && currentResultIndex < searchResultIds.length
        ? searchResultIds[currentResultIndex]
        : null;
    onSearchResults?.({ exactIds, partialIds, currentId });
  }

  async function handleSearch() {
    dataToolsStore.setSearchQuery(searchQuery);
    dataToolsStore.setSearchSource(searchSource);

    if (!tableName || !searchQuery.trim()) {
      searchStats = { exactCount: 0, partialCount: 0, results: [] };
      currentResultIndex = 0;
      onSearchResults?.({ exactIds: [], partialIds: [], currentId: null });
      return;
    }

    isSearching = true;
    try {
      const columnFilter = searchSource === 'all' ? undefined : searchSource;
      const stats = await duckDBOrchestrator.searchInTable(
        tableName,
        searchQuery,
        { threshold: 0.6, column: columnFilter }
      );
      searchStats = stats;
      currentResultIndex = stats.results.length > 0 ? 0 : -1;

      const exact = stats.results.filter((r) => r.score === 1).map((r) => r.id);
      const partial = stats.results.filter((r) => r.score < 1).map((r) => r.id);
      const firstId = stats.results.length > 0 ? stats.results[0].id : null;
      onSearchResults?.({
        exactIds: exact,
        partialIds: partial,
        currentId: firstId
      });
    } catch (error) {
      logger.error('Search failed', LogCategory.UI, error);
      searchStats = { exactCount: 0, partialCount: 0, results: [] };
      currentResultIndex = 0;
    } finally {
      isSearching = false;
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
    if (searchResultIds.length === 0) return;
    currentResultIndex =
      currentResultIndex > 0
        ? currentResultIndex - 1
        : searchResultIds.length - 1;
    notifySearchResults();
  }

  function handleNextResult() {
    if (searchResultIds.length === 0) return;
    currentResultIndex =
      currentResultIndex < searchResultIds.length - 1
        ? currentResultIndex + 1
        : 0;
    notifySearchResults();
  }

  function handleClear() {
    searchQuery = '';
    searchStats = { exactCount: 0, partialCount: 0, results: [] };
    currentResultIndex = 0;
    dataToolsStore.setSearchQuery('');
    onSearchResults?.({ exactIds: [], partialIds: [], currentId: null });
  }

  onMount(() => {
    handleClear();
  });

  const hasResults = $derived(searchStats.results.length > 0);
  const hasData = $derived(columns.length > 0);
  const hasExactMatches = $derived(searchStats.exactCount > 0);

  const resultCountText = $derived(() => {
    if (isSearching) return m.search_loading();
    if (!searchQuery.trim()) return '';
    if (!hasResults) return m.search_no_results();

    const parts: string[] = [];
    if (searchStats.exactCount > 0) {
      parts.push(m.search_exact_results({ count: searchStats.exactCount }));
    }
    if (searchStats.partialCount > 0) {
      parts.push(m.search_partial_results({ count: searchStats.partialCount }));
    }
    return parts.join(', ');
  });

  const navigationText = $derived(
    hasResults
      ? `${currentResultIndex + 1} / ${searchStats.results.length}`
      : ''
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
        on:input={handleSearch}
        on:clear={handleClear}
      />
    </div>

    <div class="field-group">
      <Select
        size="sm"
        labelText={m.search_source()}
        bind:selected={searchSource}
        on:change={handleSearch}
      >
        <SelectItem value="all" text={m.search_all_variables()} />
        {#each columns as column (column.name)}
          <SelectItem value={column.name} text={column.name} />
        {/each}
      </Select>
    </div>

    <div class="results-info">
      <span class="result-count">{resultCountText()}</span>
    </div>

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
