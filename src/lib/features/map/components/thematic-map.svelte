<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import { SkeletonPlaceholder } from 'carbon-components-svelte';
  import { onMount, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { basemapStyleStore } from '../../commons/store/basemap-style.store.svelte';
  import { globalState } from '../../commons/store/global.svelte';
  import { LogCategory, logger } from '../../commons/utils/logger';
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
  import { mapHighlightStore } from '../stores/map-highlight.store.svelte';
  import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
  import { projectionStore } from '../stores/projection.store.svelte';
  import { mapProjectionStore } from '../stores/map-projection.store.svelte';
  import { mapLoadingStore } from '../stores/map-loading.store.svelte';
  import type { DeckMapProps } from '../types';
  import { getSimplificationState } from '../../step-toolbar/tools/simplification/simplification.store.svelte';
  import AnnotationOverlay from './annotation-overlay.svelte';
  import GeoIndicationsOverlay from './geo-indications-overlay.svelte';
  import LegendOverlay from './legend-overlay.svelte';

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
  const LAYER_UPDATE_DEBOUNCE_MS = 16;

  let scheduleCount = 0;
  let effectTriggerLog: string[] = [];

  function logEffect(name: string): void {
    effectTriggerLog.push(`${performance.now().toFixed(0)}ms: ${name}`);
    if (effectTriggerLog.length > 50) {
      effectTriggerLog.shift();
    }
  }

  function scheduleLayerUpdate(source?: string): void {
    scheduleCount++;
    const _now = performance.now();
    logger.debug(
      `scheduleLayerUpdate #${scheduleCount} from: ${source || 'unknown'}`,
      LogCategory.MAP,
      {
        isSwitchingViewMode,
        isStyleLoading: mapBasemap.isStyleLoading,
        pendingLayerUpdate,
        tablesSize: tables.size,
        geoJSONsSize: geoJSONs.size
      }
    );

    if (isSwitchingViewMode || mapBasemap.isStyleLoading) {
      logger.debug(`Deferred (pending=true) from: ${source}`, LogCategory.MAP);
      pendingLayerUpdate = true;
      return;
    }
    if (layerUpdateTimeoutId) {
      logger.debug(
        `Debounced (clearing timeout) from: ${source}`,
        LogCategory.MAP
      );
      clearTimeout(layerUpdateTimeoutId);
    }
    layerUpdateTimeoutId = setTimeout(() => {
      layerUpdateTimeoutId = null;
      if (
        mapInit.isMapLoaded &&
        !isSwitchingViewMode &&
        !mapBasemap.isStyleLoading
      ) {
        logger.debug(`Executing updateLayers from: ${source}`, LogCategory.MAP);
        mapLoadingStore.setUpdatingLayers(true);
        const start = performance.now();
        mapLayers.updateLayers(tables, geoJSONs);
        logger.debug(
          `updateLayers took ${(performance.now() - start).toFixed(1)}ms`,
          LogCategory.MAP
        );
        requestAnimationFrame(() => {
          mapLoadingStore.setUpdatingLayers(false);
        });
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
      // Note: isStyleLoading check is handled inside scheduleLayerUpdate()
      if (!isSwitchingViewMode) {
        scheduleLayerUpdate('onProjectionChanged');
      }
    },
    onStyleLoaded: () => {
      logger.debug('onStyleLoaded callback fired', LogCategory.MAP);
      mapBasemap.syncOSMRasterLayer();
      if (pendingLayerUpdate) {
        pendingLayerUpdate = false;
        scheduleLayerUpdate('onStyleLoaded-pending');
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
    logEffect('osmBasemapStore.tileConfig');

    const hasDeckContext = mapInit.deckOverlay || mapInit.deckInstance;
    // Note: isStyleLoading check is handled inside scheduleLayerUpdate() to avoid reactive dependency
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;

    if (hasDeckContext && canUpdate) {
      untrack(() => scheduleLayerUpdate('effect:tileConfig'));
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
        mapBasemap.cleanup();
        mapInit.switchToMapLibreMode();
      } else if (!shouldUseMapLibre && mapInit.viewMode === 'maplibre') {
        isSwitchingViewMode = true;
        mapBasemap.cleanup();
        mapInit.switchToOrthographicMode();
      }
    });
  });

  $effect(() => {
    if (mapInit.isMapLoaded && isSwitchingViewMode) {
      logger.debug('View mode switch completed', LogCategory.MAP);
      isSwitchingViewMode = false;
      if (pendingLayerUpdate) {
        pendingLayerUpdate = false;
        scheduleLayerUpdate('effect:viewModeSwitchComplete');
      }
    }
  });

  $effect(() => {
    const simplificationState = getSimplificationState();
    const lastApplied = simplificationState.lastApplied;

    if (lastApplied) {
      logEffect('simplification:lastApplied');
      logger.debug(
        'Simplification applied, reloading basemap',
        LogCategory.MAP
      );

      untrack(async () => {
        const loaded = await basemapService.loadDefaultBasemap();
        if (loaded) {
          // Use simplified version if active
          if (loaded.activeSimplificationLevel) {
            const simplifiedTable = basemapService.getSimplifiedBasemapTable(
              loaded.metadata.file,
              loaded.activeSimplificationLevel
            );
            worldBaseTable = simplifiedTable ?? loaded.geometryTable;
          } else {
            worldBaseTable = loaded.geometryTable;
          }

          const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
          if (canUpdate) {
            scheduleLayerUpdate('effect:simplificationApplied');
          }
        }
      });
    }
  });

  $effect(() => {
    // Note: isStyleLoading check is handled inside scheduleLayerUpdate() to avoid reactive dependency
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (firstTable && canUpdate) {
      logEffect('firstTable');
      if (mapInit.viewMode === 'orthographic') {
        const bounds = calculateBoundsFromGeoArrow(firstTable);
        if (bounds) {
          const [[minX, minY], [maxX, maxY]] = bounds as [
            [number, number],
            [number, number]
          ];
          untrack(() => {
            projectionStore.setReferenceBbox([minX, minY, maxX, maxY]);
            scheduleLayerUpdate('effect:firstTable-bounds');
          });
          triggerOnReady();
        } else {
          const geoMetadata = firstTable.schema.metadata?.get('geo');
          if (geoMetadata) {
            untrack(() => {
              projectionStore.setReferenceBboxFromMetadata(geoMetadata);
              scheduleLayerUpdate('effect:firstTable-metadata');
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
    // Note: isStyleLoading check is handled inside scheduleLayerUpdate() to avoid reactive dependency
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (firstGeoJSON && canUpdate) {
      logEffect('firstGeoJSON');
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
            scheduleLayerUpdate('effect:firstGeoJSON');
          }
        });
        triggerOnReady();
      } else {
        triggerOnReady();
      }
    }
  });

  $effect(() => {
    // Note: isStyleLoading check is handled inside scheduleLayerUpdate() to avoid reactive dependency
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (!hasData && canUpdate) {
      logEffect('noData');
      untrack(() => scheduleLayerUpdate('effect:noData'));
    }
  });

  $effect(() => {
    // Note: isStyleLoading check is handled inside scheduleLayerUpdate() to avoid reactive dependency
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (worldBaseTable && canUpdate) {
      logEffect('worldBaseTable');
      untrack(() => scheduleLayerUpdate('effect:worldBaseTable'));
    }
  });

  $effect(() => {
    const pageZoom = globalState.zoom.pageZoomLevel;
    // Note: isStyleLoading check is handled inside scheduleLayerUpdate() to avoid reactive dependency
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (pageZoom && canUpdate) {
      logEffect('pageZoom');
      setTimeout(() => {
        untrack(() => {
          if (mapInit.viewMode === 'maplibre') {
            mapInit.map?.resize();
          }
          updateCanvasSize();
          scheduleLayerUpdate('effect:pageZoom');
        });
      }, 50);
    }
  });

  $effect(() => {
    void basemapStyleStore.selectedStyleUrl;
    logEffect('basemapStyleStore.selectedStyleUrl');
    untrack(() => {
      if (isSwitchingViewMode) {
        logger.debug(
          'basemapStyleStore.selectedStyleUrl changed but switching view mode, skipping syncBasemapStyle',
          LogCategory.MAP
        );
        return;
      }
      logger.debug(
        'basemapStyleStore.selectedStyleUrl changed, calling syncBasemapStyle',
        LogCategory.MAP
      );
      mapBasemap.syncBasemapStyle();
    });
  });

  $effect(() => {
    void mapProjectionStore.projection;
    logEffect('mapProjectionStore.projection');
    untrack(() => mapBasemap.syncProjection());
  });

  // Consolidated layer update trigger - combines visualization, basemap layers, and data changes
  const layerUpdateTrigger = $derived({
    vizVersion: visualizationStore.version,
    basemapVersion: basemapLayersStore.version,
    highlightVersion: mapHighlightStore.version,
    dataSize: `${tables.size}-${geoJSONs.size}`
  });

  $effect(() => {
    void layerUpdateTrigger;
    logEffect('layerUpdateTrigger');

    // Note: isStyleLoading check is handled inside scheduleLayerUpdate() to avoid reactive dependency
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (canUpdate) {
      untrack(() => scheduleLayerUpdate('effect:layerUpdateTrigger'));
    }
  });

  async function loadWorldBasemap(): Promise<void> {
    logger.debug('loadWorldBasemap started', LogCategory.MAP);
    const start = performance.now();
    const loaded = await basemapService.loadDefaultBasemap();
    logger.debug(
      `loadWorldBasemap loaded in ${(performance.now() - start).toFixed(1)}ms`,
      LogCategory.MAP
    );
    if (loaded) {
      // Use simplified version if active, otherwise use original
      if (loaded.activeSimplificationLevel) {
        const simplifiedTable = basemapService.getSimplifiedBasemapTable(
          loaded.metadata.file,
          loaded.activeSimplificationLevel
        );
        worldBaseTable = simplifiedTable ?? loaded.geometryTable;
      } else {
        worldBaseTable = loaded.geometryTable;
      }
      // Note: isStyleLoading check is handled inside scheduleLayerUpdate()
      const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
      if (canUpdate) {
        scheduleLayerUpdate('loadWorldBasemap');
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
        // Note: isStyleLoading check is handled inside scheduleLayerUpdate()
        const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
        if (canUpdate) {
          if (mapInit.viewMode === 'maplibre') {
            mapInit.map?.resize();
          }
          scheduleLayerUpdate('resizeObserver');
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
  {#if mapLoadingStore.isUpdatingLayers}
    <div class="layer-update-indicator" transition:fade={{ duration: 150 }}>
      <div class="spinner"></div>
    </div>
  {/if}
  <GeoIndicationsOverlay />
  <LegendOverlay />
  <AnnotationOverlay />
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

  .layer-update-indicator {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 50;
    background: var(--cds-ui-01);
    border-radius: 50%;
    padding: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    pointer-events: none;
  }

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--cds-ui-03);
    border-top-color: var(--cds-interactive-01);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  :global(.maplibregl-ctrl-attrib) {
    display: none;
  }

  :global(.deck-tooltip) {
    z-index: 10000 !important;
    pointer-events: none !important;
  }
</style>
