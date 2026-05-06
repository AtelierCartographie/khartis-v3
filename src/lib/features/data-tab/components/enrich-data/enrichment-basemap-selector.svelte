<script lang="ts">
  import { BasemapSource } from '$lib/features/commons/constants/ui.constants';
  import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
  import BasemapCatalogTab from '../basemap-join/basemap-catalog-tab.svelte';
  import BasemapPanelContent from '../basemap-join/basemap-panel-content.svelte';
  import { BasemapImportDropzone, OSMBasemapSelector } from '../index';
  import { ACCEPTED_BASEMAP_EXTENSIONS } from '../../utils/enrichment.utils';

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
    suggestionsOpen?: boolean;
    catalogOpen?: boolean;
    onSuggestionsToggle?: (expanded: boolean) => void;
    onCatalogToggle?: (expanded: boolean) => void;
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
    onSelectOSM,
    suggestionsOpen,
    catalogOpen,
    onSuggestionsToggle,
    onCatalogToggle
  }: Props = $props();

  const TAB_INDEX_TO_SOURCE: readonly BasemapSource[] = [
    BasemapSource.CATALOG,
    BasemapSource.IMPORT,
    BasemapSource.OSM
  ];

  const selectedSource = $derived(
    TAB_INDEX_TO_SOURCE[basemapTabIndex] ?? BasemapSource.CATALOG
  );

  function handleSourceChange(source: BasemapSource): void {
    const nextIndex = TAB_INDEX_TO_SOURCE.indexOf(source);
    if (nextIndex < 0 || nextIndex === basemapTabIndex) return;
    onTabChange(nextIndex);
  }
</script>

{#snippet catalogContent()}
  <BasemapCatalogTab
    suggestedBasemaps={suggestedBasemaps}
    allBasemaps={basemaps}
    basemapSelected={selectedBasemapId ?? ''}
    onSelectBasemap={(basemap) => onSelectBasemap(basemap.file)}
    suggestionsOpen={suggestionsOpen}
    catalogOpen={catalogOpen}
    onSuggestionsToggle={onSuggestionsToggle}
    onCatalogToggle={onCatalogToggle}
  />
{/snippet}

{#snippet importContent()}
  <BasemapImportDropzone
    acceptedExtensions={ACCEPTED_BASEMAP_EXTENSIONS}
    isUploading={basemapImportUploading}
    error={basemapImportError}
    importedBasemap={importedCustomBasemap}
    onFileSelect={onBasemapImportFile}
    onUrlLoad={onBasemapUrlLoad}
    onClearError={onClearError}
  />
{/snippet}

{#snippet osmContent()}
  <OSMBasemapSelector
    isActive={Boolean(selectedBasemapId?.startsWith('osm_'))}
    hasGPSCoordinates={true}
    onSelectOSM={onSelectOSM}
  />
{/snippet}

<BasemapPanelContent
  selectedSource={selectedSource}
  onSourceChange={handleSourceChange}
  catalogContent={catalogContent}
  importContent={importContent}
  osmContent={osmContent}
  showJoinSection={false}
/>
