<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import { SkeletonPlaceholder } from 'carbon-components-svelte';
  import { onMount, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { basemapStyleStore } from '../../commons/store/basemap-style.store.svelte';
  import { globalState } from '../../commons/store/global.svelte';
  import { mapInstanceStore } from '../../commons/store/map-instance.store.svelte';
  import { visualizationStore } from '../../commons/store/visualization.store.svelte';
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
  import { basemapService } from '../services/basemap.service.svelte';
  import { basemapLayersStore } from '../stores/basemap-layers.store.svelte';
  import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
  import { projectionStore } from '../stores/projection.store.svelte';
  import { mapProjectionStore } from '../stores/map-projection.store.svelte';
  import type { DeckMapProps } from '../types';
  import GeoIndicationsOverlay from './geo-indications-overlay.svelte';

  let { tables, geoJSONs, width, height, onReady }: DeckMapProps = $props();

  const hasData = $derived(tables.size > 0 || geoJSONs.size > 0);
  const firstTable = $derived(
    tables.size > 0 ? tables.values().next().value : null
  );
  const firstGeoJSON = $derived(
    geoJSONs.size > 0 ? geoJSONs.values().next().value : null
  );
  const firstDatasetId = $derived(
    tables.size > 0 ? tables.keys().next().value : undefined
  );

  const MIN_SKELETON_DURATION_MS = 500;
  const MAX_WAIT_FOR_DATA_MS = 5000;

  let mapContainer: HTMLDivElement;
  let hasCalledOnReady = $state(false);
  let initStartTime = $state<number>(Date.now());
  let maxWaitTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let worldBaseTable = $state<ArrowTable | null>(null);
  let resizeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let isSwitchingViewMode = $state(false);
  let pendingLayerUpdate = $state(false);
  let layerUpdateTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const RESIZE_DEBOUNCE_MS = 150;
  const LAYER_UPDATE_DEBOUNCE_MS = 50;

  let scheduleCount = 0;

  function scheduleLayerUpdate(): void {
    scheduleCount++;
    console.log(`[SCHEDULE] scheduleLayerUpdate called #${scheduleCount}`, {
      isSwitchingViewMode,
      isStyleLoading: mapBasemap.isStyleLoading,
      pendingLayerUpdate
    });
    console.trace('[SCHEDULE] Call stack for #' + scheduleCount);

    if (isSwitchingViewMode || mapBasemap.isStyleLoading) {
      console.log(`[SCHEDULE] Deferred - pendingLayerUpdate = true`);
      pendingLayerUpdate = true;
      return;
    }
    if (layerUpdateTimeoutId) {
      console.log(`[SCHEDULE] Debounced - clearing previous timeout`);
      clearTimeout(layerUpdateTimeoutId);
    }
    layerUpdateTimeoutId = setTimeout(() => {
      layerUpdateTimeoutId = null;
      if (mapInit.isMapLoaded && !isSwitchingViewMode && !mapBasemap.isStyleLoading) {
        console.log(`[SCHEDULE] Executing updateLayers from timeout`);
        mapLayers.updateLayers(tables, geoJSONs);
      }
    }, LAYER_UPDATE_DEBOUNCE_MS);
  }

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
      const shouldUseMapLibre =
        osmBasemapStore.isActive || basemapStyleStore.requiresMapLibre;

      if (shouldUseMapLibre && mapInit.viewMode === 'orthographic') {
        isSwitchingViewMode = true;
        mapInit.switchToMapLibreMode();
        return;
      }

      if (hasData) {
        scheduleLayerUpdate();
      } else {
        startMaxWaitTimeout();
        if (mapBounds.shouldRestorePosition) {
          setTimeout(() => mapPosition.restorePosition(), 100);
        }
      }
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
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    getWorldBaseTable: () => worldBaseTable,
    getActiveVisualizations: () => mapState.activeVisualizations,
    buildLayerContextForViz: (viz) => mapState.buildLayerContextForViz(viz)
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
    getIsMapLoaded: () => mapInit.isMapLoaded,
    onProjectionChanged: () => {
      if (!isSwitchingViewMode && !mapBasemap.isStyleLoading) {
        scheduleLayerUpdate();
      }
    },
    onStyleLoaded: () => {
      console.log('[CALLBACK] onStyleLoaded fired', { pendingLayerUpdate });
      mapBasemap.syncOSMRasterLayer();
      if (pendingLayerUpdate) {
        pendingLayerUpdate = false;
        scheduleLayerUpdate();
      }
    }
  });

  const mapBounds = useMapBounds({
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    getDatasetId: () => firstDatasetId,
    onBoundsUpdated: (zoom) => {
      mapInstanceStore.setBaseZoomLevel(zoom);
    },
    savePosition: () => mapPosition.savePosition(),
    onFitComplete: () => {
      triggerOnReady();
    }
  });

  $effect(() => {
    void osmBasemapStore.tileConfig;

    const hasDeckContext = mapInit.deckOverlay || mapInit.deckInstance;
    const canUpdate =
      mapInit.isMapLoaded && !isSwitchingViewMode && !mapBasemap.isStyleLoading;

    if (hasDeckContext && canUpdate) {
      untrack(() => scheduleLayerUpdate());
    }
    if (mapInit.map && canUpdate) {
      untrack(() => mapBasemap.syncOSMRasterLayer());
    }
  });

  $effect(() => {
    const osmActive = osmBasemapStore.isActive;
    const requiresMapLibre = basemapStyleStore.requiresMapLibre;

    untrack(() => {
      if (!mapInit.isMapLoaded) {
        return;
      }

      const shouldUseMapLibre = osmActive || requiresMapLibre;

      if (shouldUseMapLibre && mapInit.viewMode === 'orthographic') {
        isSwitchingViewMode = true;
        mapInit.switchToMapLibreMode();
      } else if (!shouldUseMapLibre && mapInit.viewMode === 'maplibre') {
        isSwitchingViewMode = true;
        mapInit.switchToOrthographicMode();
      }
    });
  });

  $effect(() => {
    if (mapInit.isMapLoaded && isSwitchingViewMode) {
      isSwitchingViewMode = false;
      if (pendingLayerUpdate) {
        pendingLayerUpdate = false;
        scheduleLayerUpdate();
      }
    }
  });

  $effect(() => {
    const canUpdate =
      mapInit.isMapLoaded && !isSwitchingViewMode && !mapBasemap.isStyleLoading;
    if (firstTable && canUpdate) {
      if (mapInit.viewMode === 'orthographic') {
        const bounds = calculateBoundsFromGeoArrow(firstTable);
        if (bounds) {
          const [[minX, minY], [maxX, maxY]] = bounds as [
            [number, number],
            [number, number]
          ];
          untrack(() => {
            projectionStore.setReferenceBbox([minX, minY, maxX, maxY]);
            scheduleLayerUpdate();
          });
          triggerOnReady();
        } else {
          const geoMetadata = firstTable.schema.metadata?.get('geo');
          if (geoMetadata) {
            untrack(() => {
              projectionStore.setReferenceBboxFromMetadata(geoMetadata);
              scheduleLayerUpdate();
            });
            triggerOnReady();
          }
        }
      } else if (mapInit.map) {
        untrack(() => mapBounds.fitToArrowBounds(firstTable, firstDatasetId));
      }
    }
  });

  $effect(() => {
    const canUpdate =
      mapInit.isMapLoaded && !isSwitchingViewMode && !mapBasemap.isStyleLoading;
    if (firstGeoJSON && canUpdate) {
      if (mapInit.viewMode === 'maplibre' && mapInit.map) {
        untrack(() => mapBounds.fitToGeoJSONBounds(firstGeoJSON));
      } else if (mapInit.viewMode === 'orthographic') {
        untrack(() => {
          const bounds = calculateBoundsFromGeoJSON(firstGeoJSON);
          if (bounds) {
            const [[minX, minY], [maxX, maxY]] = bounds as [
              [number, number],
              [number, number]
            ];
            projectionStore.setReferenceBbox([minX, minY, maxX, maxY]);
            scheduleLayerUpdate();
          }
        });
        triggerOnReady();
      } else {
        triggerOnReady();
      }
    }
  });

  $effect(() => {
    const canUpdate =
      mapInit.isMapLoaded && !isSwitchingViewMode && !mapBasemap.isStyleLoading;
    if (!hasData && canUpdate) {
      untrack(() => scheduleLayerUpdate());
    }
  });

  $effect(() => {
    const canUpdate =
      mapInit.isMapLoaded && !isSwitchingViewMode && !mapBasemap.isStyleLoading;
    if (worldBaseTable && canUpdate) {
      untrack(() => scheduleLayerUpdate());
    }
  });

  $effect(() => {
    const pageZoom = globalState.zoom.pageZoomLevel;
    const canUpdate =
      mapInit.isMapLoaded && !isSwitchingViewMode && !mapBasemap.isStyleLoading;
    if (pageZoom && canUpdate) {
      setTimeout(() => {
        untrack(() => {
          if (mapInit.viewMode === 'maplibre') {
            mapInit.map?.resize();
          }
          updateCanvasSize();
          scheduleLayerUpdate();
        });
      }, 50);
    }
  });

  $effect(() => {
    void basemapStyleStore.selectedStyleUrl;
    console.log('[EFFECT] basemapStyleStore.selectedStyleUrl changed');
    untrack(() => mapBasemap.syncBasemapStyle());
  });

  $effect(() => {
    void mapProjectionStore.projection;
    untrack(() => mapBasemap.syncProjection());
  });

  $effect(() => {
    void basemapLayersStore.layers;

    const canUpdate =
      mapInit.isMapLoaded && !isSwitchingViewMode && !mapBasemap.isStyleLoading;
    if (canUpdate) {
      untrack(() => scheduleLayerUpdate());
    }
  });

  const visualizationFingerprint = $derived(
    JSON.stringify(
      visualizationStore.activeVisualizations.map((v) => ({
        id: v.id,
        style: v.style,
        classification: v.classification
      }))
    )
  );

  $effect(() => {
    void visualizationFingerprint;

    const canUpdate =
      mapInit.isMapLoaded && !isSwitchingViewMode && !mapBasemap.isStyleLoading;
    if (canUpdate) {
      untrack(() => scheduleLayerUpdate());
    }
  });

  const dataFingerprint = $derived(`${tables.size}-${geoJSONs.size}`);

  $effect(() => {
    void dataFingerprint;

    const canUpdate =
      mapInit.isMapLoaded && !isSwitchingViewMode && !mapBasemap.isStyleLoading;
    if (canUpdate) {
      untrack(() => scheduleLayerUpdate());
    }
  });

  async function loadWorldBasemap(): Promise<void> {
    const loaded = await basemapService.loadDefaultBasemap();
    if (loaded) {
      worldBaseTable = loaded.geometryTable;
      const canUpdate =
        mapInit.isMapLoaded && !isSwitchingViewMode && !mapBasemap.isStyleLoading;
      if (canUpdate) {
        scheduleLayerUpdate();
      }
    }
  }

  onMount(() => {
    const initialViewMode = basemapStyleStore.requiresMapLibre
      ? 'maplibre'
      : 'orthographic';
    mapInit.initialize(mapContainer, initialViewMode);

    updateCanvasSize();
    loadWorldBasemap();

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();

      if (resizeTimeoutId) {
        clearTimeout(resizeTimeoutId);
      }

      resizeTimeoutId = setTimeout(() => {
        const canUpdate =
          mapInit.isMapLoaded && !isSwitchingViewMode && !mapBasemap.isStyleLoading;
        if (canUpdate) {
          if (mapInit.viewMode === 'maplibre') {
            mapInit.map?.resize();
          }
          scheduleLayerUpdate();
        }
        resizeTimeoutId = null;
      }, RESIZE_DEBOUNCE_MS);
    });
    resizeObserver.observe(mapContainer);

    return () => {
      resizeObserver.disconnect();
      mapInit.destroy();
      if (maxWaitTimeoutId) {
        clearTimeout(maxWaitTimeoutId);
      }
      if (resizeTimeoutId) {
        clearTimeout(resizeTimeoutId);
      }
      if (layerUpdateTimeoutId) {
        clearTimeout(layerUpdateTimeoutId);
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
  {#if isSwitchingViewMode}
    <div
      class="view-mode-loader"
      style="width: {width}px; height: {height}px;"
      transition:fade={{ duration: 200 }}
    >
      <SkeletonPlaceholder style="width: 100%; height: 100%;" />
    </div>
  {/if}
  <GeoIndicationsOverlay />
</div>

<style>
  .page-container {
    position: relative;
    flex-shrink: 0;
    background-color: var(--cds-ui-background);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .map-canvas {
    position: relative;
    overflow: hidden;
    background-color: #ffffff;
  }

  .map-canvas :global(canvas) {
    display: block;
  }

  .view-mode-loader {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 100;
    pointer-events: none;
  }

  .view-mode-loader :global(.bx--skeleton__placeholder) {
    width: 100%;
    height: 100%;
  }

  :global(.maplibregl-ctrl-attrib) {
    display: none;
  }

  :global(.deck-tooltip) {
    z-index: 10000 !important;
    pointer-events: none !important;
  }
</style>
