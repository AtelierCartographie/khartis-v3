<script lang="ts">
  import ExpandableSection from '$lib/features/commons/components/expandable-section.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import {
    Button,
    ComboBox,
    InlineNotification,
    Tag,
    TextInput
  } from 'carbon-components-svelte';
  import {
    CheckmarkFilled,
    CloudUpload,
    Earth,
    Launch,
    List,
    Upload
  } from 'carbon-icons-svelte';
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
    allBasemaps: BasemapMetadata[];
    suggestedBasemaps: SuggestedBasemap[];
    basemapSelected: string;
    onSelectBasemap: (basemap: BasemapMetadata) => void;
    onSuggestBasemap: () => void;
    importedBasemap: BasemapMetadata | null;
    importError: string | null;
    importUploading: boolean;
    hasGPSCoordinates: boolean;
    onFileDrop: (event: DragEvent) => void;
    onFileInputChange: (event: Event) => void;
    onLoadUrl: (url: string) => void;
    onSelectOSM: () => void;
    onGoToVisualize: () => void;
  }

  let {
    allBasemaps,
    suggestedBasemaps,
    basemapSelected,
    onSelectBasemap,
    onSuggestBasemap,
    importedBasemap,
    importError,
    importUploading,
    hasGPSCoordinates,
    onFileDrop,
    onFileInputChange,
    onLoadUrl,
    onSelectOSM,
    onGoToVisualize
  }: Props = $props();

  // Basemap grid state
  let searchQuery = $state('');
  let selectedYear = $state('all');
  let searchSelectedId = $state<string | undefined>(undefined);

  // Import state
  let isDragging = $state(false);
  let fileInputRef = $state<HTMLInputElement | null>(null);
  let importUrl = $state('');

  const acceptedExtensions = [
    '.geojson',
    '.json',
    '.shp',
    '.gpkg',
    '.kml',
    '.parquet'
  ];

  // Basemap grid derived
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

  function handleLoadUrlClick() {
    if (!importUrl.trim()) return;
    onLoadUrl(importUrl.trim());
    importUrl = '';
  }
</script>

<div class="tab-content">
  <!-- Basemap catalog grid -->
  <ExpandableSection title={m.basemap_other()} defaultOpen={true}>
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

    <div class="grid-footer">
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
        <Button kind="primary" icon={Upload} on:click={onSuggestBasemap}>
          {m.basemap_import_button()}
        </Button>
      </div>
      <div class="footer-link">
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
    </div>
  </ExpandableSection>

  <!-- Import section -->
  <ExpandableSection title={m.basemap_section_import()} defaultOpen={false}>
    {#snippet icon()}
      <Upload size={16} />
    {/snippet}

    <p class="kh-help">
      {m.basemap_import_modal_description()}
    </p>

    <div
      class="dropzone"
      class:dropzone-active={isDragging}
      role="button"
      tabindex={0}
      ondragover={(e: DragEvent) => {
        e.preventDefault();
        isDragging = true;
      }}
      ondragleave={() => {
        isDragging = false;
      }}
      ondrop={(e: DragEvent) => {
        e.preventDefault();
        isDragging = false;
        onFileDrop(e);
      }}
      onclick={() => fileInputRef?.click()}
      onkeydown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') fileInputRef?.click();
      }}
    >
      <span class="dropzone-text">{m.basemap_import_dropzone_text()}</span>
      <input
        bind:this={fileInputRef}
        type="file"
        accept={acceptedExtensions.join(',')}
        onchange={onFileInputChange}
        hidden
      />
    </div>

    <div class="url-import-section">
      <span class="section-label">{m.basemap_import_url_label()}</span>
      <div class="url-import-row">
        <TextInput bind:value={importUrl} placeholder={m.url_placeholder()} />
        <Button
          kind="tertiary"
          size="field"
          icon={CloudUpload}
          disabled={!importUrl.trim() || importUploading}
          on:click={handleLoadUrlClick}
        >
          {m.basemap_import_url_button()}
        </Button>
      </div>
    </div>

    {#if importedBasemap}
      <div class="imported-file">
        <span class="file-label">{m.basemap_import_file_imported()}</span>
        <div class="file-row">
          <span class="file-name">{importedBasemap.title}</span>
          <CheckmarkFilled size={20} class="icon-success" />
        </div>
      </div>
    {/if}

    {#if importError}
      <InlineNotification
        kind="error"
        title={m.basemap_custom_error()}
        subtitle={importError}
        hideCloseButton={false}
        lowContrast
      />
    {/if}

    <div class="footer-link">
      <Button
        kind="ghost"
        icon={Launch}
        iconDescription={m.learn_more()}
        href="https://www.sciencespo.fr/cartographie/khartis/docs"
        target="_blank"
        size="small"
      >
        {m.basemap_import_learn_more()}
      </Button>
    </div>
  </ExpandableSection>

  <!-- OSM section -->
  <ExpandableSection title={m.basemap_section_osm()} defaultOpen={false}>
    {#snippet icon()}
      <Earth size={16} />
    {/snippet}

    <p class="kh-help">
      {m.osm_description()}
    </p>

    {#if !hasGPSCoordinates}
      <InlineNotification
        kind="warning"
        title={m.osm_modal_gps_required_title()}
        subtitle={m.osm_modal_gps_required_subtitle()}
        hideCloseButton={true}
        lowContrast
      />
    {:else if osmBasemapStore.isActive}
      <InlineNotification
        kind="success"
        title={m.osm_basemap_title({ style: 'OpenStreetMap' })}
        subtitle={m.osm_basemap_description()}
        hideCloseButton={true}
        lowContrast
      />
    {:else}
      <Button kind="primary" on:click={onSelectOSM}>
        {m.osm_modal_button_add()}
      </Button>
    {/if}

    <p class="osm-note">
      {m.osm_customization_note()}
      <button type="button" class="link-text" onclick={onGoToVisualize}
        >{m.step_visualize()}</button
      >.
    </p>

    <div class="footer-link">
      <Button
        kind="ghost"
        icon={Launch}
        iconDescription={m.learn_more()}
        href="https://www.sciencespo.fr/cartographie/khartis/docs/data"
        target="_blank"
        size="small"
      >
        {m.osm_learn_more()}
      </Button>
    </div>
  </ExpandableSection>
</div>

<style>
  .tab-content {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  /* Basemap grid styles */
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

  .grid-footer {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    padding-top: var(--cds-spacing-04);
    margin-top: var(--cds-spacing-04);
    border-top: 1px solid var(--cds-border-subtle);
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

  .footer-link {
    padding-top: var(--cds-spacing-04);
  }

  .footer-link :global(.bx--btn--ghost) {
    color: var(--cds-text-helper, #6f6f6f);
    font-size: 0.75rem;
  }

  .footer-link :global(.bx--btn--ghost:hover) {
    color: var(--cds-text-02, #525252);
  }

  .footer-link :global(.bx--btn--ghost svg) {
    fill: var(--cds-text-helper, #6f6f6f);
  }

  /* Import section styles */
  .kh-help {
    color: var(--cds-text-02);
    font-size: 0.8125rem;
    line-height: 1.25rem;
    margin: 0 0 var(--cds-spacing-04) 0;
  }

  .dropzone {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    padding: var(--cds-spacing-05);
    border: 2px dashed var(--cds-border-subtle);
    border-radius: var(--cds-spacing-02);
    background-color: var(--cds-ui-01);
    cursor: pointer;
    transition: all 0.2s ease-out;
  }

  .dropzone:hover,
  .dropzone-active {
    border-color: var(--cds-interactive-01);
    background-color: var(--cds-highlight);
  }

  .dropzone-text {
    font-size: 0.875rem;
    color: var(--cds-text-02);
    text-align: center;
  }

  .url-import-section {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-03);
    margin-top: var(--cds-spacing-04);
  }

  .section-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--cds-text-02);
  }

  .url-import-row {
    display: flex;
    gap: var(--cds-spacing-03);
    align-items: flex-end;
  }

  .url-import-row :global(.bx--text-input-wrapper) {
    flex: 1;
  }

  .imported-file {
    background-color: var(--cds-ui-01);
    padding: var(--cds-spacing-04);
    border-radius: var(--cds-spacing-02);
    border: 1px solid var(--cds-border-subtle);
    margin-top: var(--cds-spacing-04);
  }

  .file-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--cds-text-02);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .file-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--cds-spacing-02);
  }

  .file-name {
    font-weight: 500;
    color: var(--cds-text-01);
  }

  :global(.icon-success) {
    color: var(--cds-support-success);
  }

  /* OSM section styles */
  .osm-note {
    color: var(--cds-text-02);
    font-size: 0.875rem;
    line-height: 1.375rem;
    margin: 0;
  }

  .link-text {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--cds-text-01);
    text-decoration: underline;
    cursor: pointer;
  }

  .link-text:hover {
    color: var(--cds-link-primary-hover);
  }
</style>
