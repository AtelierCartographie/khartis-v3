<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import { ComboBox, InlineNotification, Tag } from 'carbon-components-svelte';
  import { List, MagicWand } from 'carbon-icons-svelte';
  import BasemapCardVertical from '../components/basemap-card-vertical.svelte';

  interface SuggestedBasemap {
    basemap: BasemapMetadata;
    score: number;
  }

  interface SearchComboBoxItem {
    id: string;
    text: string;
    basemap: BasemapMetadata;
  }

  interface Props {
    suggestedBasemaps: SuggestedBasemap[];
    allBasemaps: BasemapMetadata[];
    basemapSelected: string;
    onSelectBasemap: (basemap: BasemapMetadata) => void;
  }

  let {
    suggestedBasemaps,
    allBasemaps,
    basemapSelected,
    onSelectBasemap
  }: Props = $props();

  let searchQuery = $state('');
  let selectedYear = $state('all');
  let searchSelectedId = $state<string | undefined>(undefined);

  const availableYears = $derived(() => {
    const years = new Set(allBasemaps.map((b) => b.date));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
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

  const displayedBasemaps = $derived(() => {
    if (searchQuery.trim() || selectedYear !== 'all') {
      return filteredBasemaps();
    }

    const suggestionIds = new Set(suggestedBasemaps.map((s) => s.basemap.file));
    return allBasemaps.filter((b) => !suggestionIds.has(b.file));
  });

  const yearCounts = $derived(() => {
    const counts: Record<string, number> = {};
    allBasemaps.forEach((b) => {
      counts[b.date] = (counts[b.date] || 0) + 1;
    });
    return counts;
  });

  const searchComboBoxItems = $derived((): SearchComboBoxItem[] => {
    return allBasemaps.map((b, index) => ({
      id: `basemap-${index}`,
      text: `${b.title} (${b.date})`,
      basemap: b
    }));
  });

  function handleSearchSelect(
    e: CustomEvent<{ selectedId: string; selectedItem: SearchComboBoxItem }>
  ) {
    if (e.detail.selectedItem) {
      searchQuery = e.detail.selectedItem.basemap.title;
    } else {
      searchQuery = '';
    }
    searchSelectedId = e.detail.selectedId;
  }

  function handleSearchClear() {
    searchQuery = '';
    searchSelectedId = undefined;
  }
</script>

<div class="tab-content">
  <ExpandableSection title={m.section_suggestions()} defaultOpen={true}>
    {#snippet icon()}
      <MagicWand size={16} />
    {/snippet}
    {#if suggestedBasemaps.length > 0}
      <p class="section-subtitle">
        {m.basemap_suggestions_desc()}
      </p>
      <div class="suggestions-container">
        <div class="suggestions-scroll">
          {#each suggestedBasemaps as { basemap, score } (basemap.file)}
            <BasemapCardVertical
              basemap={basemap}
              matchScore={score}
              selected={basemap.file === basemapSelected}
              onclick={() => onSelectBasemap(basemap)}
            />
          {/each}
        </div>
      </div>
    {:else}
      <InlineNotification
        kind="info"
        title={m.basemap_no_suggestions_title()}
        subtitle={m.basemap_no_suggestions_subtitle()}
        hideCloseButton={true}
        lowContrast
      />
    {/if}
  </ExpandableSection>

  <ExpandableSection title={m.basemap_other()} defaultOpen={false}>
    {#snippet icon()}
      <List size={16} />
    {/snippet}

    <div class="catalogue-filters">
      <ComboBox
        items={searchComboBoxItems()}
        selectedId={searchSelectedId}
        placeholder={m.basemap_search_placeholder()}
        shouldFilterItem={(item, value) => {
          if (!value) return true;
          const query = value.toLowerCase();
          const basemap = (item as SearchComboBoxItem).basemap;
          return (
            basemap.title.toLowerCase().includes(query) ||
            basemap.description.toLowerCase().includes(query) ||
            basemap.source.toLowerCase().includes(query)
          );
        }}
        on:select={handleSearchSelect}
        on:clear={handleSearchClear}
      />

      <div class="year-filters">
        <span class="filter-label">{m.basemap_filter_year()}</span>
        <Tag
          type={selectedYear === 'all' ? 'blue' : 'gray'}
          interactive
          on:click={() => (selectedYear = 'all')}
        >
          {m.basemap_all_years()}
        </Tag>
        {#each availableYears() as year (year)}
          <Tag
            type={selectedYear === year ? 'blue' : 'gray'}
            interactive
            on:click={() => (selectedYear = year)}
          >
            {year} ({yearCounts()[year] || 0})
          </Tag>
        {/each}
      </div>
    </div>

    {#if displayedBasemaps().length === 0}
      <p class="no-results">{m.basemap_no_results()}</p>
    {:else}
      <div class="basemap-cards-grid">
        {#each displayedBasemaps() as basemap (basemap.file)}
          <BasemapCardVertical
            basemap={basemap}
            selected={basemap.file === basemapSelected}
            onclick={() => onSelectBasemap(basemap)}
            showMatchScore={false}
            variant="gray"
          />
        {/each}
      </div>
    {/if}
  </ExpandableSection>
</div>

<style>
  .tab-content {
    display: flex;
    flex-direction: column;
  }

  .section-subtitle {
    margin: 0 0 var(--cds-spacing-03) 0;
    font-size: 0.8125rem;
    color: var(--cds-text-02);
    line-height: 1.25rem;
  }

  .suggestions-container {
    margin-left: calc(-1 * var(--cds-spacing-04));
    margin-right: calc(-1 * var(--cds-spacing-04));
    padding-left: var(--cds-spacing-04);
    padding-right: var(--cds-spacing-04);
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--cds-border-subtle) transparent;
  }

  .suggestions-container::-webkit-scrollbar {
    height: 6px;
  }

  .suggestions-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .suggestions-container::-webkit-scrollbar-thumb {
    background-color: var(--cds-border-subtle);
    border-radius: 3px;
  }

  .suggestions-scroll {
    display: flex;
    gap: var(--cds-spacing-04);
    padding-bottom: var(--cds-spacing-03);
  }

  .catalogue-filters {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    margin-bottom: var(--cds-spacing-03);
  }

  .year-filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-02);
    align-items: center;
  }

  .filter-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--cds-text-01);
    margin-right: var(--cds-spacing-03);
  }

  .basemap-cards-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cds-spacing-03);
    margin-top: var(--cds-spacing-03);
  }

  .no-results {
    margin: 2rem 0;
    text-align: center;
    color: var(--cds-text-02);
    font-size: 0.875rem;
  }
</style>
