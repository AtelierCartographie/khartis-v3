<script lang="ts">
  import ToggleTabs from '$lib/features/commons/components/toggle-tabs.svelte';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import * as m from '$lib/paraglide/messages';
  import { Grid, List, Upload } from 'carbon-icons-svelte';
  import { BasemapImportDropzone, OSMSelector } from '../../components';
  import BasemapCatalogTab from '../../basemap-join-components/basemap-catalog-tab.svelte';
  import { ACCEPTED_BASEMAP_EXTENSIONS } from '../utils/enrichment.utils';

  interface BasemapSuggestionItem {
    basemap: BasemapMetadata;
    score: number;
  }

  interface Props {
    basemapTabIndex: number;
    selectedBasemapId: string | undefined;
    basemaps: BasemapMetadata[];
    suggestedBasemaps: BasemapSuggestionItem[];
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
    suggestedBasemaps,
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

  const basemapTabItems = [
    { icon: List, label: m.basemap_catalog(), iconSize: 16 },
    { icon: Upload, label: m.basemap_import(), iconSize: 16 },
    { icon: Grid, label: m.basemap_osm(), iconSize: 16 }
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
      <BasemapCatalogTab
        suggestedBasemaps={suggestedBasemaps}
        allBasemaps={basemaps}
        basemapSelected={selectedBasemapId ?? ''}
        onSelectBasemap={(basemap) => onSelectBasemap(basemap.file)}
      />
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
        isActive={Boolean(selectedBasemapId?.startsWith('osm_'))}
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

  :global(.basemap-tabs) {
    width: 100%;
    max-width: none;
  }

  :global(.basemap-tabs .toggle-tab) {
    height: 32px;
  }

  :global(.basemap-tabs .toggle-tab.active) {
    background-color: var(--cds-border-subtle-01);
  }
</style>
