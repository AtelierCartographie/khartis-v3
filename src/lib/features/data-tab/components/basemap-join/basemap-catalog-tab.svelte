<script lang="ts">
  import {
    formatBasemapValidity,
    isBasemapValidForYear
  } from '$lib/features/map/utils/basemap-validity.utils';
  import {
    countFacet,
    countYears,
    getBasemapAreaLabel,
    getBasemapLevelLabel,
    type FacetOption
  } from '$lib/features/map/utils/basemap-catalog-facets.utils';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { ToolbarState } from '$lib/features/commons/types/global';
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { sortCatalogBasemapsForDisplay } from '$lib/features/map/services/basemap-catalog.service.svelte';
  import type {
    BasemapExtent,
    BasemapMetadata,
    BasemapZone
  } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import { translateCarbonId } from '$lib/features/commons/utils/carbon-a11y.utils';
  import { FEEDBACK_FORM_URL } from '$lib/features/commons/constants/doc-links.constants';
  import {
    Button,
    ComboBox,
    Dropdown,
    InlineNotification
  } from 'carbon-components-svelte';
  import { Add, List, MagicWandFilled, Reset } from 'carbon-icons-svelte';
  import BasemapCardVertical from '../basemap-card-vertical.svelte';
  import { getLocale } from '$lib/paraglide/runtime.js';
  import {
    readCarbonStringValue,
    type CarbonValueEvent
  } from '$lib/features/commons/utils/carbon-events.utils';

  interface SuggestedBasemap {
    basemap: BasemapMetadata;
    score: number;
    matchesData: boolean;
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

  const ALL = 'all';
  const ZONE_ORDER: BasemapZone[] = ['world', 'continent', 'country'];
  const EXTENT_ORDER: BasemapExtent[] = [
    'whole',
    'region',
    'department',
    'epci',
    'commune',
    'state'
  ];

  let searchQuery = $state('');
  let searchSelectedId = $state<string | undefined>(undefined);
  let selectedZone = $state(ALL);
  let selectedArea = $state(ALL);
  let selectedExtent = $state(ALL);
  let selectedLevel = $state(ALL);
  let selectedYear = $state(ALL);

  const sortedBasemaps = $derived(
    sortCatalogBasemapsForDisplay(allBasemaps, getLocale())
  );

  function zoneLabel(zone: BasemapZone): string {
    if (zone === 'world') return m.basemap_zone_world();
    if (zone === 'continent') return m.basemap_zone_continent();
    return m.basemap_zone_country();
  }

  function extentLabel(extent: BasemapExtent): string {
    switch (extent) {
      case 'whole':
        return m.basemap_extent_whole();
      case 'region':
        return m.basemap_extent_region();
      case 'department':
        return m.basemap_extent_department();
      case 'epci':
        return m.basemap_extent_epci();
      case 'commune':
        return m.basemap_extent_commune();
      case 'state':
        return m.basemap_extent_state();
      default:
        // An extent added to the export before Khartis knows its label.
        return extent;
    }
  }

  // An upstream choice can leave a downstream one without any basemap: it then
  // falls back to "all" instead of emptying the list.
  function effective(selected: string, options: FacetOption[]): string {
    return options.some((o) => o.id === selected) ? selected : ALL;
  }

  function narrow(
    basemaps: BasemapMetadata[],
    selected: string,
    matches: (basemap: BasemapMetadata) => boolean
  ): BasemapMetadata[] {
    return selected === ALL ? basemaps : basemaps.filter(matches);
  }

  const zoneOptions = $derived(
    countFacet(
      sortedBasemaps,
      (b) => b.catalog?.zone,
      (_, zone) => zoneLabel(zone)
    ).sort((a, b) => ZONE_ORDER.indexOf(a.id) - ZONE_ORDER.indexOf(b.id))
  );
  const zone = $derived(effective(selectedZone, zoneOptions));
  const inZone = $derived(
    narrow(sortedBasemaps, zone, (b) => b.catalog?.zone === zone)
  );

  const areaOptions = $derived(
    zone === ALL || zone === 'world'
      ? []
      : countFacet(
          inZone,
          (b) => b.catalog?.area,
          (b) => getBasemapAreaLabel(b, getLocale())
        ).sort((a, b) => a.label.localeCompare(b.label, getLocale()))
  );
  const area = $derived(effective(selectedArea, areaOptions));
  const inArea = $derived(
    narrow(inZone, area, (b) => b.catalog?.area === area)
  );

  const extentOptions = $derived(
    area === ALL
      ? []
      : countFacet(
          inArea,
          (b) => b.catalog?.extent,
          (_, extent) => extentLabel(extent)
        ).sort(
          (a, b) => EXTENT_ORDER.indexOf(a.id) - EXTENT_ORDER.indexOf(b.id)
        )
  );
  const extent = $derived(effective(selectedExtent, extentOptions));
  const inExtent = $derived(
    narrow(inArea, extent, (b) => b.catalog?.extent === extent)
  );

  // Level and year stay disabled until a coverage is chosen: across the whole
  // catalog they mix every country's meshes and every vintage.
  const levelOptions = $derived(
    zone === ALL
      ? []
      : countFacet(
          inExtent,
          (b) => b.catalog?.level,
          (b) => getBasemapLevelLabel(b, getLocale())
        ).sort((a, b) => a.maxEntities - b.maxEntities)
  );
  const level = $derived(effective(selectedLevel, levelOptions));
  const inLevel = $derived(
    narrow(inExtent, level, (b) => b.catalog?.level === level)
  );

  const yearOptions = $derived(zone === ALL ? [] : countYears(inLevel));
  const year = $derived(effective(selectedYear, yearOptions));
  const inYear = $derived(
    narrow(inLevel, year, (b) => isBasemapValidForYear(b, year))
  );

  const hasActiveFilter = $derived(
    [zone, area, extent, level, year].some((value) => value !== ALL)
  );

  interface FacetView {
    items: { id: string; text: string }[];
    selectedId: string;
    disabled: boolean;
  }

  // A facet with a single option shows it, disabled, so that every facet keeps
  // its place and tells what the narrowed list contains.
  function facetView(
    options: FacetOption[],
    allLabel: string,
    total: number,
    selected: string
  ): FacetView {
    const items = [
      {
        id: ALL,
        text: m.basemap_facet_count({ label: allLabel, count: total })
      },
      ...options.map((o) => ({
        id: o.id,
        text: m.basemap_facet_count({ label: o.label, count: o.count })
      }))
    ];
    const disabled = options.length <= 1;
    return {
      items,
      selectedId: options.length === 1 ? options[0].id : selected,
      disabled
    };
  }

  function resetFilters() {
    selectedZone = ALL;
    selectedArea = ALL;
    selectedExtent = ALL;
    selectedLevel = ALL;
    selectedYear = ALL;
  }

  const filteredBasemaps = $derived.by(() => {
    let results: BasemapMetadata[] = inYear;

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

    return results;
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
              date: formatBasemapValidity(b)
            })
          : m.basemap_search_item({ title, date: formatBasemapValidity(b) }),
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

{#snippet facet(label: string, view: FacetView, onSelect: (id: string) => void)}
  <div
    class="funnel-facet"
    class:active={!view.disabled && view.selectedId !== ALL}
  >
    <Dropdown
      translateWithId={translateCarbonId}
      translateWithIdSelection={translateCarbonId}
      size="sm"
      labelText={label}
      items={view.items}
      selectedId={view.selectedId}
      disabled={view.disabled}
      on:select={(e) => onSelect(e.detail.selectedId)}
    />
  </div>
{/snippet}

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
            {#each suggestedBasemaps as { basemap, score, matchesData } (basemap.file)}
              <BasemapCardVertical
                basemap={basemap}
                matchScore={score}
                showMatchScore={matchesData}
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
      title={m.basemap_catalog_all()}
      open={catalogPanelOpen}
      onToggle={onCatalogToggle}
    >
      {#snippet icon()}
        <List size={16} />
      {/snippet}

      <div class="catalogue-filters">
        <ComboBox
          translateWithId={translateCarbonId}
          translateWithIdSelection={translateCarbonId}
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

        <div class="funnel-filters">
          {@render facet(
            m.basemap_filter_zone(),
            facetView(
              zoneOptions,
              m.basemap_filter_all(),
              sortedBasemaps.length,
              zone
            ),
            (id) => {
              selectedZone = id;
              selectedArea = ALL;
              selectedExtent = ALL;
            }
          )}
          {@render facet(
            m.basemap_filter_area(),
            facetView(areaOptions, m.basemap_filter_all(), inZone.length, area),
            (id) => {
              selectedArea = id;
              selectedExtent = ALL;
            }
          )}
          {@render facet(
            m.basemap_filter_extent(),
            facetView(
              extentOptions,
              m.basemap_filter_all(),
              inArea.length,
              extent
            ),
            (id) => (selectedExtent = id)
          )}
          {@render facet(
            m.basemap_filter_level(),
            facetView(
              levelOptions,
              m.basemap_filter_all(),
              inExtent.length,
              level
            ),
            (id) => (selectedLevel = id)
          )}
          {@render facet(
            m.basemap_filter_year(),
            facetView(
              yearOptions,
              m.basemap_filter_all(),
              inLevel.length,
              year
            ),
            (id) => (selectedYear = id)
          )}
          <div class="funnel-reset">
            <Button
              kind="ghost"
              size="small"
              icon={Reset}
              disabled={!hasActiveFilter}
              on:click={resetFilters}
            >
              {m.basemap_filters_reset()}
            </Button>
          </div>
        </div>
      </div>

      {#if filteredBasemaps.length === 0}
        <p class="no-results">{m.basemap_no_results()}</p>
      {:else}
        <div
          class="basemap-slider basemap-slider-catalog"
          class:compact-slider={isCompact}
        >
          <div class="basemap-slider-track">
            {#each filteredBasemaps as basemap (basemap.file)}
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
    --basemap-card-width: var(--kh-card-w);
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
    --basemap-card-width: var(--kh-card-w);
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

  .funnel-filters {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
    gap: var(--cds-spacing-03) var(--cds-spacing-04);
    align-items: end;
  }

  .funnel-facet {
    min-width: 0;
  }

  .funnel-facet.active :global(.bx--list-box__label) {
    color: var(--cds-link-01);
    font-weight: 600;
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
