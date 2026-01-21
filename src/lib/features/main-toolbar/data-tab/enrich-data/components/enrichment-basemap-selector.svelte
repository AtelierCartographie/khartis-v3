<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import {
    Catalog,
    ChevronDown,
    ChevronUp,
    Globe,
    Renew,
    Upload
  } from 'carbon-icons-svelte';
  import { BasemapImportDropzone, OSMSelector } from '../../components';
  import BasemapCardVertical from '../../components/basemap-card-vertical.svelte';
  import { ACCEPTED_BASEMAP_EXTENSIONS } from '../utils/enrichment.utils';

  interface Props {
    basemapTabIndex: number;
    selectedBasemapId: string | undefined;
    basemaps: BasemapMetadata[];
    basemapImportUploading: boolean;
    basemapImportError: string | null;
    importedCustomBasemap: BasemapMetadata | null;
    onTabChange: (index: number) => void;
    onSelectBasemap: (basemapId: string) => void;
    onBasemapImportFile: (file: File) => void;
    onBasemapUrlLoad: (url: string) => void;
    onClearError: () => void;
    onSelectOSM: () => void;
  }

  let {
    basemapTabIndex,
    selectedBasemapId,
    basemaps,
    basemapImportUploading,
    basemapImportError,
    importedCustomBasemap,
    onTabChange,
    onSelectBasemap,
    onBasemapImportFile,
    onBasemapUrlLoad,
    onClearError,
    onSelectOSM
  }: Props = $props();

  let suggestionsExpanded = $state(true);

  const basemapTabItems = [
    { icon: Catalog, label: m.basemap_catalog(), iconSize: 20 },
    { icon: Upload, label: m.basemap_import(), iconSize: 20 },
    { icon: Globe, label: m.basemap_osm(), iconSize: 20 }
  ];
</script>

<div class="basemap-selector">
  <ToggleTabs
    activeIndex={basemapTabIndex}
    items={basemapTabItems}
    onChange={onTabChange}
    className="basemap-tabs"
  />

  {#if basemapTabIndex === 0}
    <div class="basemap-section">
      <div class="expandable-section">
        <button
          class="expandable-header"
          onclick={() => (suggestionsExpanded = !suggestionsExpanded)}
        >
          <Renew size={16} />
          <span class="expandable-title">{m.basemap_suggestions()}</span>
          {#if suggestionsExpanded}
            <ChevronUp size={16} />
          {:else}
            <ChevronDown size={16} />
          {/if}
        </button>
        {#if suggestionsExpanded}
          <div class="expandable-content">
            <p class="suggestions-help">{m.basemap_suggestions_desc()}</p>
            <div class="basemap-grid">
              {#each basemaps.slice(0, 3) as basemap (basemap.file)}
                <BasemapCardVertical
                  basemap={basemap}
                  selected={selectedBasemapId === basemap.file}
                  onclick={() => onSelectBasemap(basemap.file)}
                />
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {:else if basemapTabIndex === 1}
    <div class="basemap-section">
      <BasemapImportDropzone
        acceptedExtensions={ACCEPTED_BASEMAP_EXTENSIONS}
        isUploading={basemapImportUploading}
        error={basemapImportError}
        importedBasemap={importedCustomBasemap}
        onFileSelect={onBasemapImportFile}
        onUrlLoad={onBasemapUrlLoad}
        onClearError={onClearError}
      />
    </div>
  {:else}
    <div class="basemap-section">
      <OSMSelector
        isActive={osmBasemapStore.isActive}
        onSelectOSM={onSelectOSM}
      />
    </div>
  {/if}
</div>

<style>
  .basemap-selector {
    display: flex;
    flex-direction: column;
    gap: var(--cds-spacing-04);
  }

  .basemap-section {
    margin-top: var(--cds-spacing-04);
  }

  .suggestions-help {
    font-size: 0.8125rem;
    color: var(--cds-link-primary);
    margin-bottom: var(--cds-spacing-04);
  }

  .basemap-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--cds-spacing-04);
  }

  :global(.basemap-tabs) {
    width: 100%;
    max-width: none;
  }

  .expandable-section {
    border: 1px solid var(--cds-border-subtle);
    border-radius: var(--cds-spacing-02);
    overflow: hidden;
  }

  .expandable-header {
    display: flex;
    align-items: center;
    gap: var(--cds-spacing-03);
    width: 100%;
    padding: var(--cds-spacing-03) var(--cds-spacing-04);
    background-color: var(--cds-layer-02);
    border: none;
    cursor: pointer;
    color: var(--cds-text-01);
  }

  .expandable-header:hover {
    background-color: var(--cds-layer-hover-02);
  }

  .expandable-title {
    flex: 1;
    text-align: left;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .expandable-content {
    padding: var(--cds-spacing-04);
    background-color: var(--cds-layer-01);
  }
</style>
