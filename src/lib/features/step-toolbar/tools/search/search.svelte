<script lang="ts">
  import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
  import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
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
  import { onDestroy } from 'svelte';
  import { searchState, searchActions } from './search.store.svelte';

  const selectedVisualization = $derived(
    visualizationStore.selectedVisualization
  );

  const searchDataset = $derived.by(() => {
    if (selectedVisualization) {
      const datasetFromVisualization = datasetsStore.datasets.find(
        (dataset) => dataset.id === selectedVisualization.datasetId
      );

      if (datasetFromVisualization) {
        return datasetFromVisualization;
      }
    }

    return datasetsStore.selectedDataset ?? datasetsStore.enabledDatasets[0];
  });

  const ALL_SOURCES_ID = 'all';

  const sourceOptions = $derived.by(() => {
    const datasetColumns = searchDataset?.columns ?? [];

    return [
      { id: ALL_SOURCES_ID, text: m.search_all_variables() },
      ...datasetColumns
        .filter((column) => column.type !== 'geometry')
        .map((column) => ({
          id: column.name,
          text: column.name
        }))
    ];
  });

  function handleSearchInput(e: Event) {
    const target = e.target as HTMLInputElement;
    searchActions.setSearchValue(target.value);
  }

  function handleSourceChange(e: CustomEvent<{ selectedId: string }>) {
    searchActions.setSelectedSource(e.detail.selectedId);
  }

  function handleReplaceInput(e: Event) {
    const target = e.target as HTMLInputElement;
    searchActions.setReplaceValue(target.value);
  }

  async function handleReplace() {
    const success = await searchActions.replaceAll();
    if (success > 0) {
      searchActions.clearSearch();
    }
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

  $effect(() => {
    const selectedSource = searchState.selectedSource;
    const isKnownSource = sourceOptions.some(
      (option) => option.id === selectedSource
    );
    if (!isKnownSource) {
      searchActions.setSelectedSource(ALL_SOURCES_ID);
    }
  });

  onDestroy(() => {
    searchActions.clearSearch();
  });
</script>

<div id="khartis-search-tool">
  <Grid noGutter fullWidth>
    <Row padding>
      <Column>
        <Search
          value={searchState.searchValue}
          on:input={handleSearchInput}
          placeholder={m.search_placeholder()}
          size="lg"
        />
      </Column>
    </Row>

    <Row padding>
      <Column>
        <Dropdown
          id="source-dropdown"
          labelText={m.search_sources()}
          selectedId={searchState.selectedSource}
          on:select={handleSourceChange}
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
        <div class="full-width-input">
          <TextInput
            labelText={m.search_replace_by()}
            id="replace-input"
            value={searchState.replaceValue}
            on:input={handleReplaceInput}
            placeholder={m.search_no_value()}
            size="xl"
          />
        </div>

        <div class="replace-buttons">
          <Button
            kind="primary"
            onclick={handleReplace}
            disabled={!searchState.searchValue.trim() || !hasResults}
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

  .full-width-input :global(.bx--text-input) {
    width: 100%;
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
