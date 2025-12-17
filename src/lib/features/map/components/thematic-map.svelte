<script lang="ts">
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onMount } from 'svelte';
  import { basemapStyleStore } from '../../commons/store/basemap-style.store.svelte';
  import { globalState } from '../../commons/store/global.svelte';
  import { mapInstanceStore } from '../../commons/store/map-instance.store.svelte';
  import {
    useMapBasemap,
    useMapBounds,
    useMapInit,
    useMapLayers,
    useMapPosition,
    useMapState
  } from '../hooks';
  import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
  import type { DeckMapProps } from '../types';

  let { jsTable, userGeoJSON, datasetId, onReady }: DeckMapProps = $props();

  const MIN_SKELETON_DURATION_MS = 500;
  const MAX_WAIT_FOR_DATA_MS = 5000;

  let mapContainer: HTMLDivElement;
  let worldBaseTable = $state<ArrowTable | null>(null);
  let hasCalledOnReady = $state(false);
  let initStartTime = $state<number>(Date.now());
  let maxWaitTimeoutId: ReturnType<typeof setTimeout> | null = null;

  function triggerOnReady() {
    if (hasCalledOnReady) return;

    if (maxWaitTimeoutId) {
      clearTimeout(maxWaitTimeoutId);
      maxWaitTimeoutId = null;
    }

    const elapsed = Date.now() - initStartTime;
    const remainingDelay = Math.max(0, MIN_SKELETON_DURATION_MS - elapsed);

    if (remainingDelay > 0) {
      setTimeout(() => {
        if (!hasCalledOnReady) {
          hasCalledOnReady = true;
          onReady?.();
        }
      }, remainingDelay);
    } else {
      hasCalledOnReady = true;
      onReady?.();
    }
  }

  function startMaxWaitTimeout() {
    if (maxWaitTimeoutId) return;
    maxWaitTimeoutId = setTimeout(() => {
      triggerOnReady();
    }, MAX_WAIT_FOR_DATA_MS);
  }

  const mapState = useMapState();

  const mapInit = useMapInit({
    onMapLoaded: () => {
      if (jsTable || userGeoJSON) {
        mapLayers.updateLayers(jsTable, userGeoJSON);
      } else {
        startMaxWaitTimeout();
        if (mapBounds.shouldRestorePosition) {
          setTimeout(() => mapPosition.restorePosition(), 100);
        }
      }
    },
    onWorldBaseLoaded: (table) => {
      worldBaseTable = table;
      mapLayers.updateLayers(jsTable, userGeoJSON);
    },
    onZoom: () => mapInstanceStore.updateZoomFromMap(),
    onMoveEnd: () => mapPosition.savePosition()
  });

  const mapPosition = useMapPosition({
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    onPositionRestored: (position) => {
      mapInstanceStore.setBaseZoomLevel(position.zoom);
    }
  });

  const mapLayers = useMapLayers({
    getDeckOverlay: () => mapInit.deckOverlay,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    getWorldBaseTable: () => worldBaseTable,
    getDatasetId: () => mapState.datasetId,
    buildLayerContext: () => mapState.buildLayerContext()
  });

  const mapBasemap = useMapBasemap({
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded
  });

  const mapBounds = useMapBounds({
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    getDatasetId: () => mapState.datasetId,
    onBoundsUpdated: (zoom) => {
      mapInstanceStore.setBaseZoomLevel(zoom);
    },
    savePosition: () => mapPosition.savePosition(),
    onFitComplete: () => triggerOnReady()
  });

  $effect(() => {
    void worldBaseTable;
    void osmBasemapStore.activeOSMBasemap;
    void osmBasemapStore.tileConfig;

    if (mapInit.isMapLoaded && mapInit.deckOverlay) {
      mapLayers.updateLayers(jsTable, userGeoJSON);
    }
    if (mapInit.isMapLoaded && mapInit.map) {
      mapBasemap.syncOSMRasterLayer();
    }
  });

  $effect(() => {
    if (jsTable && mapInit.isMapLoaded && mapInit.map) {
      mapBounds.fitToArrowBounds(jsTable, datasetId);
    }
  });

  $effect(() => {
    if (userGeoJSON && mapInit.isMapLoaded && mapInit.map) {
      mapBounds.fitToGeoJSONBounds(userGeoJSON);
    }
  });

  $effect(() => {
    const pageZoom = globalState.zoom.pageZoomLevel;
    if (pageZoom && mapInit.isMapLoaded && mapInit.map) {
      setTimeout(() => mapInit.map?.resize(), 50);
    }
  });

  $effect(() => {
    void basemapStyleStore.selectedStyleUrl;
    mapBasemap.syncBasemapStyle();
  });

  onMount(() => {
    mapInit.initialize(mapContainer);
    return () => {
      mapInit.destroy();
      if (maxWaitTimeoutId) {
        clearTimeout(maxWaitTimeoutId);
      }
    };
  });
</script>

<div class="map-wrapper">
  <div bind:this={mapContainer} class="map-container"></div>
</div>

<style>
  .map-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 400px;
    background-color: var(--cds-ui-background);
  }

  .map-container {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    background-color: var(--cds-ui-background);
  }

  :global(.maplibregl-ctrl-attrib) {
    display: none;
  }

  :global(.deck-tooltip) {
    z-index: 10000 !important;
    pointer-events: none !important;
  }
</style>
