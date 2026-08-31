<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import {
    INTERNAL_COLUMN,
    JOINED_BASEMAP_COLUMNS
  } from '$lib/features/commons/constants/data.constants';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import { visualizationStore } from '$lib/features/commons/stores/visualization.store.svelte';
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
        (col) =>
          col.type !== 'geometry' &&
          col.name !== INTERNAL_COLUMN.ID &&
          !JOINED_BASEMAP_COLUMNS.includes(col.name)
      )
      .map((col) => ({ id: col.name, text: col.name }));

    return [allItem, ...columnItems];
  });

  const results = $derived(searchState.results);
  const currentResultIndex = $derived(searchState.currentResultIndex);
  const hasResults = $derived(results.length > 0);
  const showResults = $derived(searchState.searchValue.trim().length >= 2);
  const noResults = $derived(
    showResults && !hasResults && !searchState.isSearching
  );

  let resultsListEl = $state<HTMLUListElement | null>(null);

  $effect(() => {
    if (!resultsListEl || currentResultIndex < 0) return;
    const items = resultsListEl.querySelectorAll('li');
    items[currentResultIndex]?.scrollIntoView({ block: 'nearest' });
  });

  onDestroy(() => {
    searchActions.clearSearch();
  });
</script>

<div id="khartis-search-tool">
  <Search
    value={searchState.searchValue}
    on:input={handleSearchInput}
    on:clear={searchActions.clearSearch}
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
      on:change={() => searchActions.toggleCaseSensitive()}
    />
    <Checkbox
      labelText={m.search_whole_word()}
      checked={searchState.wholeWord}
      on:change={() => searchActions.toggleWholeWord()}
    />
  </div>

  <p class="helper-text">{m.search_helper_text()}</p>

  {#if searchState.isSampled}
    <p class="helper-text helper-text--warning">
      {m.search_large_table_warning()}
    </p>
  {/if}

  {#if showResults}
    <div class="results-navigation">
      {#if searchState.isSearching}
        <span class="results-text results-text--disabled"
          >{m.search_loading()}</span
        >
      {:else if noResults}
        <span class="results-text results-text--disabled"
          >{m.search_no_results()}</span
        >
      {:else}
        <span class="results-text">
          {m.search_results_count({
            current: currentResultIndex + 1,
            total: results.length
          })}
        </span>
      {/if}

      <div class="results-buttons">
        <IconButton
          kind="ghost"
          size="small"
          iconDescription={m.search_previous()}
          icon={ChevronLeft}
          disabled={noResults || searchState.isSearching}
          onclick={() => navigateResults('prev')}
        />
        <IconButton
          kind="ghost"
          size="small"
          iconDescription={m.search_next()}
          icon={ChevronRight}
          disabled={noResults || searchState.isSearching}
          onclick={() => navigateResults('next')}
        />
      </div>
    </div>

    {#if hasResults}
      <ul
        bind:this={resultsListEl}
        class="results-list"
        role="listbox"
        aria-label={m.search_results_count({
          current: currentResultIndex + 1,
          total: results.length
        })}
      >
        {#each results as result, i (result.rowId + '-' + result.columnName)}
          <li
            class="results-list__item"
            class:results-list__item--selected={i === currentResultIndex}
            role="option"
            aria-selected={i === currentResultIndex}
            tabindex="0"
            onclick={() => searchActions.goToResult(i)}
            onkeydown={(e: KeyboardEvent) =>
              e.key === 'Enter' && searchActions.goToResult(i)}
          >
            <span class="results-list__column">{result.columnName}</span>
            <span class="results-list__value">
              {result.value || m.search_no_value()}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style lang="scss">
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

  .helper-text--warning {
    color: var(--cds-text-error, #da1e28);
  }

  .search-options {
    display: flex;
    gap: var(--cds-spacing-05);
    flex-wrap: wrap;
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

  .results-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 12rem;
    overflow-y: auto;
    border: 1px solid var(--cds-border-subtle-01);
  }

  .results-list__item {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-01);
    padding: var(--cds-spacing-03) var(--cds-spacing-05);
    cursor: pointer;
    background: var(--cds-layer-01, #f4f4f4);

    &:hover {
      background: var(--cds-layer-hover-01, #e8e8e8);
    }

    &--selected {
      background: var(--cds-layer-selected-01, #e0e0e0);

      &:hover {
        background: var(--cds-layer-selected-hover-01, #d1d1d1);
      }
    }

    &:focus-visible {
      outline: 2px solid var(--cds-focus, #0f62fe);
      outline-offset: -2px;
    }
  }

  .results-list__column {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.75rem;
    line-height: 1rem;
    color: var(--cds-text-secondary, #525252);
  }

  .results-list__value {
    font-family: 'IBM Plex Sans', sans-serif;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: var(--cds-text-primary, #161616);
    word-break: break-word;
  }
</style>
