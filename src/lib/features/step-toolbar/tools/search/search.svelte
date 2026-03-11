<script lang="ts">
  import IconButton from '$lib/features/commons/components/carbon/icon-button.svelte';
  import { m } from '$lib/paraglide/messages';
  import { Search } from 'carbon-components-svelte';
  import { ChevronLeft, ChevronRight } from 'carbon-icons-svelte';
  import { onDestroy } from 'svelte';
  import { searchState, searchActions } from './search.store.svelte';

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

  const results = $derived(searchState.results);
  const currentResultIndex = $derived(searchState.currentResultIndex);
  const hasResults = $derived(results.length > 0);
  const showResults = $derived(searchState.searchValue.trim().length >= 2);
  const noResults = $derived(showResults && !hasResults);

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
</style>
