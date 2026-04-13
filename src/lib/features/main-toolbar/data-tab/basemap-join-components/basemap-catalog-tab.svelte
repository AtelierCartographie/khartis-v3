<script lang="ts">
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    ComboBox,
    InlineNotification,
    Tag
  } from 'carbon-components-svelte';
  import { Add, List, MagicWand } from 'carbon-icons-svelte';
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
    onSuggestBasemap?: () => void;
  }

  let {
    suggestedBasemaps,
    allBasemaps,
    basemapSelected,
    onSelectBasemap,
    onSuggestBasemap
  }: Props = $props();

  const isCompact = $derived(globalState.toolbarState === ToolbarState.Compact);

  let searchQuery = $state('');
  let selectedYear = $state('all');
  let searchSelectedId = $state<string | undefined>(undefined);

  const availableYears = $derived.by(() => {
    const years = new Set(allBasemaps.map((b) => b.date));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  });

  const filteredBasemaps = $derived.by(() => {
    let results: BasemapMetadata[] = [...allBasemaps];

    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) {
      const query = trimmedQuery.toLowerCase();
      results = results.filter(
        (b) =>
          b.title_fr.toLowerCase().includes(query) ||
          (b.subtitle_fr ?? '').toLowerCase().includes(query) ||
          b.source.toLowerCase().includes(query)
      );
    }

    if (selectedYear !== 'all') {
      results = results.filter((b) => b.date === selectedYear);
    }

    return results;
  });

  const suggestionIds = $derived.by(
    () => new Set(suggestedBasemaps.map((s) => s.basemap.file))
  );

  const displayedBasemaps = $derived.by(() => {
    if (searchQuery.trim() || selectedYear !== 'all') {
      return filteredBasemaps.filter((b) => !suggestionIds.has(b.file));
    }

    return allBasemaps.filter((b) => !suggestionIds.has(b.file));
  });

  const yearCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    allBasemaps.forEach((b) => {
      counts[b.date] = (counts[b.date] || 0) + 1;
    });
    return counts;
  });

  const searchComboBoxItems = $derived.by((): SearchComboBoxItem[] => {
    return allBasemaps.map((b, index) => ({
      id: `basemap-${index}`,
      text: b.subtitle_fr
        ? `${b.title_fr} — ${b.subtitle_fr} (${b.date})`
        : `${b.title_fr} (${b.date})`,
      basemap: b
    }));
  });

  function handleSearchSelect(
    e: CustomEvent<{ selectedId: string; selectedItem: SearchComboBoxItem }>
  ) {
    if (e.detail.selectedItem) {
      searchQuery = e.detail.selectedItem.basemap.title_fr;
      // Selecting from the ComboBox must trigger the same flow as clicking a card.
      onSelectBasemap(e.detail.selectedItem.basemap);
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
  <ExpandableSection
    title={m.section_suggestions()}
    open={suggestedBasemaps.length > 0}
  >
    {#snippet icon()}
      <MagicWand size={16} />
    {/snippet}
    {#if suggestedBasemaps.length > 0}
      <p class="section-subtitle">
        {m.basemap_suggestions_desc()}
      </p>
      {#if isCompact}
        <div class="compact-rail">
          <div class="compact-rail-track">
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
      {/if}
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

  <div class="catalogue-section" class:compact-mode={isCompact}>
    <ExpandableSection
      title={m.basemap_other()}
      open={suggestedBasemaps.length === 0}
    >
      {#snippet icon()}
        <List size={16} />
      {/snippet}

      <div class="catalogue-filters">
        <ComboBox
          items={searchComboBoxItems}
          selectedId={searchSelectedId}
          bind:value={searchQuery}
          placeholder={m.basemap_search_placeholder()}
          shouldFilterItem={(item, value) => {
            if (!value) return true;
            const query = value.toLowerCase();
            const basemap = (item as SearchComboBoxItem).basemap;
            return (
              basemap.title_fr.toLowerCase().includes(query) ||
              (basemap.subtitle_fr ?? '').toLowerCase().includes(query) ||
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
          {#each availableYears as year (year)}
            <Tag
              type={selectedYear === year ? 'blue' : 'gray'}
              interactive
              on:click={() => (selectedYear = year)}
            >
              {year} ({yearCounts[year] || 0})
            </Tag>
          {/each}
        </div>
      </div>

      {#if displayedBasemaps.length === 0}
        <p class="no-results">{m.basemap_no_results()}</p>
      {:else if isCompact}
        <div class="compact-rail compact-rail-catalog">
          <div class="compact-rail-track">
            {#each displayedBasemaps as basemap (basemap.file)}
              <BasemapCardVertical
                basemap={basemap}
                selected={basemap.file === basemapSelected}
                onclick={() => onSelectBasemap(basemap)}
                showMatchScore={false}
                variant="gray"
              />
            {/each}
          </div>
        </div>
      {:else}
        <div class="basemap-cards-grid">
          {#each displayedBasemaps as basemap (basemap.file)}
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
      {#if onSuggestBasemap}
        <div class="suggest-action">
          <Button
            kind="ghost"
            size="small"
            icon={Add}
            on:click={onSuggestBasemap}
          >
            {m.basemap_suggest_button()}
          </Button>
        </div>
      {/if}
    </ExpandableSection>
  </div>
</div>

<style>
  .tab-content {
    display: flex;
    flex-direction: column;
  }

  .section-subtitle {
    margin: 0 0 var(--cds-spacing-03) 0;
    font-size: 0.8125rem;
    color: var(--cds-link-01);
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

  .compact-rail {
    margin-left: calc(-1 * var(--cds-spacing-04));
    margin-right: calc(-1 * var(--cds-spacing-04));
    padding-left: var(--cds-spacing-04);
    padding-right: var(--cds-spacing-04);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    scrollbar-color: var(--cds-border-subtle) transparent;
    scroll-snap-type: x proximity;
    --basemap-card-width: 176px;
    --basemap-card-preview-min-height: 88px;
    --basemap-card-padding-bottom: 12px;
  }

  .compact-rail::-webkit-scrollbar {
    height: 6px;
  }

  .compact-rail::-webkit-scrollbar-track {
    background: transparent;
  }

  .compact-rail::-webkit-scrollbar-thumb {
    background-color: var(--cds-border-subtle);
  }

  .compact-rail-track {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(2, auto);
    grid-auto-columns: var(--basemap-card-width);
    gap: var(--cds-spacing-03);
    align-items: start;
    width: max-content;
    padding-bottom: var(--cds-spacing-03);
  }

  .compact-rail-track :global(.basemap-card) {
    scroll-snap-align: start;
  }

  .compact-rail-catalog {
    margin-top: var(--cds-spacing-03);
  }

  .catalogue-filters {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    margin-bottom: var(--cds-spacing-03);
  }

  .catalogue-section.compact-mode :global(.section-expand-btn) {
    padding-left: 0;
  }

  .catalogue-section.compact-mode :global(.section-body) {
    padding-left: 0;
    padding-right: 0;
  }

  .catalogue-section.compact-mode .catalogue-filters,
  .catalogue-section.compact-mode .suggest-action,
  .catalogue-section.compact-mode .no-results {
    padding-left: var(--cds-spacing-04);
    padding-right: var(--cds-spacing-04);
  }

  .catalogue-section.compact-mode .compact-rail-catalog {
    margin-left: 0;
    margin-right: 0;
    padding-left: 0;
    padding-right: 0;
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

  .suggest-action {
    display: flex;
    justify-content: flex-start;
    margin-top: var(--cds-spacing-04);
    padding-top: var(--cds-spacing-03);
    border-top: 1px solid var(--cds-border-subtle-01);
  }
</style>
