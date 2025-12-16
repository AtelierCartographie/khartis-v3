<script lang="ts">
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onMount } from 'svelte';
  import { basemapStyleStore } from '../../commons/store/basemap-style.store.svelte';
  import { globalState } from '../../commons/store/global.svelte';
  import {
    useMapBasemap,
    useMapBounds,
    useMapInit,
    useMapLayers,
    useMapPosition,
    useMapState,
    useMapZoom
  } from '../hooks';
  import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
  import type { DeckMapProps } from '../types';

  let { jsTable, userGeoJSON, onReady }: DeckMapProps = $props();

  let mapContainer: HTMLDivElement;
  let worldBaseTable = $state<ArrowTable | null>(null);
  let baseZoomLevel = $state(1.5);

  // Hook: Map state (visualizations, colors, statistics)
  const mapState = useMapState();

  // Hook: Map initialization (MapLibre + Deck.gl)
  const mapInit = useMapInit({
    onMapLoaded: () => {
      if (jsTable || userGeoJSON) {
        mapLayers.updateLayers(jsTable, userGeoJSON);
      } else if (mapBounds.shouldRestorePosition) {
        setTimeout(() => mapPosition.restorePosition(), 100);
      }
    },
    onWorldBaseLoaded: (table) => {
      worldBaseTable = table;
      mapLayers.updateLayers(jsTable, userGeoJSON);
    },
    onZoom: () => mapZoom.handleMapZoom(),
    onMoveEnd: () => mapPosition.savePosition(),
    onReady: () => onReady?.()
  });

  // Hook: Map position (localStorage persistence)
  const mapPosition = useMapPosition({
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    onPositionRestored: (position) => {
      baseZoomLevel = position.zoom;
    }
  });

  // Hook: Map zoom (global state sync)
  const mapZoom = useMapZoom({
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    getBaseZoomLevel: () => baseZoomLevel,
    setBaseZoomLevel: (zoom) => { baseZoomLevel = zoom; }
  });

  // Hook: Map layers (Deck.gl layer management)
  const mapLayers = useMapLayers({
    getDeckOverlay: () => mapInit.deckOverlay,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    getWorldBaseTable: () => worldBaseTable,
    getDatasetId: () => mapState.datasetId,
    buildLayerContext: () => mapState.buildLayerContext()
  });

  // Hook: Map basemap (style + OSM raster)
  const mapBasemap = useMapBasemap({
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded
  });

  // Hook: Map bounds (fitBounds for Arrow/GeoJSON)
  const mapBounds = useMapBounds({
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    getDatasetId: () => mapState.datasetId,
    onBoundsUpdated: (zoom) => { baseZoomLevel = zoom; },
    savePosition: () => mapPosition.savePosition()
  });

  // Effect: Update layers when data changes
  $effect(() => {
    void worldBaseTable;
    void osmBasemapStore.activeOSMBasemap;
    if (mapInit.isMapLoaded && mapInit.deckOverlay) {
      mapLayers.updateLayers(jsTable, userGeoJSON);
    }
  });

  // Effect: Fit to Arrow table bounds
  $effect(() => {
    if (jsTable && mapInit.isMapLoaded && mapInit.map) {
      mapBounds.fitToArrowBounds(jsTable);
    }
  });

  // Effect: Fit to GeoJSON bounds
  $effect(() => {
    if (userGeoJSON && mapInit.isMapLoaded && mapInit.map) {
      mapBounds.fitToGeoJSONBounds(userGeoJSON);
    }
  });

  // Effect: Sync zoom from global state
  $effect(() => {
    void globalState.zoom.mapZoomLevel;
    mapZoom.syncZoomToMap();
  });

  // Effect: Sync basemap style
  $effect(() => {
    void basemapStyleStore.selectedStyleUrl;
    mapBasemap.syncBasemapStyle();
  });

  // Effect: OSM raster layer management
  $effect(() => {
    void osmBasemapStore.activeOSMBasemap;
    void osmBasemapStore.tileConfig;
    if (mapInit.isMapLoaded && mapInit.map) {
      mapBasemap.syncOSMRasterLayer();
    }
  });

  onMount(() => {
    mapInit.initialize(mapContainer);
    return () => mapInit.destroy();
  });
</script>

<div class="map-wrapper">
  <div bind:this={mapContainer} class="map-container"></div>
</div>

<style>
  .map-wrapper {
    position: relative;
    width: 100%;
    height: 700px;
    background-color: var(--cds-ui-background);
  }

  .map-container {
    position: relative;
    width: 100%;
    height: 700px;
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
