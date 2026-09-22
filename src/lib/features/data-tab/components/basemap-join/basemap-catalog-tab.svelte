<script lang="ts">
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { sortCatalogBasemapsForDisplay } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import { FEEDBACK_FORM_URL } from '$lib/features/commons/constants/doc-links.constants';
  import {
    Button,
    ComboBox,
    InlineNotification,
    Tag
  } from 'carbon-components-svelte';
  import { Add, List, MagicWandFilled } from 'carbon-icons-svelte';
  import BasemapCardVertical from '../basemap-card-vertical.svelte';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import {
    readCarbonStringValue,
    type CarbonValueEvent
  } from '$lib/features/commons/utils/carbon-events.utils';

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
    suggestionsOpen?: boolean;
    catalogOpen?: boolean;
    onSuggestionsToggle?: (expanded: boolean) => void;
    onCatalogToggle?: (expanded: boolean) => void;
  }

  let {
    suggestedBasemaps,
    allBasemaps,
    basemapSelected,
    onSelectBasemap,
    suggestionsOpen,
    catalogOpen,
    onSuggestionsToggle,
    onCatalogToggle
  }: Props = $props();

  const isCompact = $derived(globalState.toolbarState === ToolbarState.Compact);

  let searchQuery = $state('');
  let selectedYear = $state('all');
  let searchSelectedId = $state<string | undefined>(undefined);

  const availableYears = $derived.by(() => {
    const years = new Set(allBasemaps.map((b) => b.date));
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  });

  const sortedBasemaps = $derived(
    sortCatalogBasemapsForDisplay(allBasemaps, getLocale())
  );

  const filteredBasemaps = $derived.by(() => {
    let results: BasemapMetadata[] = [...sortedBasemaps];

    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) {
      const query = trimmedQuery.toLowerCase();
      const lang = getLocale();
      results = results.filter((b) => {
        const title = lang === 'fr' ? b.title_fr : b.title_en;
        const subtitle = lang === 'fr' ? b.subtitle_fr : b.subtitle_en;
        return (
          title.toLowerCase().includes(query) ||
          (subtitle ?? '').toLowerCase().includes(query) ||
          b.source.toLowerCase().includes(query)
        );
      });
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

    return sortedBasemaps.filter((b) => !suggestionIds.has(b.file));
  });

  const yearCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    allBasemaps.forEach((b) => {
      counts[b.date] = (counts[b.date] || 0) + 1;
    });
    return counts;
  });

  const suggestionsPanelOpen = $derived(
    suggestionsOpen ?? suggestedBasemaps.length > 0
  );
  const catalogPanelOpen = $derived(
    catalogOpen ?? suggestedBasemaps.length === 0
  );

  const searchComboBoxItems = $derived.by((): SearchComboBoxItem[] => {
    const lang = getLocale();
    return sortedBasemaps.map((b, index) => {
      const title = lang === 'fr' ? b.title_fr : b.title_en;
      const subtitle = lang === 'fr' ? b.subtitle_fr : b.subtitle_en;
      return {
        id: `basemap-${index}`,
        text: subtitle
          ? m.basemap_search_item_with_subtitle({
              title,
              subtitle,
              date: b.date
            })
          : m.basemap_search_item({ title, date: b.date }),
        basemap: b
      };
    });
  });

  function handleSearchSelect(
    e: CustomEvent<{ selectedId: string; selectedItem: SearchComboBoxItem }>
  ) {
    if (e.detail.selectedItem) {
      const lang = getLocale();
      const title =
        lang === 'fr'
          ? e.detail.selectedItem.basemap.title_fr
          : e.detail.selectedItem.basemap.title_en;
      searchQuery = title;

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

  function handleSearchInput(event: CarbonValueEvent) {
    searchQuery = readCarbonStringValue(event, searchQuery);
  }
</script>

<div class="tab-content">
  <div class="suggestions-section">
    <ExpandableSection
      title={m.section_suggestions()}
      open={suggestionsPanelOpen}
      onToggle={onSuggestionsToggle}
      titleClass="suggestions-title"
    >
      {#snippet icon()}
        <span class="suggestions-title-icon">
          <MagicWandFilled size={20} />
        </span>
      {/snippet}
      {#if suggestedBasemaps.length > 0}
        <p class="section-subtitle">
          {m.basemap_suggestions_desc()}
        </p>
        <div class="basemap-slider" class:compact-slider={isCompact}>
          <div class="basemap-slider-track">
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
        <div class="suggestions-notification">
          <InlineNotification
            kind="info"
            title={m.basemap_no_suggestions_title()}
            subtitle={m.basemap_no_suggestions_subtitle()}
            hideCloseButton={true}
            lowContrast
          />
        </div>
      {/if}
    </ExpandableSection>
  </div>

  <div class="catalogue-section">
    <ExpandableSection
      title={m.basemap_other()}
      open={catalogPanelOpen}
      onToggle={onCatalogToggle}
    >
      {#snippet icon()}
        <List size={16} />
      {/snippet}

      <div class="catalogue-filters">
        <ComboBox
          size="sm"
          items={searchComboBoxItems}
          selectedId={searchSelectedId}
          value={searchQuery}
          labelText={m.basemap_search_placeholder()}
          hideLabel
          placeholder={m.basemap_search_placeholder()}
          shouldFilterItem={(item, value) => {
            if (!value) return true;
            const query = value.toLowerCase();
            const basemap = (item as SearchComboBoxItem).basemap;
            const lang = getLocale();
            const title = lang === 'fr' ? basemap.title_fr : basemap.title_en;
            const subtitle =
              lang === 'fr' ? basemap.subtitle_fr : basemap.subtitle_en;
            return (
              title.toLowerCase().includes(query) ||
              (subtitle ?? '').toLowerCase().includes(query) ||
              basemap.source.toLowerCase().includes(query)
            );
          }}
          on:input={handleSearchInput}
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
              {m.basemap_year_count({
                year,
                count: yearCounts[year] || 0
              })}
            </Tag>
          {/each}
        </div>
      </div>

      {#if displayedBasemaps.length === 0}
        <p class="no-results">{m.basemap_no_results()}</p>
      {:else}
        <div
          class="basemap-slider basemap-slider-catalog"
          class:compact-slider={isCompact}
        >
          <div class="basemap-slider-track">
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
      {/if}
      <div class="suggest-action">
        <Button
          kind="ghost"
          size="small"
          icon={Add}
          href={FEEDBACK_FORM_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {m.basemap_suggest_button()}
        </Button>
      </div>
    </ExpandableSection>
  </div>
</div>

<style>
  .tab-content {
    display: flex;
    flex-direction: column;
  }

  .suggestions-title-icon {
    color: var(--khartis-additions-interactive-suggestions, #0072c3);
    display: flex;
    align-items: center;
  }

  .section-subtitle {
    margin: 0 0 var(--cds-spacing-03) 0;
    font-size: 0.8125rem;
    color: var(--khartis-additions-text-helper-suggestions, #0072c3);
    line-height: 1.25rem;
  }

  .suggestions-notification {
    padding-bottom: var(--cds-spacing-02);
  }

  .basemap-slider {
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x proximity;
    overscroll-behavior-x: contain;
    --basemap-card-width: 176px;
    --basemap-card-preview-min-height: 6.5rem;
    --basemap-card-padding-bottom: 0.875rem;
  }

  .basemap-slider::-webkit-scrollbar {
    height: 8px;
    -webkit-appearance: none;
  }

  .basemap-slider::-webkit-scrollbar-track {
    background: var(--cds-layer-02, #e8e8e8);
    border-radius: 4px;
  }

  .basemap-slider::-webkit-scrollbar-thumb {
    background-color: var(--cds-border-strong, #8d8d8d);
    border-radius: 4px;
  }

  .basemap-slider::-webkit-scrollbar-thumb:hover {
    background-color: var(--cds-text-secondary, #525252);
  }

  .basemap-slider-track {
    display: flex;
    gap: var(--cds-spacing-03);
    width: max-content;
    padding-bottom: var(--cds-spacing-03);
  }

  .basemap-slider-track :global(.basemap-card) {
    scroll-snap-align: start;
  }

  .compact-slider {
    --basemap-card-width: 176px;
    --basemap-card-preview-min-height: 5.5rem;
    --basemap-card-padding-bottom: 0.75rem;
  }

  .basemap-slider-catalog {
    margin-top: var(--cds-spacing-03);
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
