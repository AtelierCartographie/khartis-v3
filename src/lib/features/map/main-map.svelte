<script lang="ts">
  import placeholderGlobe from '$lib/features/commons/assets/images/commons/placeholder-globe.png';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import { onMount } from 'svelte';
  import { dataOrchestrator } from '../commons/services/data-orchestrator.service.svelte';
  import { Duck } from '../commons/services/duckdb/duckdb';
  import { globalActions, globalState } from '../commons/store/global.svelte';
  import { ZoomMode } from '../commons/types/global';
  import DeckMap from './components/deck-map.svelte';
  import { readGeoParquet } from './utils/geoparquet';

  interface LoadedFile {
    tablename: string;
    filename: string;
  }

  interface UIState {
    selectedDataset: string | null;
    isLoading: boolean;
    jsTable: ArrowTable | null;
    hasGeometry: boolean;
  }

  let datasetsList = $state<LoadedFile[]>([]);
  let uiState = $state<UIState>({
    selectedDataset: null,
    isLoading: true,
    jsTable: null,
    hasGeometry: false
  });

  const transformStyle = $derived(
    globalState.zoom.mode === ZoomMode.Map && !uiState.hasGeometry
      ? `transform: scale(${globalState.zoom.mapZoomLevel}); transform-origin: center center;`
      : ''
  );

  async function geofileToGeoarrowMemory(
    tablename: string
  ): Promise<ArrowTable> {
    const buffer = await Duck!.copy_to_geoparquet_as_buffer(tablename);
    const jsTable = await readGeoParquet(buffer.buffer as ArrayBuffer);
    return jsTable;
  }

  async function handleDatasetChange(event: Event): Promise<void> {
    const target = event.target as HTMLSelectElement;
    uiState.selectedDataset = target.value;
    uiState.jsTable = await geofileToGeoarrowMemory(uiState.selectedDataset);
  }

  function handleDoubleClick(): void {
    if (globalState.zoom.mode === ZoomMode.Map && !uiState.hasGeometry) {
      globalActions.resetZoom();
    }
  }

  function handleWheel(event: WheelEvent): void {
    if (globalState.zoom.mode !== ZoomMode.Map || uiState.hasGeometry) return;

    event.preventDefault();

    if (event.deltaY < 0) {
      globalActions.zoomIn();
    } else {
      globalActions.zoomOut();
    }
  }

  let initialLoadDone = $state(false);

  async function loadGeometryDatasets(): Promise<void> {
    if (!Duck) return;

    try {
      uiState.isLoading = true;
      const newDatasetsList = await Duck.filter_datasets_with_geometry();
      datasetsList = newDatasetsList;

      if (datasetsList.length > 0) {
        const currentSelectedExists = datasetsList.some(
          (d) => d.tablename === uiState.selectedDataset
        );

        if (!currentSelectedExists) {
          uiState.selectedDataset = datasetsList[0].tablename;
        }

        uiState.jsTable = await geofileToGeoarrowMemory(
          uiState.selectedDataset!
        );
        uiState.hasGeometry = true;
      } else {
        uiState.selectedDataset = null;
        uiState.jsTable = null;
        uiState.hasGeometry = false;
      }
    } catch (error) {
      uiState.selectedDataset = null;
      uiState.jsTable = null;
      uiState.hasGeometry = false;
    } finally {
      uiState.isLoading = false;
    }
  }

  $effect(() => {
    if (initialLoadDone) {
      const version = dataOrchestrator.geometryDatasetsVersion;
      loadGeometryDatasets();
    }
  });

  onMount(async () => {
    await loadGeometryDatasets();
    initialLoadDone = true;
  });
</script>

{#if uiState.isLoading}
  <div class="loading-state">Loading geographic data...</div>
{:else if uiState.hasGeometry && datasetsList.length > 0}
  <div class="spatial-container">
    {#if datasetsList.length > 1}
      <div class="dataset-selector">
        <label for="dataset-select">Choose a basemap:</label>
        <select
          id="dataset-select"
          onchange={handleDatasetChange}
          bind:value={uiState.selectedDataset}
        >
          {#each datasetsList as { tablename, filename }}
            <option value={tablename}>{filename}</option>
          {/each}
        </select>
      </div>
    {/if}
    {#if uiState.jsTable}
      <DeckMap jsTable={uiState.jsTable} />
    {/if}
  </div>
{:else}
  <div class="map-container">
    <img
      class="placeholder-globe"
      src={placeholderGlobe}
      alt="placeholder map"
      style={transformStyle}
      ondblclick={handleDoubleClick}
      onwheel={handleWheel}
    />
  </div>
{/if}

<style>
  .map-container {
    width: 100%;
    height: 100%;
    max-height: 80vh;
    max-width: 80vw;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .placeholder-globe {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: transform 0.2s ease-in-out;
    cursor: grab;
  }

  .placeholder-globe:active {
    cursor: grabbing;
  }

  .spatial-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .dataset-selector {
    padding: 1rem;
    background: var(--cds-layer);
    border-bottom: 1px solid var(--cds-border-subtle);
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .dataset-selector label {
    font-weight: 500;
  }

  .dataset-selector select {
    padding: 0.5rem;
    border: 1px solid var(--cds-border-subtle);
    border-radius: 4px;
    background: var(--cds-field);
    color: var(--cds-text-primary);
  }

  .loading-state {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--cds-text-secondary);
  }
</style>
