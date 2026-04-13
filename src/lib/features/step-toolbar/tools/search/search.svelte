<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import { m } from '$lib/paraglide/messages';
  import { Checkbox, Dropdown, Search } from 'carbon-components-svelte';
  import { ChevronLeft, ChevronRight } from 'carbon-icons-svelte';
  import { onDestroy } from 'svelte';
  import { searchState, searchActions } from './search.store.svelte';

  const ALL_SOURCES_ID = 'all';

  function handleSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    searchActions.setSearchValue(target.value);
  }

  function navigateResults(direction: 'prev' | 'next') {
    if (direction === 'next') {
      searchActions.goToNextResult();
    } else {
      searchActions.goToPreviousResult();
    }
  }

  const sourceItems = $derived.by(() => {
    const selectedViz = visualizationStore.selectedVisualization;
    const dataset = selectedViz
      ? datasetsStore.datasets.find((d) => d.id === selectedViz.datasetId)
      : (datasetsStore.selectedDataset ?? datasetsStore.enabledDatasets[0]);

    const allItem = { id: ALL_SOURCES_ID, text: m.search_source_all() };

    if (!dataset?.columns) return [allItem];

    const columnItems = dataset.columns
      .filter(
        (col) => col.type !== 'geometry' && col.name !== INTERNAL_COLUMN.ID
      )
      .map((col) => ({ id: col.name, text: col.name }));

    return [allItem, ...columnItems];
  });

  const results = $derived(searchState.results);
  const currentResultIndex = $derived(searchState.currentResultIndex);
  const hasResults = $derived(results.length > 0);
  const showResults = $derived(searchState.searchValue.trim().length >= 2);
  const noResults = $derived(showResults && !hasResults);
  const currentResult = $derived(
    currentResultIndex >= 0 ? results[currentResultIndex] : null
  );

  onDestroy(() => {
    searchActions.clearSearch();
  });
</script>

<div id="khartis-search-tool">
  <Search
    value={searchState.searchValue}
    on:input={handleSearchInput}
    placeholder={m.search_placeholder()}
    size="lg"
  />

  <Dropdown
    size="sm"
    titleText={m.search_source()}
    selectedId={searchState.selectedSource}
    items={sourceItems}
    on:select={(e) => searchActions.setSelectedSource(e.detail.selectedId)}
  />

  <div class="search-options">
    <Checkbox
      labelText={m.search_case_sensitive()}
      checked={searchState.caseSensitive}
      on:check={() => searchActions.toggleCaseSensitive()}
    />
    <Checkbox
      labelText={m.search_whole_word()}
      checked={searchState.wholeWord}
      on:check={() => searchActions.toggleWholeWord()}
    />
    <Checkbox
      labelText={m.search_use_regex()}
      checked={searchState.useRegex}
      on:check={() => searchActions.toggleUseRegex()}
    />
  </div>

  <p class="helper-text">{m.search_helper_text()}</p>

  {#if showResults}
    <div class="results-navigation">
      {#if noResults}
        <span class="results-text results-text--disabled"
          >{m.search_no_results()}</span
        >
      {:else}
        <span class="results-text"
          >{m.search_results_count({
            current: currentResultIndex + 1,
            total: results.length
          })}</span
        >
      {/if}

      <div class="results-buttons">
        <IconButton
          kind="ghost"
          size="small"
          iconDescription={m.search_previous()}
          icon={ChevronLeft}
          disabled={noResults}
          onclick={() => navigateResults('prev')}
        />
        <IconButton
          kind="ghost"
          size="small"
          iconDescription={m.search_next()}
          icon={ChevronRight}
          disabled={noResults}
          onclick={() => navigateResults('next')}
        />
      </div>
    </div>
    {#if currentResult}
      <div class="current-result" aria-live="polite">
        <p class="current-result__column">{currentResult.columnName}</p>
        <p class="current-result__value">{currentResult.value}</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  #khartis-search-tool {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
  }

  .helper-text {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1rem;
    letter-spacing: 0.32px;
    color: var(--cds-text-helper, #6f6f6f);
    margin: 0;
  }

  .results-navigation {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--cds-spacing-05);
    flex-wrap: wrap;
  }

  .results-text {
    flex: 1 1 10rem;
    min-width: 0;
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.125rem;
    letter-spacing: 0.16px;
    text-align: right;
    color: var(--cds-text-secondary);
  }

  .results-text--disabled {
    color: var(--cds-text-disabled);
  }

  .results-buttons {
    display: flex;
    align-items: center;
  }

  .current-result {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-02);
    padding: var(--cds-spacing-03);
    border: 1px solid var(--cds-border-subtle-01);
    background: var(--cds-layer-01, #f4f4f4);
  }

  .search-options {
    display: flex;
    gap: var(--cds-spacing-05);
    flex-wrap: wrap;
  }

  .current-result__column {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--cds-text-secondary, #525252);
  }

  .current-result__value {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--cds-text-primary, #161616);
    word-break: break-word;
  }
</style>
