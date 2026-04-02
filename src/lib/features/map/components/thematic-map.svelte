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
  import type { DeckMapProps, DeckOrthographicViewStateMap } from '../types';
  import {
    DEFAULT_PAGE_COLOR,
    getFormatState,
    PAGE_GRID_SIZE_PX
  } from '../../step-toolbar/tools/format/format.store.svelte';
  import { getSimplificationState } from '../../step-toolbar/tools/simplification/simplification.store.svelte';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { getFiltersMap } from '$lib/features/duckdb/orchestrator/state.svelte';
  import { LegendPosition } from '$lib/features/commons/constants/ui.constants';
  import { annotationsActions } from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
  import { legendActions } from '$lib/features/step-toolbar/tools/legend/legend.store.svelte';
  import { getColorBlindnessState } from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte';
  import { getColorBlindnessMatrix } from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.filter';
  import {
    resolveOrthographicReferenceTable,
    shouldUseBasemapReferenceInOrthographicView
  } from '../utils/orthographic-reference';
  import {
    getMainlandBboxForBasemap,
    computeProjectedBboxForBasemap
  } from '../utils/geoarrow-stream-bridge';
  import AnnotationOverlay from './annotation-overlay.svelte';
  import GeoIndicationsOverlay from './geo-indications-overlay.svelte';
  import LegendOverlay from './legend-overlay.svelte';

  let {
    tables,
    geoJSONs,
    dataVersion = 0,
    width,
    height,
    onReady,
    forcedVisualizationIds,
    onMoveSync,
    syncViewState
  }: DeckMapProps = $props();

  const hasData = $derived(tables.size > 0 || geoJSONs.size > 0);
  const fmtState = $derived(getFormatState());
  const formatColor = $derived(
    typeof fmtState.color === 'object' && fmtState.color
      ? fmtState.color
      : DEFAULT_PAGE_COLOR
  );
  const pageBackgroundColor = $derived(
    hslToHex(formatColor.hue, formatColor.saturation, formatColor.lightness)
  );
  const pageMargins = $derived(fmtState.margins);
  const showPageGrid = $derived(
    fmtState.gridEnabled && globalState.selectedStep === ToolbarStep.Styling
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
    // Keep a neutral canvas background. Sea color must come only from map
    // layers, otherwise out-of-projection areas look like editable ocean.
    return `background-color: ${pageBackgroundColor};`;
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

  const colorBlindnessMatrix = $derived(
    getColorBlindnessMatrix(getColorBlindnessState().simulationType)
  );

  const MIN_SKELETON_DURATION_MS = 500;
  const MAX_WAIT_FOR_DATA_MS = 5000;

  let mapContainer: HTMLDivElement;
  let hasCalledOnReady = $state(false);
  let initStartTime = $state<number>(Date.now());
  let maxWaitTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let worldBaseTable = $state.raw<ArrowTable | null>(null);
  let isLoadingBasemap = false;
  const RESIZE_DEBOUNCE_MS = 150;
  let resizeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let isSwitchingViewMode = $state(false);
  let pendingLayerUpdate = $state(false);
  let waitingForStyleIdle = false;
  let layerUpdateTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const LAYER_UPDATE_DEBOUNCE_MS = 16;
  const PROJECT_EMPTY_RESET_DEBOUNCE_MS = 250;

  let previousDatasetCount = 0;
  let pendingViewReset = false;
  let pendingOrthographicFit = $state(false);
  let projectEmptyResetTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastDatasetCountSnapshot = -1;
  let lastLayoutSnapshot: string | null = null;

  let referenceBasemapRequestId = 0;
  let pendingWorldBasemapRequestId: number | null = null;
  let isApplyingMapLibreSync = false;
  /** True while a reference basemap is being loaded — blocks triggerOnReady */
  let isLoadingReferenceBasemap = false;
  /** True if triggerOnReady was called while reference basemap was loading */
  let pendingOnReady = false;

  // Bounds computation is cached at module level in bounds.ts via WeakMap<ArrowTable, ...>.
  // No need for component-local cache.

  function queueStyleIdleRetry(_source?: string): void {
    const map = mapInit.map;
    if (!map || waitingForStyleIdle) return;

    waitingForStyleIdle = true;
    map.once('idle', () => {
      waitingForStyleIdle = false;
      if (pendingLayerUpdate) {
        pendingLayerUpdate = false;
        scheduleLayerUpdate('mapIdleAfterStyle');
      }
    });
  }

  function scheduleLayerUpdate(source?: string): void {
    if (isSwitchingViewMode || mapBasemap.isStyleLoading) {
      pendingLayerUpdate = true;
      return;
    }

    if (
      mapInit.viewMode === ViewMode.MAPLIBRE &&
      mapInit.map &&
      !mapInit.map.isStyleLoaded()
    ) {
      pendingLayerUpdate = true;
      queueStyleIdleRetry(source);
      return;
    }
    if (layerUpdateTimeoutId) {
      clearTimeout(layerUpdateTimeoutId);
    }
    layerUpdateTimeoutId = setTimeout(() => {
      layerUpdateTimeoutId = null;
      if (
        !mapInit.isMapLoaded ||
        isSwitchingViewMode ||
        mapBasemap.isStyleLoading
      ) {
        return;
      }

      if (
        mapInit.viewMode === ViewMode.MAPLIBRE &&
        mapInit.map &&
        !mapInit.map.isStyleLoaded()
      ) {
        pendingLayerUpdate = true;
        queueStyleIdleRetry(source);
        return;
      }

      mapLoadingStore.setUpdatingLayers(true);
      mapLayers.updateLayers(tables, geoJSONs);
      requestAnimationFrame(() => {
        mapLoadingStore.setUpdatingLayers(false);
      });
    }, LAYER_UPDATE_DEBOUNCE_MS);
  }

  function triggerOnReady() {
    if (hasCalledOnReady) return;

    // Don't reveal the map while the reference basemap is still loading
    // — the user would see the world basemap flash before the correct one
    if (isLoadingReferenceBasemap) {
      pendingOnReady = true;
      logger.debug(
        'triggerOnReady deferred — reference basemap still loading',
        LogCategory.MAP
      );
      return;
    }

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
    onMoveEnd: () => {
      mapPosition.savePosition();
      if (
        onMoveSync &&
        mapInit.viewMode === ViewMode.MAPLIBRE &&
        mapInit.map &&
        !isApplyingMapLibreSync
      ) {
        const center = mapInit.map.getCenter();
        onMoveSync({
          type: 'maplibre',
          center: [center.lng, center.lat],
          zoom: mapInit.map.getZoom()
        });
      }
      isApplyingMapLibreSync = false;
    },
    getActiveVisualizations: () => mapState.activeVisualizations,
    onOrthographicViewStateChanged: (target, zoom) => {
      onMoveSync?.({ type: 'orthographic', target, zoom });
    }
  });

  const mapPosition = useMapPosition({
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    onPositionRestored: (position) => {
      mapInstanceStore.setBaseZoomLevel(position.zoom);
    }
  });

  function getTableFiltersForDataset(datasetId: string) {
    const dataset = datasetsStore.datasets.find((d) => d.id === datasetId);
    if (!dataset?.sourceFileId) return undefined;
    const duckDBDataset = duckDBOrchestrator.getDatasetBySourceFile(
      dataset.sourceFileId
    );
    if (!duckDBDataset?.tableName) return undefined;
    return getFiltersMap().get(duckDBDataset.tableName);
  }

  function getRenderedDataset(datasetId: string | undefined) {
    if (!datasetId) return null;
    return (
      datasetsStore.datasets.find((dataset) => dataset.id === datasetId) ?? null
    );
  }

  function getRenderedDuckDBDataset(datasetId: string | undefined) {
    const dataset = getRenderedDataset(datasetId);
    if (!dataset?.sourceFileId) return null;
    return (
      duckDBOrchestrator.getDatasetBySourceFile(dataset.sourceFileId) ?? null
    );
  }

  const mapLayers = useMapLayers({
    getDeckOverlay: () => mapInit.deckOverlay,
    getDeckInstance: () => mapInit.deckInstance,
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    getWorldBaseTable: () => worldBaseTable,
    getActiveVisualizations: () => mapState.activeVisualizations,
    buildLayerContextForViz: (viz) => mapState.buildLayerContextForViz(viz),
    getShouldRenderDatasetFallbacks: () =>
      globalState.selectedStep === ToolbarStep.Data,
    getTableFilters: getTableFiltersForDataset
  });

  function updateCanvasSize() {
    if (mapContainer) {
      projectionStore.updateCanvasSize({
        width: mapContainer.offsetWidth || 800,
        height: mapContainer.offsetHeight || 600
      });
    }
  }

  function fitOrthographicViewport(): void {
    if (mapInit.viewMode !== ViewMode.ORTHOGRAPHIC) {
      return;
    }

    if (mapInit.isMapLoaded) {
      mapInstanceStore.fitToOrthographicBounds();
    } else {
      pendingOrthographicFit = true;
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
      mapBasemap.syncOSMRasterLayer();
      mapBasemap.syncLabelsVisibility();
      mapBasemap.syncGroupVisibility();
      // setStyle() resets the MapLibre projection to mercator — re-apply the stored projection
      mapBasemap.syncProjection();
      waitingForStyleIdle = false;
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
    const layoutSnapshot = `${fmtState.width}x${fmtState.height}-${margins.top}-${margins.right}-${margins.bottom}-${margins.left}`;

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
        width: fmtState.width,
        height: fmtState.height,
        margins
      });
      legendActions.setPosition(LegendPosition.BOTTOM_CENTER);
    });
  });

  $effect(() => {
    void mapCanvasWidth;
    void mapCanvasHeight;

    untrack(() => {
      updateCanvasSize();
      if (mapInit.isMapLoaded && !isSwitchingViewMode) {
        if (mapInit.viewMode === ViewMode.MAPLIBRE) {
          mapInit.map?.resize();
        } else if (
          mapInit.viewMode === ViewMode.ORTHOGRAPHIC &&
          mapInstanceStore.hasPendingRestore
        ) {
          // Canvas resized while a saved view state is pending — recompute
          // the world-coordinate target with the updated model matrix scale.
          mapInstanceStore.fitToOrthographicBounds();
        }
      }
    });
  });

  $effect(() => {
    void osmBasemapStore.tileConfig;

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
      untrack(() => {
        const loaded = basemapService.currentBasemap;
        if (loaded) {
          if (loaded.activeSimplificationLevel) {
            const simplifiedTable = basemapService.getSimplifiedBasemapTable(
              loaded.metadata.file,
              loaded.activeSimplificationLevel
            );
            worldBaseTable = simplifiedTable ?? loaded.geometryTable;
          } else {
            worldBaseTable = loaded.geometryTable;
          }
        }
      });
    }
  });

  $effect(() => {
    // Note: isStyleLoading check is handled inside scheduleLayerUpdate() to avoid reactive dependency
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (firstTable && canUpdate) {
      const refBasemapId = basemapStyleStore.referenceBasemapId;
      if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
        const dataset = getRenderedDataset(firstDatasetId);
        const duckDataset = getRenderedDuckDBDataset(firstDatasetId);
        const shouldUseBasemapReference =
          shouldUseBasemapReferenceInOrthographicView(
            dataset,
            duckDataset,
            refBasemapId
          );
        const referenceTable = resolveOrthographicReferenceTable({
          dataset,
          duckDataset,
          datasetTable: firstTable,
          basemapTable: worldBaseTable,
          referenceBasemapId: refBasemapId
        });
        const bounds = referenceTable
          ? calculateBoundsFromGeoArrow(referenceTable)
          : null;

        if (bounds) {
          untrack(() => {
            const currentBasemapMeta = basemapService.currentBasemap?.metadata;
            // For composite projections (e.g. France DOM-TOM), use mainland
            // bounds so the model matrix centers on metropolitan France.
            const mainlandBbox = currentBasemapMeta
              ? getMainlandBboxForBasemap(
                  currentBasemapMeta,
                  basemapService.projectionPresets
                )
              : null;
            const projectedBbox = currentBasemapMeta
              ? computeProjectedBboxForBasemap(
                  currentBasemapMeta,
                  basemapService.projectionPresets,
                  960,
                  600,
                  mainlandBbox ?? undefined
                )
              : null;
            if (projectedBbox) {
              projectionStore.setReferenceBbox(projectedBbox, undefined, true);
            } else if (mainlandBbox) {
              projectionStore.setReferenceBbox(mainlandBbox);
            } else {
              const [[minX, minY], [maxX, maxY]] = bounds as [
                [number, number],
                [number, number]
              ];
              projectionStore.setReferenceBbox([minX, minY, maxX, maxY]);
            }
            scheduleLayerUpdate('effect:firstTable-bounds');
            fitOrthographicViewport();
          });
          triggerOnReady();
        } else if (shouldUseBasemapReference && projectionStore.referenceBbox) {
          untrack(() => {
            fitOrthographicViewport();
          });
          triggerOnReady();
        } else if (!shouldUseBasemapReference) {
          const geoMetadata = firstTable.schema.metadata?.get('geo');
          if (geoMetadata) {
            untrack(() => {
              projectionStore.setReferenceBboxFromMetadata(geoMetadata);
              scheduleLayerUpdate('effect:firstTable-metadata');
              fitOrthographicViewport();
            });
            triggerOnReady();
          }
        }
      } else if (mapInit.map) {
        if (refBasemapId && worldBaseTable) {
          const bBounds = calculateBoundsFromGeoArrow(worldBaseTable);
          if (bBounds) {
            untrack(() => mapBounds.fitToBounds(bBounds, true));
          }
        } else {
          untrack(() => mapBounds.fitToArrowBounds(firstTable, firstDatasetId));
        }
      }
    }
  });

  $effect(() => {
    // Note: isStyleLoading check is handled inside scheduleLayerUpdate() to avoid reactive dependency
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (firstGeoJSON && canUpdate) {
      // When a reference basemap is selected, fit to basemap bounds
      // so administrative boundaries are visible even with polygon data
      const geoRefBasemapId = basemapStyleStore.referenceBasemapId;
      const useBasemapBoundsForGeo = Boolean(geoRefBasemapId) && worldBaseTable;

      if (mapInit.viewMode === ViewMode.MAPLIBRE && mapInit.map) {
        if (useBasemapBoundsForGeo) {
          const bBounds = calculateBoundsFromGeoArrow(worldBaseTable!);
          if (bBounds) {
            untrack(() => mapBounds.fitToBounds(bBounds, true));
          }
        } else {
          untrack(() => mapBounds.fitToGeoJSONBounds(firstGeoJSON));
        }
      } else if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
        untrack(() => {
          let bounds: ReturnType<typeof calculateBoundsFromGeoJSON>;
          if (useBasemapBoundsForGeo) {
            bounds = calculateBoundsFromGeoArrow(worldBaseTable!);
          } else {
            bounds = calculateBoundsFromGeoJSON(firstGeoJSON);
          }
          if (bounds) {
            const [[minX, minY], [maxX, maxY]] = bounds as [
              [number, number],
              [number, number]
            ];
            projectionStore.setReferenceBbox([minX, minY, maxX, maxY]);
            scheduleLayerUpdate('effect:firstGeoJSON');
            fitOrthographicViewport();
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
    }

    if (currentCount > 0) {
      previousDatasetCount = currentCount;
      if (projectEmptyResetTimeoutId) {
        clearTimeout(projectEmptyResetTimeoutId);
        projectEmptyResetTimeoutId = null;
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
    untrack(() => {
      if (isSwitchingViewMode) {
        return;
      }
      mapBasemap.syncBasemapStyle();
    });
  });

  $effect(() => {
    void basemapStyleStore.showLabels;
    untrack(() => mapBasemap.syncLabelsVisibility());
  });

  $effect(() => {
    void basemapStyleStore.groupVisibilityVersion;
    untrack(() => mapBasemap.syncGroupVisibility());
  });

  $effect(() => {
    void mapProjectionStore.projection;
    untrack(() => mapBasemap.syncProjection());
  });

  const filtersVersion = $derived(
    Array.from(getFiltersMap().entries())
      .map(([k, v]) => `${k}:${v.length}:${v.map((f) => f.id).join(',')}`)
      .join('|')
  );

  const layerUpdateTrigger = $derived({
    vizVersion: visualizationStore.version,
    basemapVersion: basemapLayersStore.version,
    highlightVersion: mapHighlightStore.version,
    dataVersion,
    dataSize: `${tables.size}-${geoJSONs.size}`,
    filtersVersion
  });

  $effect(() => {
    void layerUpdateTrigger;

    // Note: isStyleLoading check is handled inside scheduleLayerUpdate() to avoid reactive dependency
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (canUpdate) {
      untrack(() => scheduleLayerUpdate('effect:layerUpdateTrigger'));
    }
  });

  $effect(() => {
    const refId = basemapStyleStore.referenceBasemapId;
    const requestId = ++referenceBasemapRequestId;

    untrack(async () => {
      if (!mapInit.isMapLoaded) {
        logger.warn(
          'Map not loaded, skipping reference basemap load',
          LogCategory.MAP,
          { refId }
        );
        return;
      }

      if (requestId !== referenceBasemapRequestId) {
        return;
      }

      if (refId) {
        isLoadingReferenceBasemap = true;
        logger.info('Loading reference basemap', LogCategory.MAP, {
          basemapId: refId
        });
        try {
          const loaded = await basemapService.loadBasemap(refId);
          if (requestId !== referenceBasemapRequestId) {
            return;
          }

          if (loaded) {
            worldBaseTable = loaded.geometryTable;
            if (!isSwitchingViewMode) {
              scheduleLayerUpdate('effect:referenceBasemapChanged');

              // Fit map view to new basemap bounds
              if (mapInit.viewMode === ViewMode.MAPLIBRE && mapInit.map) {
                let bounds = calculateBoundsFromGeoArrow(loaded.geometryTable);
                if (!bounds && loaded.metadata.bbox) {
                  const [minLng, minLat, maxLng, maxLat] = loaded.metadata.bbox;
                  bounds = [
                    [minLng, minLat],
                    [maxLng, maxLat]
                  ];
                }
                if (bounds) {
                  mapBounds.fitToBounds(bounds, true);
                }
              } else if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
                const mainlandBbox = getMainlandBboxForBasemap(
                  loaded.metadata,
                  basemapService.projectionPresets
                );
                const projectedBbox = computeProjectedBboxForBasemap(
                  loaded.metadata,
                  basemapService.projectionPresets,
                  960,
                  600,
                  mainlandBbox ?? undefined
                );
                if (projectedBbox) {
                  projectionStore.setReferenceBbox(
                    projectedBbox,
                    undefined,
                    true
                  );
                } else if (mainlandBbox) {
                  projectionStore.setReferenceBbox(mainlandBbox);
                } else {
                  const bounds = calculateBoundsFromGeoArrow(
                    loaded.geometryTable
                  );
                  if (bounds) {
                    const [[minX, minY], [maxX, maxY]] = bounds as [
                      [number, number],
                      [number, number]
                    ];
                    projectionStore.setReferenceBbox([minX, minY, maxX, maxY]);
                  } else if (loaded.metadata.bbox) {
                    projectionStore.setReferenceBbox(loaded.metadata.bbox);
                  }
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
        } finally {
          isLoadingReferenceBasemap = false;
          if (pendingOnReady) {
            pendingOnReady = false;
            triggerOnReady();
          }
        }
      } else {
        await loadWorldBasemap(requestId);
      }
    });
  });

  async function loadWorldBasemap(
    requestId = referenceBasemapRequestId
  ): Promise<void> {
    if (isLoadingBasemap) {
      pendingWorldBasemapRequestId = requestId;
      return;
    }

    isLoadingBasemap = true;
    pendingWorldBasemapRequestId = null;
    try {
      // If a reference basemap is configured, skip the world basemap entirely.
      // Loading world first wastes ~800ms and causes a visual flash (world → reference).
      const pendingRefId = basemapStyleStore.referenceBasemapId;
      if (pendingRefId) {
        const refRequestId = ++referenceBasemapRequestId;
        try {
          const refLoaded = await basemapService.loadBasemap(pendingRefId);
          if (refRequestId !== referenceBasemapRequestId) {
            return; // Stale request
          }
          if (refLoaded) {
            worldBaseTable = refLoaded.geometryTable;
            if (!isSwitchingViewMode) {
              scheduleLayerUpdate('loadWorldBasemap:pendingRef');

              if (mapInit.viewMode === ViewMode.MAPLIBRE && mapInit.map) {
                let refBounds = calculateBoundsFromGeoArrow(
                  refLoaded.geometryTable
                );
                if (!refBounds && refLoaded.metadata.bbox) {
                  const [minLng, minLat, maxLng, maxLat] =
                    refLoaded.metadata.bbox;
                  refBounds = [
                    [minLng, minLat],
                    [maxLng, maxLat]
                  ];
                }
                if (refBounds) {
                  mapBounds.fitToBounds(refBounds, true);
                }
              } else if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
                const refMainlandBbox = getMainlandBboxForBasemap(
                  refLoaded.metadata,
                  basemapService.projectionPresets
                );
                if (refMainlandBbox) {
                  projectionStore.setReferenceBbox(refMainlandBbox);
                } else {
                  const refBounds = calculateBoundsFromGeoArrow(
                    refLoaded.geometryTable
                  );
                  if (refBounds) {
                    const [[rMinX, rMinY], [rMaxX, rMaxY]] = refBounds as [
                      [number, number],
                      [number, number]
                    ];
                    projectionStore.setReferenceBbox([
                      rMinX,
                      rMinY,
                      rMaxX,
                      rMaxY
                    ]);
                  } else if (refLoaded.metadata.bbox) {
                    projectionStore.setReferenceBbox(refLoaded.metadata.bbox);
                  }
                }
                if (mapInit.isMapLoaded) {
                  mapInstanceStore.fitToOrthographicBounds();
                } else {
                  pendingOrthographicFit = true;
                }
              }
            }
          } else {
            // Reference basemap failed — fall back to world basemap
            logger.warn(
              'Reference basemap failed, falling back to world',
              LogCategory.MAP,
              { refId: pendingRefId }
            );
            const fallback = await basemapService.loadDefaultBasemap();
            if (fallback) {
              worldBaseTable = fallback.geometryTable;
              const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
              if (canUpdate) {
                scheduleLayerUpdate('loadWorldBasemap:refFailed');
              }
            }
          }
        } finally {
          isLoadingReferenceBasemap = false;
          if (pendingOnReady) {
            pendingOnReady = false;
            triggerOnReady();
          }
        }
        return; // Skip the world basemap path below
      }

      const loaded = await basemapService.loadDefaultBasemap();

      if (requestId !== referenceBasemapRequestId) {
        return;
      }

      if (loaded) {
        // Set up orthographic projection from world basemap bounds
        if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
          const mainlandBbox = getMainlandBboxForBasemap(
            loaded.metadata,
            basemapService.projectionPresets
          );
          const projectedBbox = computeProjectedBboxForBasemap(
            loaded.metadata,
            basemapService.projectionPresets,
            960,
            600,
            mainlandBbox ?? undefined
          );
          if (projectedBbox) {
            projectionStore.setReferenceBbox(projectedBbox, undefined, true);
          } else {
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
          }
          if (mapInit.isMapLoaded) {
            mapInstanceStore.fitToOrthographicBounds();
          } else {
            pendingOrthographicFit = true;
          }
        }

        // No reference basemap — use world basemap directly
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
          scheduleLayerUpdate('loadWorldBasemap');
        }
      }
    } catch (error) {
      logger.error('loadWorldBasemap failed', LogCategory.MAP, error);
    } finally {
      isLoadingBasemap = false;

      if (
        pendingWorldBasemapRequestId !== null &&
        pendingWorldBasemapRequestId !== requestId
      ) {
        const queuedRequestId = pendingWorldBasemapRequestId;
        pendingWorldBasemapRequestId = null;
        void loadWorldBasemap(queuedRequestId);
      }
    }
  }

  $effect(() => {
    const sv = syncViewState;
    const deck = mapInit.deckInstance;
    const map = mapInit.map;
    if (!sv) return;

    if (sv.type === 'orthographic' && sv.target && deck) {
      const orthographicViewState: DeckOrthographicViewStateMap = {
        main: { target: sv.target, zoom: sv.zoom, minZoom: -10, maxZoom: 10 }
      };
      deck.setProps({
        viewState: orthographicViewState as Parameters<
          typeof deck.setProps
        >[0]['viewState']
      });
    } else if (sv.type === 'maplibre' && sv.center && map) {
      isApplyingMapLibreSync = true;
      map.jumpTo({ center: sv.center, zoom: sv.zoom });
    }
  });

  onMount(() => {
    const initialViewMode = basemapStyleStore.requiresMapLibre
      ? ViewMode.MAPLIBRE
      : ViewMode.ORTHOGRAPHIC;
    mapInit.initialize(mapContainer, initialViewMode);

    updateCanvasSize();

    // If a reference basemap is configured (project restore), mark it early
    // so triggerOnReady() stays blocked until the reference basemap is loaded.
    // Without this, onReady fires after the first data table arrives but
    // before the reference basemap is ready → user sees world → reference flash.
    if (basemapStyleStore.referenceBasemapId) {
      isLoadingReferenceBasemap = true;
    }

    loadWorldBasemap();

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();

      const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
      if (canUpdate && mapInit.viewMode === ViewMode.MAPLIBRE) {
        mapInit.map?.resize();
      }

      if (canUpdate && !globalState.isToolbarTransitioning) {
        if (resizeTimeoutId) {
          clearTimeout(resizeTimeoutId);
        }
        resizeTimeoutId = setTimeout(() => {
          scheduleLayerUpdate('resizeObserver');
          resizeTimeoutId = null;
        }, RESIZE_DEBOUNCE_MS);
      }
    });
    resizeObserver.observe(mapContainer);

    return () => {
      resizeObserver.disconnect();
      mapInit.destroy();
      waitingForStyleIdle = false;
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

<svg aria-hidden="true" class="color-blindness-svg-defs">
  <defs>
    <filter id="color-blindness-filter" color-interpolation-filters="sRGB">
      <feColorMatrix
        type="matrix"
        values={colorBlindnessMatrix ??
          '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0'}
      />
    </filter>
  </defs>
</svg>

<div class="page-container" style={pageStyle}>
  <div
    class="map-stage"
    style="width: {mapCanvasWidth}px; height: {mapCanvasHeight}px;{colorBlindnessMatrix
      ? ' filter: url(#color-blindness-filter);'
      : ''}"
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

    <LegendOverlay />

    <GeoIndicationsOverlay interactive={isStylingMode} />
    <AnnotationOverlay interactive={isStylingMode} />
  </div>
</div>

<style>
  .color-blindness-svg-defs {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    pointer-events: none;
  }

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
      linear-gradient(to right, rgba(22, 22, 22, 0.14) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(22, 22, 22, 0.14) 1px, transparent 1px);
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

  :global(.maplibregl-ctrl-attrib) {
    display: none;
  }
</style>
