<script lang="ts">
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { onMount, untrack } from 'svelte';
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
  import {
    calculateBoundsFromGeoArrow,
    calculateBoundsFromGeoJSON
  } from '../core';
  import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
  import { projectionStore } from '../stores/projection.store.svelte';
  import type { DeckMapProps } from '../types';

  let {
    jsTable,
    userGeoJSON,
    datasetId,
    width,
    height,
    onReady
  }: DeckMapProps = $props();

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

    const waitForRender = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!hasCalledOnReady) {
            hasCalledOnReady = true;
            onReady?.();
          }
        });
      });
    };

    if (remainingDelay > 0) {
      setTimeout(() => {
        if (!hasCalledOnReady) {
          waitForRender();
        }
      }, remainingDelay);
    } else {
      waitForRender();
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
      if (osmBasemapStore.isActive && mapInit.viewMode === 'orthographic') {
        mapInit.switchToMapLibreMode();
        return;
      }

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
    getDeckInstance: () => mapInit.deckInstance,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    getWorldBaseTable: () => worldBaseTable,
    getDatasetId: () => mapState.datasetId,
    buildLayerContext: () => mapState.buildLayerContext()
  });

  function updateCanvasSize() {
    const rect = mapContainer?.getBoundingClientRect();
    if (rect) {
      projectionStore.updateCanvasSize({
        width: rect.width || 800,
        height: rect.height || 600
      });
    }
  }

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
    onFitComplete: () => {
      triggerOnReady();
    }
  });

  $effect(() => {
    void worldBaseTable;
    void osmBasemapStore.tileConfig;

    const hasDeckContext = mapInit.deckOverlay || mapInit.deckInstance;
    if (mapInit.isMapLoaded && hasDeckContext) {
      untrack(() => mapLayers.updateLayers(jsTable, userGeoJSON));
    }
    if (mapInit.isMapLoaded && mapInit.map) {
      untrack(() => mapBasemap.syncOSMRasterLayer());
    }
  });

  $effect(() => {
    const osmActive = osmBasemapStore.isActive;

    untrack(() => {
      if (!mapInit.isMapLoaded) return;

      if (osmActive && mapInit.viewMode === 'orthographic') {
        mapInit.switchToMapLibreMode();
      } else if (!osmActive && mapInit.viewMode === 'maplibre') {
        mapInit.switchToOrthographicMode();
      }
    });
  });

  $effect(() => {
    if (jsTable && mapInit.isMapLoaded) {
      if (mapInit.viewMode === 'orthographic') {
        const bounds = calculateBoundsFromGeoArrow(jsTable);
        if (bounds) {
          const [[minX, minY], [maxX, maxY]] = bounds as [
            [number, number],
            [number, number]
          ];
          untrack(() => {
            projectionStore.setReferenceBbox([minX, minY, maxX, maxY]);
            mapLayers.updateLayers(jsTable, userGeoJSON);
          });
          triggerOnReady();
        } else {
          const geoMetadata = jsTable.schema.metadata?.get('geo');
          if (geoMetadata) {
            untrack(() => {
              projectionStore.setReferenceBboxFromMetadata(geoMetadata);
              mapLayers.updateLayers(jsTable, userGeoJSON);
            });
            triggerOnReady();
          }
        }
      } else if (mapInit.map) {
        untrack(() => mapBounds.fitToArrowBounds(jsTable, datasetId));
      }
    }
  });

  $effect(() => {
    if (userGeoJSON && mapInit.isMapLoaded) {
      if (mapInit.viewMode === 'maplibre' && mapInit.map) {
        untrack(() => mapBounds.fitToGeoJSONBounds(userGeoJSON));
      } else if (mapInit.viewMode === 'orthographic') {
        untrack(() => {
          const bounds = calculateBoundsFromGeoJSON(userGeoJSON);
          if (bounds) {
            const [[minX, minY], [maxX, maxY]] = bounds as [
              [number, number],
              [number, number]
            ];
            projectionStore.setReferenceBbox([minX, minY, maxX, maxY]);
            mapLayers.updateLayers(jsTable, userGeoJSON);
          }
        });
        triggerOnReady();
      } else {
        triggerOnReady();
      }
    }
  });

  $effect(() => {
    const pageZoom = globalState.zoom.pageZoomLevel;
    if (pageZoom && mapInit.isMapLoaded) {
      setTimeout(() => {
        untrack(() => {
          if (mapInit.viewMode === 'maplibre') {
            mapInit.map?.resize();
          }
          updateCanvasSize();
          mapLayers.updateLayers(jsTable, userGeoJSON);
        });
      }, 50);
    }
  });

  $effect(() => {
    void basemapStyleStore.selectedStyleUrl;
    untrack(() => mapBasemap.syncBasemapStyle());
  });

  onMount(() => {
    mapInit.initialize(mapContainer);

    updateCanvasSize();

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
      if (mapInit.isMapLoaded) {
        if (mapInit.viewMode === 'maplibre') {
          mapInit.map?.resize();
        }
        mapLayers.updateLayers(jsTable, userGeoJSON);
      }
    });
    resizeObserver.observe(mapContainer);

    return () => {
      resizeObserver.disconnect();
      mapInit.destroy();
      if (maxWaitTimeoutId) {
        clearTimeout(maxWaitTimeoutId);
      }
    };
  });
</script>

<div class="page-container">
  <div
    bind:this={mapContainer}
    class="map-canvas"
    style="width: {width}px; height: {height}px;"
  ></div>
</div>

<style>
  .page-container {
    position: relative;
    flex-shrink: 0;
    background-color: var(--cds-ui-background);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    padding: 16px;
  }

  .map-canvas {
    position: relative;
    overflow: hidden;
    background-color: #f0f0f0;
  }

  .map-canvas :global(canvas) {
    display: block;
  }

  :global(.maplibregl-ctrl-attrib) {
    display: none;
  }

  :global(.deck-tooltip) {
    z-index: 10000 !important;
    pointer-events: none !important;
  }
</style>
