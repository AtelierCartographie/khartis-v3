<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
  import { m } from '$lib/paraglide/messages';
  import {
    Button,
    Checkbox,
    Dropdown,
    Search,
    TextInput
  } from 'carbon-components-svelte';
  import { ChevronLeft, ChevronRight } from 'carbon-icons-svelte';
  import { onDestroy, untrack } from 'svelte';
  import { searchState, searchActions } from './search.store.svelte';

  const ALL_SOURCES_ID = 'all';

  // Local state for the replace input — bind:value is more reliable than
  // on:input with e.target in the Svelte 5 / Carbon interop context.
  let replaceInputValue = $state('');

  $effect(() => {
    const storeValue = searchState.replaceValue;
    untrack(() => {
      replaceInputValue = storeValue;
    });
  });

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
      .filter((col) => col.type !== 'geometry')
      .map((col) => ({ id: col.name, text: col.name }));

    return [allItem, ...columnItems];
  });

  const results = $derived(searchState.results);
  const currentResultIndex = $derived(searchState.currentResultIndex);
  const hasResults = $derived(results.length > 0);
  const showResults = $derived(searchState.searchValue.trim().length >= 2);
  const noResults = $derived(showResults && !hasResults);
  const hasExactReplaceCandidate = $derived(
    results.some(
      (result) => String(result.value ?? '') === searchState.searchValue.trim()
    )
  );
  const canReplace = $derived(
    hasResults &&
      searchState.replaceValue.trim().length > 0 &&
      hasExactReplaceCandidate &&
      !searchState.useRegex
  );

  async function handleReplaceNext() {
    await searchActions.replaceNext();
  }

  async function handleReplaceAll() {
    await searchActions.replaceAll();
  }

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

    <div class="replace-section">
      <TextInput
        size="sm"
        labelText={m.search_replace_with()}
        placeholder={m.search_replace_placeholder()}
        bind:value={replaceInputValue}
        on:input={() => searchActions.setReplaceValue(replaceInputValue)}
      />
      <p class="helper-text helper-text--info">
        {m.search_replace_exact_only()}
      </p>
      <div class="replace-buttons">
        <Button
          size="small"
          kind="secondary"
          disabled={!canReplace}
          on:click={handleReplaceNext}
        >
          {m.search_replace()}
        </Button>
        <Button
          size="small"
          kind="primary"
          disabled={!canReplace}
          on:click={handleReplaceAll}
        >
          {m.search_replace()} ({results.length})
        </Button>
      </div>
    </div>
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

  .helper-text--info {
    font-style: italic;
  }

  .results-navigation {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--cds-spacing-05);
  }

  .results-text {
    flex: 1 0 0;
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

  .replace-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    padding-top: var(--cds-spacing-03);
    border-top: 1px solid var(--cds-border-subtle-01);
  }

  .search-options {
    display: flex;
    gap: var(--cds-spacing-05);
    flex-wrap: wrap;
  }

  .replace-buttons {
    display: flex;
    gap: var(--cds-spacing-03);
    justify-content: flex-end;
  }
</style>
