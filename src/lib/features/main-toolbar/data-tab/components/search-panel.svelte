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
  import { dataToolsStore } from '../data-tools.store.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { duckDBOrchestrator } from '$lib/features/duckdb';
  import * as m from '$lib/paraglide/messages';

  interface Props {
    tableName?: string;
    onSearchResults?: (results: number[], currentIndex: number) => void;
    onReplace?: (
      searchValue: string,
      replaceValue: string,
      source: string
    ) => void;
  }

  let { tableName, onSearchResults, onReplace }: Props = $props();

  const selectedDataset = $derived(datasetsStore.selectedDataset);
  const columns = $derived(selectedDataset?.columns ?? []);

  let searchQuery = $state('');
  let searchSource = $state('all');
  let replaceValue = $state('');
  let searchResults = $state<number[]>([]);
  let currentResultIndex = $state(0);
  let isSearching = $state(false);

  async function handleSearch() {
    dataToolsStore.setSearchQuery(searchQuery);
    dataToolsStore.setSearchSource(searchSource);

    if (!tableName || !searchQuery.trim()) {
      searchResults = [];
      currentResultIndex = 0;
      onSearchResults?.([], 0);
      return;
    }

    isSearching = true;
    try {
      const columnFilter = searchSource === 'all' ? undefined : searchSource;
      const results = await duckDBOrchestrator.searchInTable(
        tableName,
        searchQuery,
        { threshold: 0.6, column: columnFilter }
      );
      searchResults = results;
      currentResultIndex = results.length > 0 ? 0 : -1;
      onSearchResults?.(results, currentResultIndex);
    } catch (error) {
      logger.error('Search failed', LogCategory.UI, error);
      searchResults = [];
      currentResultIndex = 0;
    } finally {
      isSearching = false;
    }
  }

  function handleReplace() {
    if (!searchQuery || !replaceValue) return;
    onReplace?.(searchQuery, replaceValue, searchSource);
    dataToolsStore.setReplaceValue(replaceValue);
  }

  function handlePrevResult() {
    if (searchResults.length === 0) return;
    currentResultIndex =
      currentResultIndex > 0
        ? currentResultIndex - 1
        : searchResults.length - 1;
    onSearchResults?.(searchResults, currentResultIndex);
  }

  function handleNextResult() {
    if (searchResults.length === 0) return;
    currentResultIndex =
      currentResultIndex < searchResults.length - 1
        ? currentResultIndex + 1
        : 0;
    onSearchResults?.(searchResults, currentResultIndex);
  }

  function handleClear() {
    searchQuery = '';
    searchResults = [];
    currentResultIndex = 0;
    dataToolsStore.setSearchQuery('');
    onSearchResults?.([], 0);
  }

  const hasResults = $derived(searchResults.length > 0);
  const hasData = $derived(columns.length > 0);
  const resultText = $derived(
    isSearching
      ? m.search_loading()
      : hasResults
        ? `${currentResultIndex + 1} / ${searchResults.length}`
        : searchQuery.trim()
          ? m.search_no_results()
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

    <div class="results-navigation">
      <span class="result-text">{resultText}</span>
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
        disabled={!searchQuery || !replaceValue}
        on:click={handleReplace}
      >
        {m.search_replace_button()}
      </Button>
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
    padding-top: var(--cds-spacing-03);
  }
</style>
