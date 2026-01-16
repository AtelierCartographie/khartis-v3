<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    ComboBox,
    InlineNotification,
    Tag
  } from 'carbon-components-svelte';
  import { Launch, List, MagicWand, Upload } from 'carbon-icons-svelte';
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
    onSuggestBasemap: () => void;
    onGoToImport: () => void;
  }

  let {
    suggestedBasemaps,
    allBasemaps,
    basemapSelected,
    onSelectBasemap,
    onSuggestBasemap,
    onGoToImport
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
      <p class="kh-help section-subtitle">
        {m.basemap_suggestions_desc()}
      </p>
      <div class="suggestions-scroll-container">
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

  <ExpandableSection
    title={m.basemap_other()}
    defaultOpen={suggestedBasemaps.length === 0}
  >
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

    <div class="footer-section">
      <div class="footer-row">
        <span class="footer-label">{m.basemap_missing_question()}</span>
        <Button
          kind="ghost"
          icon={Launch}
          iconDescription={m.basemap_suggest_addition()}
          on:click={onSuggestBasemap}
        >
          {m.basemap_suggest_button()}
        </Button>
        <Button kind="primary" icon={Upload} on:click={onGoToImport}>
          {m.basemap_import_button()}
        </Button>
      </div>
      <Button
        kind="ghost"
        icon={Launch}
        iconDescription={m.basemap_learn_more()}
        href="https://www.sciencespo.fr/cartographie/khartis/docs/basemaps"
        target="_blank"
        size="small"
      >
        {m.basemap_learn_more()}
      </Button>
    </div>
  </ExpandableSection>
</div>

<style>
  .tab-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-05);
  }

  .kh-help {
    color: var(--cds-text-02);
    margin-bottom: var(--cds-spacing-05);
  }

  .section-subtitle {
    margin-top: 0;
    font-style: italic;
  }

  .suggestions-scroll-container {
    margin-top: var(--cds-spacing-04);
    margin-left: calc(-1 * var(--cds-spacing-05));
    margin-right: calc(-1 * var(--cds-spacing-05));
    padding-left: var(--cds-spacing-05);
    padding-right: var(--cds-spacing-05);
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--cds-border-subtle) transparent;
  }

  .suggestions-scroll-container::-webkit-scrollbar {
    height: 6px;
  }

  .suggestions-scroll-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .suggestions-scroll-container::-webkit-scrollbar-thumb {
    background-color: var(--cds-border-subtle);
    border-radius: 3px;
  }

  .suggestions-scroll {
    display: flex;
    gap: var(--cds-spacing-04);
    padding-bottom: var(--cds-spacing-03);
  }

  .basemap-cards-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--cds-spacing-03);
    margin-top: var(--cds-spacing-04);
  }

  .catalogue-filters {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    margin-bottom: var(--cds-spacing-04);
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

  .no-results {
    margin: 2rem 0;
    text-align: center;
    color: var(--cds-text-02);
    font-size: 0.875rem;
  }

  .footer-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
    padding-top: var(--cds-spacing-05);
    margin-top: var(--cds-spacing-05);
    border-top: 1px solid var(--cds-ui-03);
  }

  .footer-row {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-04);
    flex-wrap: wrap;
  }

  .footer-label {
    font-size: 0.875rem;
    color: var(--cds-text-02);
  }
</style>
