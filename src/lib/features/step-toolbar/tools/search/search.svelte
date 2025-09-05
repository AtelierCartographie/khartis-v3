<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import {
    Button,
    Column,
    Dropdown,
    Grid,
    Row,
    Search,
    TextInput
  } from 'carbon-components-svelte';
  import {
    ChevronLeft,
    ChevronRight,
    WatsonHealthRotate_360
  } from 'carbon-icons-svelte';
  import { toolActions, toolState } from '../tools-store/tools.store.svelte';

  let searchValue = $state(toolState.search.searchValue);
  let selectedSource = $state(toolState.search.selectedSource);
  let replaceValue = $state(toolState.search.replaceValue);

  $effect(() => {
    toolActions.updateSearch({
      searchValue,
      selectedSource,
      replaceValue
    });
  });

  const sourceOptions = [
    { id: 'all', text: m.search_all_variables() },
    { id: 'numeric', text: m.search_numeric_variables() },
    { id: 'categorical', text: m.search_categorical_variables() },
    { id: 'text', text: m.search_text_variables() }
  ];

  function handleReplace() {
    const success = toolActions.performReplace();
    if (success) {
      searchValue = '';
      replaceValue = '';
    }
  }

  function navigateResults(direction: 'prev' | 'next') {
    const currentIndex = toolState.search.currentResultIndex;
    const totalResults = toolState.search.results.length;

    if (direction === 'next' && currentIndex < totalResults - 1) {
      toolActions.updateSearch({ currentResultIndex: currentIndex + 1 });
    } else if (direction === 'prev' && currentIndex > 0) {
      toolActions.updateSearch({ currentResultIndex: currentIndex - 1 });
    }
  }

  const results = $derived(toolState.search.results);
  const currentResultIndex = $derived(toolState.search.currentResultIndex);
  const hasResults = $derived(results.length > 0);
  const showResults = $derived(searchValue.trim().length > 0);
  const noResults = $derived(showResults && !hasResults);
</script>

<div id="khartis-search-tool">
  <Grid noGutter fullWidth>
    <Row padding>
      <Column>
        <Search
          bind:value={searchValue}
          placeholder={m.search_placeholder()}
          size="lg"
        />
      </Column>
    </Row>

    <Row padding>
      <Column>
        <Dropdown
          id="source-dropdown"
          titleText={m.search_sources()}
          bind:selectedId={selectedSource}
          items={sourceOptions}
          size="lg"
        />
      </Column>
    </Row>

    {#if showResults}
      <Row padding>
        <Column class="results-container">
          {#if noResults}
            <div class="results-navigation">
              <Button
                kind="ghost"
                size="small"
                iconDescription={m.search_previous()}
                icon={ChevronLeft}
                disabled
              />
              <span class="results-text">{m.search_no_results()}</span>
              <Button
                kind="ghost"
                size="small"
                iconDescription={m.search_next()}
                icon={ChevronRight}
                disabled
              />
            </div>
          {:else}
            <div class="results-navigation">
              <Button
                kind="ghost"
                size="small"
                iconDescription={m.search_previous()}
                icon={ChevronLeft}
                onclick={() => navigateResults('prev')}
              />
              <span class="results-text"
                >{m.search_results_count({
                  current: currentResultIndex + 1,
                  total: results.length
                })}</span
              >
              <Button
                kind="ghost"
                size="small"
                iconDescription={m.search_next()}
                icon={ChevronRight}
                onclick={() => navigateResults('next')}
              />
            </div>
          {/if}
        </Column>
      </Row>
    {/if}

    <Row padding>
      <Column>
        <TextInput
          class="full-width"
          labelText={m.search_replace_by()}
          id="replace-input"
          bind:value={replaceValue}
          placeholder={m.search_no_value()}
          size="xl"
        />

        <div class="replace-buttons">
          <Button
            kind="primary"
            onclick={handleReplace}
            disabled={!searchValue.trim() || !hasResults}
            icon={WatsonHealthRotate_360}
          >
            {m.search_replace()}
          </Button>
        </div>
      </Column>
    </Row>
  </Grid>
</div>

<style>
  #khartis-search-tool :global(.results-container) {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 2rem;
  }

  .results-navigation {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
  }

  .results-text {
    color: var(--cds-text-secondary);
    font-size: 0.875rem;
  }

  #khartis-search-tool :global(.replace-button-container) {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--cds-spacing-03);
  }

  .replace-buttons {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--cds-spacing-04);
    margin-top: var(--cds-spacing-04);
  }

  #khartis-search-tool :global(.full-width) {
    width: 100%;
  }
</style>
