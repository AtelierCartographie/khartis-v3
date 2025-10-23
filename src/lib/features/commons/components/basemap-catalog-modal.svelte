<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import {
    Modal,
    Search,
    Select,
    SelectItem,
    Button
  } from 'carbon-components-svelte';
  import { Launch } from 'carbon-icons-svelte';
  import BasemapCard from './basemap-card.svelte';
  import { basemapCatalogService } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import type {
    BasemapMetadata,
    BasemapSuggestion
  } from '$lib/features/map/types/basemap.types';

  interface Props {
    open: boolean;
    selectedBasemapId?: string;
    suggestions?: BasemapSuggestion[];
    onClose: () => void;
    onSelect: (basemap: BasemapMetadata) => void;
  }

  let {
    open = $bindable(),
    selectedBasemapId,
    suggestions = [],
    onClose,
    onSelect
  }: Props = $props();

  let searchQuery = $state('');
  let selectedYear = $state('all');
  let selectedBasemap = $state<BasemapMetadata | null>(null);

  const allBasemaps = $derived(basemapCatalogService.basemaps);

  const availableYears = $derived(() => {
    const years = new Set(allBasemaps.map((b: BasemapMetadata) => b.date));
    return Array.from(years).sort((a: string, b: string) => b.localeCompare(a));
  });

  const filteredBasemaps = $derived(() => {
    let results: BasemapMetadata[] = [...allBasemaps];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      results = results.filter(
        (b) =>
          b.title.toLowerCase().includes(query) ||
          b.description.toLowerCase().includes(query) ||
          b.source.toLowerCase().includes(query)
      );
    }

    if (selectedYear !== 'all') {
      results = results.filter((b) => b.date === selectedYear);
    }

    return results;
  });

  const suggestionsWithBasemap = $derived(() => {
    return suggestions
      .map((s: BasemapSuggestion) => ({
        basemap: allBasemaps.find((b: BasemapMetadata) => b.file === s.file),
        score: s.matchScore
      }))
      .filter((item) => item.basemap !== undefined) as {
      basemap: BasemapMetadata;
      score: number;
    }[];
  });

  const displayedBasemaps = $derived(() => {
    if (searchQuery.trim() || selectedYear !== 'all') {
      return filteredBasemaps();
    }

    const suggestionIds = new Set(
      suggestionsWithBasemap().map(
        (s: { basemap: BasemapMetadata; score: number }) => s.basemap.file
      )
    );
    return allBasemaps.filter(
      (b: BasemapMetadata) => !suggestionIds.has(b.file)
    );
  });

  function handleSelect(basemap: BasemapMetadata) {
    selectedBasemap = basemap;
  }

  function handleConfirm() {
    if (selectedBasemap) {
      onSelect(selectedBasemap);
      onClose();
    }
  }

  function handleSuggestBasemap() {
    window.open(
      'https://github.com/sciences-po/khartis-v3/issues/new?labels=basemap-suggestion',
      '_blank'
    );
  }

  $effect(() => {
    if (open && selectedBasemapId) {
      const basemap = allBasemaps.find(
        (b: BasemapMetadata) => b.file === selectedBasemapId
      );
      if (basemap) {
        selectedBasemap = basemap;
      }
    }
  });

  $effect(() => {
    if (!open) {
      searchQuery = '';
      selectedYear = 'all';
    }
  });
</script>

<Modal
  bind:open={open}
  modalHeading={m.basemap_catalog_title()}
  primaryButtonText={m.basemap_preview()}
  secondaryButtonText={m.duplicate_project_modal_cancel()}
  primaryButtonDisabled={!selectedBasemap}
  size="lg"
  on:click:button--secondary={onClose}
  on:submit={handleConfirm}
  on:close={onClose}
>
  <div class="modal-content">
    <p class="description">{m.basemap_catalog_description()}</p>

    <div class="filters">
      <Search
        bind:value={searchQuery}
        placeholder={m.basemap_search_placeholder()}
        size="lg"
      />

      <Select bind:selected={selectedYear} labelText={m.basemap_filter_year()}>
        <SelectItem value="all" text={m.basemap_all_years()} />
        {#each availableYears() as year}
          <SelectItem value={year as string} text={year as string} />
        {/each}
      </Select>
    </div>

    {#if suggestionsWithBasemap().length > 0 && !searchQuery.trim() && selectedYear === 'all'}
      <div class="section">
        <h5 class="section-title">{m.basemap_suggestions()}</h5>
        <div class="basemap-grid">
          {#each suggestionsWithBasemap() as { basemap, score }}
            <BasemapCard
              basemap={basemap}
              matchScore={score}
              selected={selectedBasemap?.file === basemap.file}
              onclick={() => handleSelect(basemap)}
            />
          {/each}
        </div>
      </div>
    {/if}

    <div class="section">
      {#if suggestionsWithBasemap().length > 0 && !searchQuery.trim() && selectedYear === 'all'}
        <h5 class="section-title">{m.basemap_other()}</h5>
      {/if}

      {#if displayedBasemaps().length === 0}
        <p class="no-results">{m.basemap_no_results()}</p>
      {:else}
        <div class="basemap-grid">
          {#each displayedBasemaps() as basemap}
            <BasemapCard
              basemap={basemap}
              selected={selectedBasemap?.file === basemap.file}
              onclick={() => handleSelect(basemap)}
            />
          {/each}
        </div>
      {/if}
    </div>

    <div class="footer-action">
      <Button
        kind="ghost"
        icon={Launch}
        iconDescription={m.basemap_suggest_addition()}
        on:click={handleSuggestBasemap}
      >
        {m.basemap_suggest_addition()}
      </Button>
    </div>
  </div>
</Modal>

<style>
  .modal-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .description {
    margin: 0;
    color: var(--cds-text-02);
    font-size: 0.875rem;
  }

  .filters {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 1rem;
    align-items: end;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--cds-text-01);
  }

  .basemap-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 1rem;
  }

  .no-results {
    margin: 2rem 0;
    text-align: center;
    color: var(--cds-text-02);
    font-size: 0.875rem;
  }

  .footer-action {
    display: flex;
    justify-content: flex-end;
    padding-top: 1rem;
    border-top: 1px solid var(--cds-ui-03);
  }

  @media (max-width: 768px) {
    .filters {
      grid-template-columns: 1fr;
    }

    .basemap-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
