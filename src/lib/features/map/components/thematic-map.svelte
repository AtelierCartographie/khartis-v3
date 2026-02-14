<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import { SkeletonPlaceholder } from 'carbon-components-svelte';
  import { onMount, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { basemapStyleStore } from '../../commons/store/basemap-style.store.svelte';
  import { hslToHex } from '../../commons/utils/color-utils';
  import { LogCategory, logger } from '../../commons/utils/logger';
  import { mapInstanceStore } from '../../commons/store/map-instance.store.svelte';
  import { datasetsStore } from '../../commons/store/datasets.store.svelte';
  import { projectStore } from '../../commons/store/project.store.svelte';
  import { visualizationStore } from '../../commons/store/visualization.store.svelte';
  import { ViewMode } from '../constants/map.constants';
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
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import type { DeckMapProps } from '../types';
  import {
    DEFAULT_PAGE_COLOR,
    formatState,
    PAGE_GRID_SIZE_PX
  } from '../../step-toolbar/tools/format/format.store.svelte';
  import { getSimplificationState } from '../../step-toolbar/tools/simplification/simplification.store.svelte';
  import { LegendPosition } from '$lib/features/commons/constants/ui.constants';
  import { annotationsActions } from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
  import { legendActions } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
  import AnnotationOverlay from './annotation-overlay.svelte';
  import GeoIndicationsOverlay from './geo-indications-overlay.svelte';
  import LegendOverlay from './legend-overlay.svelte';

  let {
    tables,
    geoJSONs,
    width,
    height,
    onReady,
    forcedVisualizationIds
  }: DeckMapProps = $props();

  const hasData = $derived(tables.size > 0 || geoJSONs.size > 0);
  const formatColor = $derived(
    typeof formatState.color === 'object' && formatState.color
      ? formatState.color
      : DEFAULT_PAGE_COLOR
  );
  const pageBackgroundColor = $derived(
    hslToHex(formatColor.hue, formatColor.saturation, formatColor.lightness)
  );
  const seaLayer = $derived(basemapLayersStore.getLayer('mers'));
  const pageMargins = $derived(formatState.margins);
  const showPageGrid = $derived(
    formatState.gridEnabled && globalState.selectedStep === ToolbarStep.Styling
  );
  const isStylingMode = $derived(
    globalState.selectedStep === ToolbarStep.Styling
  );
  const mapCanvasWidth = $derived(
    Math.max(1, width - pageMargins.left - pageMargins.right)
  );
  const mapCanvasHeight = $derived(
    Math.max(1, height - pageMargins.top - pageMargins.bottom)
  );
  const pageStyle = $derived(
    `background-color: ${pageBackgroundColor}; padding: ${pageMargins.top}px ${pageMargins.right}px ${pageMargins.bottom}px ${pageMargins.left}px;`
  );
  const mapCanvasStyle = $derived.by(() => {
    const color = seaLayer?.color ?? pageBackgroundColor;
    const opacity = Math.max(0, Math.min(100, seaLayer?.opacity ?? 100)) / 100;

    if (!seaLayer?.visible) {
      return `background-color: ${pageBackgroundColor};`;
    }

    if (!color.startsWith('#')) {
      return `background-color: ${color};`;
    }

    const hex = color.slice(1);
    const normalizedHex =
      hex.length === 3
        ? hex
            .split('')
            .map((char) => `${char}${char}`)
            .join('')
        : hex;

    if (normalizedHex.length !== 6) {
      return `background-color: ${color};`;
    }

    const r = Number.parseInt(normalizedHex.slice(0, 2), 16);
    const g = Number.parseInt(normalizedHex.slice(2, 4), 16);
    const b = Number.parseInt(normalizedHex.slice(4, 6), 16);

    if (![r, g, b].every(Number.isFinite)) {
      return `background-color: ${color};`;
    }

    return `background-color: rgba(${r}, ${g}, ${b}, ${opacity});`;
  });
  const pageGridStyle = $derived(
    `background-size: ${PAGE_GRID_SIZE_PX}px ${PAGE_GRID_SIZE_PX}px;`
  );
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
  let isLoadingBasemap = false;
  let resizeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let isSwitchingViewMode = $state(false);
  let pendingLayerUpdate = $state(false);
  let layerUpdateTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const RESIZE_DEBOUNCE_MS = 150;
  const LAYER_UPDATE_DEBOUNCE_MS = 16;
  const PROJECT_EMPTY_RESET_DEBOUNCE_MS = 250;

  let previousDatasetCount = 0;
  let pendingViewReset = false;
  let pendingOrthographicFit = $state(false);
  let projectEmptyResetTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastDatasetCountSnapshot = -1;
  let lastLayoutSnapshot = $state<string | null>(null);

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

    if (
      mapInit.viewMode === ViewMode.MAPLIBRE &&
      mapInit.map &&
      !mapInit.map.isStyleLoaded()
    ) {
      logger.debug(
        `Deferred (style not loaded, pending=true) from: ${source}`,
        LogCategory.MAP
      );
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

  const mapState = useMapState({
    getForcedVisualizationIds: () => forcedVisualizationIds
  });

  const mapInit = useMapInit({
    onMapLoaded: () => {
      const shouldUseMapLibre =
        osmBasemapStore.isActive || basemapStyleStore.requiresMapLibre;

      if (shouldUseMapLibre && mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
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
    onMoveEnd: () => mapPosition.savePosition(),
    getActiveVisualizations: () => mapState.activeVisualizations
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
    buildLayerContextForViz: (viz) => mapState.buildLayerContextForViz(viz),
    getShouldRenderDatasetFallbacks: () =>
      globalState.selectedStep === ToolbarStep.Data
  });

  function updateCanvasSize() {
    if (mapContainer) {
      projectionStore.updateCanvasSize({
        width: mapContainer.offsetWidth || 800,
        height: mapContainer.offsetHeight || 600
      });
    }
  }

  function syncOrthographicDeckSize(): void {
    if (!mapContainer || mapInit.viewMode !== ViewMode.ORTHOGRAPHIC) {
      return;
    }

    const deckInstance = mapInit.deckInstance;
    if (!deckInstance) {
      return;
    }

    deckInstance.setProps({
      width: mapContainer.offsetWidth || 800,
      height: mapContainer.offsetHeight || 600
    });
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
    const margins = pageMargins;
    const layoutSnapshot = `${formatState.width}x${formatState.height}-${margins.top}-${margins.right}-${margins.bottom}-${margins.left}`;

    if (lastLayoutSnapshot === null) {
      lastLayoutSnapshot = layoutSnapshot;
      return;
    }

    if (layoutSnapshot === lastLayoutSnapshot) {
      return;
    }

    lastLayoutSnapshot = layoutSnapshot;

    untrack(() => {
      annotationsActions.redistributePageElements({
        width: formatState.width,
        height: formatState.height,
        margins
      });
      legendActions.setPosition(LegendPosition.BOTTOM_CENTER);
    });
  });

  $effect(() => {
    void mapCanvasWidth;
    void mapCanvasHeight;

    untrack(() => {
      syncOrthographicDeckSize();
    });
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

      if (shouldUseMapLibre && mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
        isSwitchingViewMode = true;
        mapBasemap.cleanup();
        mapInit.switchToMapLibreMode();
      } else if (!shouldUseMapLibre && mapInit.viewMode === ViewMode.MAPLIBRE) {
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
    if (
      pendingOrthographicFit &&
      mapInit.isMapLoaded &&
      mapInit.viewMode === ViewMode.ORTHOGRAPHIC
    ) {
      pendingOrthographicFit = false;
      untrack(() => mapInstanceStore.fitToOrthographicBounds());
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
      if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
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
      if (mapInit.viewMode === ViewMode.MAPLIBRE && mapInit.map) {
        untrack(() => mapBounds.fitToGeoJSONBounds(firstGeoJSON));
      } else if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
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

  // Detect when project becomes empty (all datasets removed) using datasetsStore
  // as the source of truth — displayTables can be empty for tabular CSVs not yet joined
  $effect(() => {
    const currentCount = datasetsStore.datasets.length;
    const sourceFileCount = untrack(
      () => projectStore.currentProject?.data?.sourceFiles?.length ?? 0
    );

    if (currentCount !== lastDatasetCountSnapshot) {
      lastDatasetCountSnapshot = currentCount;
      logger.debug('[thematic-map] dataset/source snapshot', LogCategory.MAP, {
        datasetsCount: currentCount,
        previousDatasetCount,
        sourceFileCount,
        isMapLoaded: mapInit.isMapLoaded
      });
    }

    if (currentCount > 0) {
      previousDatasetCount = currentCount;
      if (projectEmptyResetTimeoutId) {
        clearTimeout(projectEmptyResetTimeoutId);
        projectEmptyResetTimeoutId = null;
        logger.debug(
          '[thematic-map] canceled pending projectEmpty reset because datasets became non-empty',
          LogCategory.MAP,
          {
            datasetsCount: currentCount
          }
        );
      }
    }

    if (currentCount === 0 && previousDatasetCount > 0 && mapInit.isMapLoaded) {
      // Guard: don't reset if the project still has source files.
      // Datasets can be temporarily empty during reprocessing or lifecycle transitions.
      if (sourceFileCount > 0) {
        logger.warn(
          '[thematic-map] projectEmpty blocked: datasets=0 but sourceFiles still exist',
          LogCategory.MAP,
          {
            previousDatasetCount,
            sourceFileCount
          }
        );
        return;
      }

      if (projectEmptyResetTimeoutId) {
        return;
      }

      logger.info(
        '[thematic-map] projectEmpty candidate detected, scheduling reset',
        LogCategory.MAP,
        {
          previousDatasetCount,
          sourceFileCount,
          debounceMs: PROJECT_EMPTY_RESET_DEBOUNCE_MS
        }
      );

      projectEmptyResetTimeoutId = setTimeout(() => {
        projectEmptyResetTimeoutId = null;

        const datasetsCountNow = datasetsStore.datasets.length;
        const sourceFileCountNow =
          projectStore.currentProject?.data?.sourceFiles?.length ?? 0;
        if (
          datasetsCountNow !== 0 ||
          sourceFileCountNow > 0 ||
          !mapInit.isMapLoaded
        ) {
          logger.warn(
            '[thematic-map] projectEmpty reset canceled after debounce',
            LogCategory.MAP,
            {
              datasetsCountNow,
              sourceFileCountNow,
              isMapLoaded: mapInit.isMapLoaded
            }
          );
          return;
        }

        previousDatasetCount = 0;
        logEffect('projectEmpty');
        logger.info(
          '[thematic-map] projectEmpty confirmed: resetting map state',
          LogCategory.MAP
        );

        pendingViewReset = true;
        projectionStore.clear();
        mapBounds.resetFitState();
        basemapStyleStore.reset();
        basemapLayersStore.resetToDefaults();
        worldBaseTable = null;
        scheduleLayerUpdate('effect:projectEmpty');
        loadWorldBasemap();
      }, PROJECT_EMPTY_RESET_DEBOUNCE_MS);
    }
  });

  $effect(() => {
    // Note: isStyleLoading check is handled inside scheduleLayerUpdate() to avoid reactive dependency
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (!hasData && canUpdate) {
      logEffect('noData');
      untrack(() => {
        scheduleLayerUpdate('effect:noData');
        // Retry basemap loading if it failed or hasn't completed yet
        if (!worldBaseTable) {
          loadWorldBasemap();
        }
      });
    }
  });

  $effect(() => {
    // Note: isStyleLoading check is handled inside scheduleLayerUpdate() to avoid reactive dependency
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (worldBaseTable && canUpdate) {
      logEffect('worldBaseTable');
      untrack(() => {
        scheduleLayerUpdate('effect:worldBaseTable');
        // When no user data, basemap loading completes the init — trigger ready immediately
        if (!hasData) {
          triggerOnReady();

          // Fit to world basemap bounds after a view reset (all data removed)
          if (pendingViewReset && worldBaseTable) {
            pendingViewReset = false;
            if (mapInit.viewMode === ViewMode.MAPLIBRE && mapInit.map) {
              const bounds = calculateBoundsFromGeoArrow(worldBaseTable);
              if (bounds) {
                mapBounds.fitToBounds(bounds, true);
              }
            }
            // Orthographic: projectionStore.referenceBbox is already set by
            // basemapService.updateProjectionFromTable() since we cleared it above
          }
        }
      });
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

  $effect(() => {
    const refId = basemapStyleStore.referenceBasemapId;
    logEffect('referenceBasemapId');
    logger.debug('Reference basemap changed', LogCategory.MAP, { refId });

    untrack(async () => {
      if (!mapInit.isMapLoaded) {
        logger.warn(
          'Map not loaded, skipping reference basemap load',
          LogCategory.MAP,
          { refId }
        );
        return;
      }

      if (refId) {
        logger.info('Loading reference basemap', LogCategory.MAP, {
          basemapId: refId
        });
        const loaded = await basemapService.loadBasemap(refId);
        if (loaded) {
          logger.debug(
            'Reference basemap loaded, updating worldBaseTable',
            LogCategory.MAP,
            { basemapId: refId, rows: loaded.geometryTable.numRows }
          );
          worldBaseTable = loaded.geometryTable;
          if (!isSwitchingViewMode) {
            scheduleLayerUpdate('effect:referenceBasemapChanged');

            // Fit map view to new basemap bounds
            if (mapInit.viewMode === ViewMode.MAPLIBRE && mapInit.map) {
              const bounds = calculateBoundsFromGeoArrow(loaded.geometryTable);
              if (bounds) {
                mapBounds.resetFitState();
                mapBounds.fitToBounds(bounds, true);
              }
            } else if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
              const bounds = calculateBoundsFromGeoArrow(loaded.geometryTable);
              if (bounds) {
                const [[minX, minY], [maxX, maxY]] = bounds as [
                  [number, number],
                  [number, number]
                ];
                projectionStore.setReferenceBbox([minX, minY, maxX, maxY]);
              } else if (loaded.metadata.bbox) {
                // Fallback: native GeoArrow basemaps may have default world bounds
                // in their schema metadata, causing calculateBoundsFromGeoArrow to
                // return null. Use the catalog bbox (WGS84) instead.
                projectionStore.setReferenceBbox(loaded.metadata.bbox);
              }
              if (mapInit.isMapLoaded) {
                mapInstanceStore.fitToOrthographicBounds();
              } else {
                pendingOrthographicFit = true;
              }
            }
          }
        } else {
          logger.error(
            'Failed to load reference basemap — not found in service',
            LogCategory.MAP,
            { refId }
          );
        }
      } else {
        await loadWorldBasemap();
      }
    });
  });

  async function loadWorldBasemap(): Promise<void> {
    if (isLoadingBasemap) return;
    isLoadingBasemap = true;
    logger.debug('loadWorldBasemap started', LogCategory.MAP);
    const start = performance.now();
    try {
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

        // Fit orthographic viewport to world basemap bounds
        // (bypasses the guard in updateProjectionFromTable which skips
        // when referenceBbox is already set from a previous basemap)
        if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
          const bounds = calculateBoundsFromGeoArrow(loaded.geometryTable);
          if (bounds) {
            const [[minX, minY], [maxX, maxY]] = bounds as [
              [number, number],
              [number, number]
            ];
            projectionStore.setReferenceBbox([minX, minY, maxX, maxY]);
          } else if (loaded.metadata.bbox) {
            projectionStore.setReferenceBbox(loaded.metadata.bbox);
          }
          if (mapInit.isMapLoaded) {
            mapInstanceStore.fitToOrthographicBounds();
          } else {
            pendingOrthographicFit = true;
          }
        }
      }
    } catch (error) {
      logger.error('loadWorldBasemap failed', LogCategory.MAP, error);
    } finally {
      isLoadingBasemap = false;
    }
  }

  onMount(() => {
    const initialViewMode = basemapStyleStore.requiresMapLibre
      ? ViewMode.MAPLIBRE
      : ViewMode.ORTHOGRAPHIC;
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
          if (mapInit.viewMode === ViewMode.MAPLIBRE) {
            mapInit.map?.resize();
          } else {
            syncOrthographicDeckSize();
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
      if (projectEmptyResetTimeoutId) {
        clearTimeout(projectEmptyResetTimeoutId);
      }
    };
  });
</script>

<div class="page-container" style={pageStyle}>
  <div
    class="map-stage"
    style="width: {mapCanvasWidth}px; height: {mapCanvasHeight}px;"
  >
    <div
      bind:this={mapContainer}
      class="map-canvas"
      style={mapCanvasStyle}
    ></div>

    {#if showPageGrid}
      <div class="page-grid" style={pageGridStyle}></div>
    {/if}

    {#if isSwitchingViewMode}
      <div class="view-mode-loader" transition:fade={{ duration: 200 }}>
        <SkeletonPlaceholder style="width: 100%; height: 100%;" />
      </div>
    {/if}

    {#if mapLoadingStore.isUpdatingLayers}
      <div class="layer-update-indicator" transition:fade={{ duration: 150 }}>
        <div class="spinner"></div>
      </div>
    {/if}

    {#if isStylingMode}
      <GeoIndicationsOverlay />
      <LegendOverlay />
      <AnnotationOverlay />
    {/if}
  </div>
</div>

<style>
  .page-container {
    position: relative;
    flex-shrink: 0;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .map-stage {
    position: relative;
    overflow: hidden;
  }

  .page-grid {
    position: absolute;
    inset: 0;
    z-index: var(--z-map-layer);
    pointer-events: none;
    background-image:
      linear-gradient(to right, rgba(22, 22, 22, 0.12) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(22, 22, 22, 0.12) 1px, transparent 1px);
  }

  .map-canvas {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .map-canvas :global(canvas) {
    display: block;
  }

  .view-mode-loader {
    position: absolute;
    inset: 0;
    z-index: var(--z-dropdown);
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
    z-index: var(--z-map-overlay);
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
    z-index: var(--z-notification) !important;
    pointer-events: none !important;
  }
</style>
