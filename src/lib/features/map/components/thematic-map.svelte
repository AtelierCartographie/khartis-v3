<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import { SkeletonPlaceholder } from 'carbon-components-svelte';
  import { Matrix4 } from '@math.gl/core';
  import type { LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
  import { onMount, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { getLocale } from '$lib/paraglide/runtime';
  import { basemapStyleStore } from '../../commons/stores/basemap-style.store.svelte';
  import {
    BasemapStyle,
    getBasemapViewportPreset,
    getBasemapZone
  } from '../constants/basemap-styles';
  import { hslToHex } from '../../commons/utils/color-utils';
  import {
    mapInstanceStore,
    type ViewportFitReason
  } from '../../commons/stores/map-instance.store.svelte';
  import { datasetsStore } from '../../commons/stores/datasets.store.svelte';
  import { projectStore } from '../../commons/stores/project.store.svelte';
  import { visualizationStore } from '../../commons/stores/visualization.store.svelte';
  import { ViewMode } from '../constants/map.constants';
  import { MAP_TIMING } from '../constants/timing.constants';
  import {
    useMapBasemap,
    useMapBounds,
    useMapInit,
    useMapLayers,
    useMapReferenceBasemap,
    useMapState
  } from '../hooks';
  import {
    calculateBoundsFromGeoArrow,
    calculateBoundsFromGeoJSON
  } from '../core';
  import {
    basemapService,
    getPreferredBasemapFile
  } from '../services/basemap.service.svelte';
  import { basemapLayersStore } from '../stores/basemap-layers.store.svelte';
  import { basemapAuxLayersStore } from '../stores/basemap-aux-layers.store.svelte';
  import { fontAssetsStore } from '$lib/features/commons/stores/font-assets.store.svelte';
  import { mapHighlightStore } from '../stores/map-highlight.store.svelte';
  import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
  import { rowScopeStore } from '../stores/row-scope.store.svelte';
  import { projectionStore } from '../stores/projection.store.svelte';
  import { mapProjectionStore } from '../stores/map-projection.store.svelte';
  import { mapLoadingStore } from '../stores/map-loading.store.svelte';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { zoomModeStore } from '$lib/features/commons/stores/zoom-mode.store.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { resolveLayoutSizingTokens } from '$lib/features/commons/utils/layout-sizing.utils';
  import type {
    BBox,
    DeckMapProps,
    DeckOrthographicViewStateMap
  } from '../types';
  import {
    DEFAULT_PAGE_COLOR,
    getFormatLayoutSizingContext,
    getFormatState
  } from '$lib/features/step-toolbar/tools/format';
  import { getSimplificationState } from '$lib/features/step-toolbar/tools/simplification';
  import { getProjectionState } from '$lib/features/step-toolbar/tools/projections';
  import { buildProjectionRenderKey } from '$lib/features/step-toolbar/tools/projections';
  import { layerOrderStore } from '$lib/features/step-toolbar/tools/layers/layer-order.store.svelte';
  import { trackWorkerParseVersion } from '../utils/worker-parse.svelte';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { annotationsActions } from '$lib/features/step-toolbar/tools/annotations';
  import {
    getColorBlindnessState,
    isColorBlindnessActive
  } from '$lib/features/step-toolbar/tools/color-blindness';
  import { getColorBlindnessMatrix } from '$lib/features/step-toolbar/tools/color-blindness';
  import {
    resolveOrthographicProjectionFitBbox,
    shouldUseBasemapReferenceInOrthographicView
  } from '../utils/orthographic-reference.utils';
  import { getMainlandBboxForBasemap } from '../utils/geoarrow-stream-bridge.utils';
  import { resolveActiveBasemapMetadata } from '../utils/basemap-metadata-resolution.utils';
  import { resolveUserProjectionOverride } from '../utils/user-projection.utils';
  import {
    resolveOrthographicBasemapReferenceState as resolveSharedOrthographicBasemapReferenceState,
    resolveOrthographicReferenceState as resolveSharedOrthographicReferenceState,
    resolveOrthographicRenderProjection,
    resolveOrthographicRenderedDatasetBounds,
    toBboxFromOrthographicBounds,
    toOrthographicBounds
  } from '../utils/orthographic-render-resolution.utils';
  import {
    getBrowserMaxRenderBufferSizePx,
    resolveMapRenderPixelRatio
  } from '../utils/render-pixel-ratio.utils';
  import { resolveOrthographicZoomBounds } from '../utils/map-zoom.utils';
  import { shouldUseMapLibreInterleaved } from '../utils/render-engine.utils';
  import {
    type OrthographicInteractiveDeck,
    syncMapLibreInteractionMode,
    syncOrthographicInteractionMode
  } from '../utils/map-interaction-mode.utils';
  import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
  import AnnotationOverlay from './annotation-overlay.svelte';
  import GeoIndicationsOverlay from './geo-indications-overlay.svelte';
  import LegendOverlay from './legend-overlay.svelte';
  import PageGridOverlay from './page-grid-overlay.svelte';

  let {
    tables,
    densityTables,
    splitData,
    geoJSONs,
    dataVersion = 0,
    width,
    height,
    logicalWidth = width,
    logicalHeight = height,
    displayScale = 1,
    onReady,
    forcedVisualizationIds,
    onMoveSync,
    syncViewState,
    showLegendOverlay = true,
    showGeoIndicationsOverlay = true,
    showAnnotationOverlay = true,
    isFacetCell = false
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
  const layoutSizingTokens = $derived(
    resolveLayoutSizingTokens(getFormatLayoutSizingContext(fmtState))
  );
  const logicalMapViewportFitPaddingPx = $derived(
    layoutSizingTokens.mapViewport.fitPaddingPx
  );
  const pageDisplayScale = $derived(
    Number.isFinite(displayScale) && displayScale > 0 ? displayScale : 1
  );
  const renderedPageMargins = $derived({
    top: pageMargins.top * pageDisplayScale,
    right: pageMargins.right * pageDisplayScale,
    bottom: pageMargins.bottom * pageDisplayScale,
    left: pageMargins.left * pageDisplayScale
  });
  const mapViewportFitPaddingPx = $derived(
    logicalMapViewportFitPaddingPx * pageDisplayScale
  );
  const showPageGrid = $derived(
    fmtState.gridEnabled &&
      (globalState.selectedStep === ToolbarStep.Styling ||
        globalState.isMapExporting)
  );
  const isVisualizationMode = $derived(
    globalState.selectedStep === ToolbarStep.Visualizations &&
      !globalState.isMapExporting
  );
  const isStylingMode = $derived(
    globalState.selectedStep === ToolbarStep.Styling ||
      globalState.isMapExporting
  );
  const showLegendPreview = $derived(isVisualizationMode || isStylingMode);
  const logicalMapCanvasWidth = $derived(
    Math.max(1, logicalWidth - pageMargins.left - pageMargins.right)
  );
  const logicalMapCanvasHeight = $derived(
    Math.max(1, logicalHeight - pageMargins.top - pageMargins.bottom)
  );
  const mapCanvasWidth = $derived(
    Math.max(1, Math.round(logicalMapCanvasWidth * pageDisplayScale))
  );
  const mapCanvasHeight = $derived(
    Math.max(1, Math.round(logicalMapCanvasHeight * pageDisplayScale))
  );
  const legendStageStyle = $derived(
    `left: ${renderedPageMargins.left}px; top: ${renderedPageMargins.top}px; width: ${mapCanvasWidth}px; height: ${mapCanvasHeight}px;`
  );
  const renderModelMatrix = $derived.by(() => {
    const modelMatrix = projectionStore.modelMatrix;
    if (!modelMatrix) {
      return null;
    }

    return new Matrix4()
      .scale([pageDisplayScale, pageDisplayScale, 1])
      .multiplyRight(modelMatrix);
  });
  const pageStyle = $derived(
    `background-color: ${pageBackgroundColor}; padding: ${renderedPageMargins.top}px ${renderedPageMargins.right}px ${renderedPageMargins.bottom}px ${renderedPageMargins.left}px;`
  );
  const mapCanvasStyle = $derived.by(() => {
    return `background-color: ${pageBackgroundColor};`;
  });
  const maxRenderBufferSizePx = $derived(getBrowserMaxRenderBufferSizePx());
  const renderPixelRatio = $derived.by(() => {
    const resolvedPixelRatio = resolveMapRenderPixelRatio(
      typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      1,
      Math.max(mapCanvasWidth, mapCanvasHeight),
      maxRenderBufferSizePx
    );

    return isFacetCell
      ? Math.min(
          resolvedPixelRatio,
          MAP_TIMING.FACET_CELL_RENDER_PIXEL_RATIO_MAX
        )
      : resolvedPixelRatio;
  });
  const firstTable = $derived(
    tables.size > 0 ? tables.values().next().value : null
  );
  const firstGeoJSON = $derived(
    geoJSONs.size > 0 ? geoJSONs.values().next().value : null
  );
  const firstDatasetId = $derived(
    tables.size > 0 ? tables.keys().next().value : undefined
  );
  const sourceFileCount = $derived(
    projectStore.currentProject?.data?.sourceFiles?.length ?? 0
  );

  const colorBlindnessState = $derived(getColorBlindnessState());
  const colorBlindnessMatrix = $derived(
    isColorBlindnessActive(colorBlindnessState)
      ? getColorBlindnessMatrix(colorBlindnessState.simulationType)
      : null
  );
  const visibleVisualizations = $derived.by(() => {
    void visualizationStore.version;

    return globalState.selectedStep === ToolbarStep.Data
      ? globalState.isMapExporting
        ? visualizationStore.activeVisualizations
        : []
      : visualizationStore.activeVisualizations;
  });

  let mapContainer = $state<HTMLDivElement | undefined>(undefined);
  let hasCalledOnReady = $state(false);
  let initStartTime = $state<number>(Date.now());
  let maxWaitTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let worldBaseTable = $state.raw<ArrowTable | null>(null);
  let resizeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let isSwitchingViewMode = $state(false);
  let pendingLayerUpdate = $state(false);
  let waitingForStyleIdle = false;
  let layerUpdateTimeoutId: ReturnType<typeof setTimeout> | null = null;

  let previousDatasetCount = 0;
  let pendingViewReset = false;
  let pendingOrthographicFit = $state(false);
  let pendingOrthographicFitReason = $state<ViewportFitReason>('dataset');
  let pendingMapLibreViewportPreset = $state<{
    bounds: LngLatBoundsLike;
    preferPreset: boolean;
  } | null>(null);
  let pendingViewportAutoRefitReason = $state<ViewportFitReason | null>(null);
  let lastMapViewportSnapshot: string | null = null;
  let pendingMapLibreManualInteraction = false;
  let pendingMapLibreSyncFrameId: number | null = null;
  let projectEmptyResetTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastLayoutSnapshot: string | null = null;
  let lastSelectedBasemapZone = getBasemapZone(basemapStyleStore.selectedStyle);

  let isApplyingMapLibreSync = false;

  let pendingOnReady = false;
  const isBlankCanvas = $derived(
    !hasData &&
      !worldBaseTable &&
      !basemapStyleStore.referenceBasemapId &&
      !osmBasemapStore.isActive
  );

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
      mapLayers.updateLayers(tables, geoJSONs, splitData, densityTables);
      requestAnimationFrame(() => {
        mapLoadingStore.setUpdatingLayers(false);
      });
    }, MAP_TIMING.LAYER_UPDATE_DEBOUNCE_MS);
  }

  function scheduleLayerUpdateAfterStyleIdle(
    map: MapLibreMap,
    source: string
  ): void {
    pendingLayerUpdate = true;
    requestAnimationFrame(() => {
      if (mapInit.map !== map) {
        return;
      }
      scheduleLayerUpdate(`${source}:frame`);
    });
    map.once('idle', () => {
      if (mapInit.map !== map) {
        return;
      }
      mapLayers.syncInterleavedLayerOrder();
      pendingLayerUpdate = false;
      scheduleLayerUpdate(source);
    });
  }

  function triggerOnReady() {
    if (hasCalledOnReady) return;

    if (referenceBasemap.isLoadingReferenceBasemap) {
      pendingOnReady = true;
      return;
    }

    if (maxWaitTimeoutId) {
      clearTimeout(maxWaitTimeoutId);
      maxWaitTimeoutId = null;
    }

    const elapsed = Date.now() - initStartTime;
    const remainingDelay = Math.max(
      0,
      MAP_TIMING.MIN_SKELETON_DISPLAY_MS - elapsed
    );

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
    }, MAP_TIMING.MAX_WAIT_FOR_DATA_MS);
  }

  function handleReferenceBasemapLoadComplete(): void {
    if (pendingOnReady) {
      pendingOnReady = false;
      triggerOnReady();
    }
  }

  const mapState = useMapState({
    getForcedVisualizationIds: () => forcedVisualizationIds
  });

  function cancelPendingMapLibreSync(): void {
    if (pendingMapLibreSyncFrameId !== null) {
      cancelAnimationFrame(pendingMapLibreSyncFrameId);
      pendingMapLibreSyncFrameId = null;
    }
  }

  function shouldApplyMapLibreSync(
    center: [number, number],
    zoom: number
  ): boolean {
    const map = mapInit.map;
    if (!map) {
      return false;
    }

    const currentCenter = map.getCenter();
    return (
      Math.abs(currentCenter.lng - center[0]) >
        MAP_TIMING.MAPLIBRE_SYNC_EPSILON ||
      Math.abs(currentCenter.lat - center[1]) >
        MAP_TIMING.MAPLIBRE_SYNC_EPSILON ||
      Math.abs(map.getZoom() - zoom) > MAP_TIMING.MAPLIBRE_SYNC_EPSILON
    );
  }

  function emitMapLibreSync(immediate: boolean = false): void {
    if (
      !onMoveSync ||
      mapInit.viewMode !== ViewMode.MAPLIBRE ||
      !mapInit.map ||
      isApplyingMapLibreSync
    ) {
      return;
    }

    const publish = () => {
      pendingMapLibreSyncFrameId = null;

      const map = mapInit.map;
      if (
        !map ||
        mapInit.viewMode !== ViewMode.MAPLIBRE ||
        isApplyingMapLibreSync
      ) {
        return;
      }

      const center = map.getCenter();
      onMoveSync({
        type: 'maplibre',
        center: [center.lng, center.lat],
        zoom: map.getZoom()
      });
    };

    cancelPendingMapLibreSync();

    if (immediate) {
      publish();
      return;
    }

    pendingMapLibreSyncFrameId = requestAnimationFrame(() => {
      publish();
    });
  }

  const mapInit = useMapInit({
    onMapLoaded: () => {
      const shouldUseMapLibre = shouldUseMapLibreInterleaved({
        requiresMapLibre: basemapStyleStore.requiresMapLibre,
        hasOSMBasemap: osmBasemapStore.isActive
      });

      if (shouldUseMapLibre && mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
        isSwitchingViewMode = true;
        mapInit.switchToMapLibreMode();
        return;
      }

      if (hasData) {
        scheduleLayerUpdate();
      } else {
        startMaxWaitTimeout();
        if (mapInit.viewMode === ViewMode.MAPLIBRE) {
          mapInstanceStore.applyPendingMapLibreRestore();
        }
      }
    },
    onZoom: () => mapInstanceStore.updateZoomFromMap(),
    onMoveEnd: () => {
      mapInstanceStore.persistCurrentMapLibreViewState();
      if (
        onMoveSync &&
        mapInit.viewMode === ViewMode.MAPLIBRE &&
        mapInit.map &&
        !isApplyingMapLibreSync
      ) {
        emitMapLibreSync(true);
      }
      isApplyingMapLibreSync = false;
    },
    getActiveVisualizations: () =>
      globalState.selectedStep === ToolbarStep.Data
        ? globalState.isMapExporting
          ? visualizationStore.activeVisualizations
          : []
        : visualizationStore.activeVisualizations,
    onOrthographicViewStateChanged: (target, zoom) => {
      mapInstanceStore.markViewportManual();
      onMoveSync?.({ type: 'orthographic', target, zoom });
    }
  });

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

  function hasManualProjectionOverride(): boolean {
    const projectionState = getProjectionState();
    return (
      projectionState.overrideActive === true &&
      projectionState.overrideSource === 'manual'
    );
  }

  // Bounds come from import-time ST_Extent metadata (or the curated catalog
  // bbox), except on the WGS84-reprojected render path where the rendered
  // table is measured so the fit stays in lon/lat space.
  function getRenderedDatasetBounds(datasetId: string | undefined) {
    return resolveOrthographicRenderedDatasetBounds({
      dataset: getRenderedDataset(datasetId),
      renderedTable: datasetId ? tables.get(datasetId) : null,
      hasManualProjectionOverride: hasManualProjectionOverride()
    });
  }

  function shouldPreferDatasetProjectionBbox(datasetBbox: BBox | null) {
    const projectionState = getProjectionState();
    return projectionState.overrideSource === 'manual' && Boolean(datasetBbox);
  }

  function resolveRenderedReferenceBounds(params: {
    datasetId: string | undefined;
    shouldUseBasemapReference: boolean;
  }): [[number, number], [number, number]] | null {
    const datasetBounds = getRenderedDatasetBounds(params.datasetId);
    const preferDatasetBbox = shouldPreferDatasetProjectionBbox(
      toBboxFromOrthographicBounds(datasetBounds)
    );

    if (params.shouldUseBasemapReference && !preferDatasetBbox) {
      const basemapMeta = getProjectionMetadataForDataset(params.datasetId);
      return toOrthographicBounds(basemapMeta?.bbox ?? null) ?? datasetBounds;
    }

    return datasetBounds;
  }

  function getProjectionMetadataForDataset(datasetId: string | undefined) {
    if (!datasetId) {
      return basemapService.currentMetadata;
    }

    if (basemapStyleStore.referenceBasemapId) {
      const resolvedBasemapId = getPreferredBasemapFile(
        basemapService.availableBasemaps,
        basemapStyleStore.referenceBasemapId
      );

      return resolveActiveBasemapMetadata({
        referenceBasemapId: basemapStyleStore.referenceBasemapId,
        resolvedBasemapId,
        availableBasemaps: basemapService.availableBasemaps,
        currentMetadata: basemapService.currentMetadata
      });
    }

    const duckDataset = getRenderedDuckDBDataset(datasetId);
    if (!duckDataset?.joinedBasemap) {
      return null;
    }

    const resolvedBasemapId = getPreferredBasemapFile(
      basemapService.availableBasemaps,
      duckDataset.joinedBasemap
    );

    return resolveActiveBasemapMetadata({
      referenceBasemapId: duckDataset.joinedBasemap,
      resolvedBasemapId,
      availableBasemaps: basemapService.availableBasemaps,
      currentMetadata: basemapService.currentMetadata
    });
  }

  function getProjectionFitBbox(): BBox | null {
    const currentBasemapMeta = getProjectionMetadataForDataset(firstDatasetId);
    const mainlandBbox = currentBasemapMeta
      ? getMainlandBboxForBasemap(
          currentBasemapMeta,
          basemapService.projectionPresets
        )
      : null;
    if (!firstDatasetId) {
      return mainlandBbox ?? currentBasemapMeta?.bbox ?? null;
    }

    const dataset = getRenderedDataset(firstDatasetId);
    const resolvedDatasetBbox = toBboxFromOrthographicBounds(
      getRenderedDatasetBounds(firstDatasetId)
    );

    const duckDataset = getRenderedDuckDBDataset(firstDatasetId);
    const shouldUseBasemapReference =
      shouldUseBasemapReferenceInOrthographicView(
        dataset,
        duckDataset,
        basemapStyleStore.referenceBasemapId
      );

    return resolveOrthographicProjectionFitBbox({
      datasetBbox: resolvedDatasetBbox,
      shouldUseBasemapReference,
      basemapMainlandBbox: mainlandBbox,
      basemapBbox: currentBasemapMeta?.bbox ?? null,
      preferDatasetBbox: shouldPreferDatasetProjectionBbox(resolvedDatasetBbox)
    });
  }

  const mapLayers = useMapLayers({
    getDeckOverlay: () => mapInit.deckOverlay,
    getDeckInstance: () => mapInit.deckInstance,
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    getWorldBaseTable: () => worldBaseTable,
    getActiveVisualizations: () => visibleVisualizations,
    buildLayerContextForViz: (viz) => mapState.buildLayerContextForViz(viz),
    getProjectionMetadataForDataset: (datasetId) =>
      getProjectionMetadataForDataset(datasetId),
    getProjectionFitBbox: () => getProjectionFitBbox(),
    getProjectionForSphereMask: () =>
      getOrthographicRenderProjection(
        getProjectionMetadataForDataset(firstDatasetId)
      ),
    getModelMatrix: () => renderModelMatrix,
    getPageDisplayScale: () => pageDisplayScale,
    getShouldRenderDatasetFallbacks: () =>
      globalState.selectedStep === ToolbarStep.Data,
    onBasemapLayersLoaded: () =>
      scheduleLayerUpdate('useMapLayers:basemapLayersLoaded'),
    onRepresentativePointTablesLoaded: () =>
      scheduleLayerUpdate('useMapLayers:representativePointTablesLoaded')
  });

  function updateCanvasSize() {
    projectionStore.updateCanvasSize({
      width: Math.max(1, Math.round(logicalMapCanvasWidth)),
      height: Math.max(1, Math.round(logicalMapCanvasHeight))
    });
  }

  function getProjectionViewportSize(): { width: number; height: number } {
    return {
      width: Math.max(1, logicalMapCanvasWidth),
      height: Math.max(1, logicalMapCanvasHeight)
    };
  }

  function applyMapLibreInteractionMode(): void {
    const map = mapInit.map;

    if (!map) {
      return;
    }
    syncMapLibreInteractionMode(map, zoomModeStore.isPageMode);
  }

  function applyOrthographicInteractionMode(): void {
    const deck = mapInit.deckInstance;

    if (!deck) {
      return;
    }
    syncOrthographicInteractionMode(
      deck as unknown as OrthographicInteractiveDeck,
      zoomModeStore.isPageMode
    );
  }

  function getCurrentViewportAutoFitReason(): ViewportFitReason {
    return mapInstanceStore.viewportFitReason ?? 'dataset';
  }

  function fitOrthographicViewport(
    reason: ViewportFitReason = 'dataset'
  ): void {
    if (mapInit.viewMode !== ViewMode.ORTHOGRAPHIC) {
      return;
    }

    if (mapInit.isMapLoaded) {
      mapInstanceStore.fitToOrthographicBounds(reason);
    } else {
      pendingOrthographicFit = true;
      pendingOrthographicFitReason = reason;
    }
  }

  function queueSuggestedPreviewViewportSettled(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        mapLoadingStore.markSuggestedPreviewViewportSettled();
      });
    });
  }

  function refreshOrthographicReferenceForFirstTable(
    basemapMeta: ReturnType<typeof getProjectionMetadataForDataset>
  ): boolean {
    if (!firstTable) {
      return false;
    }

    const refBasemapId = basemapStyleStore.referenceBasemapId;
    const dataset = getRenderedDataset(firstDatasetId);
    const duckDataset = getRenderedDuckDBDataset(firstDatasetId);
    const shouldUseBasemapReference =
      shouldUseBasemapReferenceInOrthographicView(
        dataset,
        duckDataset,
        refBasemapId
      );
    const bounds = resolveRenderedReferenceBounds({
      datasetId: firstDatasetId,
      shouldUseBasemapReference
    });

    if (!bounds) {
      return false;
    }

    const referenceState = resolveOrthographicReferenceState(
      dataset,
      bounds,
      basemapMeta,
      shouldUseBasemapReference
    );

    if (!referenceState.bbox) {
      return false;
    }

    projectionStore.setReferenceBbox(
      referenceState.bbox,
      undefined,
      referenceState.isProjected,
      referenceState.renderProjection
    );

    return true;
  }

  function getProjectionOverrideForRender(
    requiredSource?: 'auto' | 'manual'
  ): ProjectionLike | undefined {
    const projectionState = getProjectionState();
    const viewportSize = getProjectionViewportSize();
    const fitPaddingPx = logicalMapViewportFitPaddingPx;
    if (
      !projectionState.overrideActive ||
      (requiredSource && projectionState.overrideSource !== requiredSource)
    ) {
      return undefined;
    }

    return resolveUserProjectionOverride({
      state: projectionState,
      fitBbox: getProjectionFitBbox(),
      viewportSize,
      padding: fitPaddingPx,
      projectionPresets: basemapService.projectionPresets
    });
  }

  function getOrthographicRenderProjection(
    basemapMeta: ReturnType<typeof getProjectionMetadataForDataset>,
    allowManualOverride = true
  ): ProjectionLike | undefined {
    const projectionState = getProjectionState();
    return resolveOrthographicRenderProjection({
      basemapMeta,
      projectionState,
      viewportSize: getProjectionViewportSize(),
      projectionPresets: basemapService.projectionPresets,
      fitBbox: getProjectionFitBbox(),
      padding: logicalMapViewportFitPaddingPx,
      userOverride: getProjectionOverrideForRender(),
      allowManualOverride
    });
  }

  function resolveOrthographicReferenceState(
    dataset: ReturnType<typeof getRenderedDataset>,
    bounds: [[number, number], [number, number]] | null,
    basemapMeta: ReturnType<typeof getProjectionMetadataForDataset>,
    shouldUseBasemapReference: boolean
  ): {
    bbox: BBox | null;
    isProjected: boolean;
    renderProjection: ProjectionLike | null;
  } {
    const renderProjection =
      getOrthographicRenderProjection(basemapMeta, true) ?? null;

    return resolveSharedOrthographicReferenceState({
      dataset,
      bounds,
      basemapMeta,
      projectionPresets: basemapService.projectionPresets,
      viewportSize: getProjectionViewportSize(),
      shouldUseBasemapReference,
      renderProjection,
      preferDatasetBbox: shouldPreferDatasetProjectionBbox(
        toBboxFromOrthographicBounds(bounds)
      ),
      hasManualProjectionOverride: hasManualProjectionOverride()
    });
  }

  function resolveOrthographicBasemapReferenceState(
    basemapMeta: typeof basemapService.currentMetadata,
    basemapTable: ArrowTable | null
  ): {
    bbox: BBox | null;
    isProjected: boolean;
    renderProjection: ProjectionLike | null;
  } {
    const renderProjection =
      getOrthographicRenderProjection(basemapMeta, true) ?? null;

    return resolveSharedOrthographicBasemapReferenceState({
      basemapMeta,
      basemapTable,
      renderProjection,
      projectionPresets: basemapService.projectionPresets,
      viewportSize: getProjectionViewportSize()
    });
  }

  function syncOrthographicViewportAfterViewModeSwitch(
    reasonOverride?: ViewportFitReason,
    options: { fitViewport?: boolean } = {}
  ): void {
    if (mapInit.viewMode !== ViewMode.ORTHOGRAPHIC) {
      return;
    }

    const shouldFitViewport = options.fitViewport ?? true;
    const fitViewport = (reason: ViewportFitReason): void => {
      if (shouldFitViewport) {
        fitOrthographicViewport(reason);
      }
    };
    const refBasemapId = basemapStyleStore.referenceBasemapId;
    const currentWorldBaseTable = worldBaseTable;

    if (firstTable) {
      const dataset = getRenderedDataset(firstDatasetId);
      const duckDataset = getRenderedDuckDBDataset(firstDatasetId);
      const shouldUseBasemapReference =
        shouldUseBasemapReferenceInOrthographicView(
          dataset,
          duckDataset,
          refBasemapId
        );
      const bounds = resolveRenderedReferenceBounds({
        datasetId: firstDatasetId,
        shouldUseBasemapReference
      });

      if (bounds) {
        const currentBasemapMeta =
          getProjectionMetadataForDataset(firstDatasetId);
        const referenceState = resolveOrthographicReferenceState(
          dataset,
          bounds,
          currentBasemapMeta,
          shouldUseBasemapReference
        );

        if (referenceState.bbox) {
          projectionStore.setReferenceBbox(
            referenceState.bbox,
            undefined,
            referenceState.isProjected,
            referenceState.renderProjection
          );
        }

        fitViewport(
          reasonOverride ?? (shouldUseBasemapReference ? 'basemap' : 'dataset')
        );
        return;
      }

      if (shouldUseBasemapReference && projectionStore.referenceBbox) {
        fitViewport(reasonOverride ?? 'basemap');
        return;
      }

      const geoMetadata = firstTable.schema.metadata?.get('geo');
      if (geoMetadata) {
        projectionStore.setReferenceBboxFromMetadata(geoMetadata);
        fitViewport(reasonOverride ?? 'dataset');
        return;
      }
    }

    if (firstGeoJSON) {
      const useBasemapBounds = Boolean(refBasemapId) && currentWorldBaseTable;
      if (useBasemapBounds) {
        const referenceState = resolveOrthographicBasemapReferenceState(
          basemapService.currentMetadata,
          currentWorldBaseTable
        );

        if (referenceState.bbox) {
          projectionStore.setReferenceBbox(
            referenceState.bbox,
            undefined,
            referenceState.isProjected,
            referenceState.renderProjection
          );
          fitViewport(reasonOverride ?? 'basemap');
          return;
        }
      }

      const bounds = calculateBoundsFromGeoJSON(firstGeoJSON);

      if (bounds) {
        const [[minX, minY], [maxX, maxY]] = bounds as [
          [number, number],
          [number, number]
        ];
        projectionStore.setReferenceBbox(
          [minX, minY, maxX, maxY],
          undefined,
          false,
          null
        );
        fitViewport(reasonOverride ?? 'dataset');
        return;
      }
    }

    if (currentWorldBaseTable) {
      const referenceState = resolveOrthographicBasemapReferenceState(
        basemapService.currentMetadata,
        currentWorldBaseTable
      );

      if (referenceState.bbox) {
        projectionStore.setReferenceBbox(
          referenceState.bbox,
          undefined,
          referenceState.isProjected,
          referenceState.renderProjection
        );
        fitViewport(reasonOverride ?? 'basemap');
        return;
      }
    }
  }

  // Catalog basemaps always carry a curated WGS84 bbox in their metadata; the
  // geometry table is never scanned for it.
  function getCatalogBasemapBounds():
    [[number, number], [number, number]] | null {
    const bbox = basemapService.currentMetadata?.bbox;
    return bbox
      ? [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]]
        ]
      : null;
  }

  function resolveUserDataBounds() {
    if (firstTable) {
      const bounds = calculateBoundsFromGeoArrow(firstTable);
      if (bounds) {
        return bounds;
      }
    }
    if (firstGeoJSON) {
      const bounds = calculateBoundsFromGeoJSON(firstGeoJSON);
      if (bounds) {
        return bounds;
      }
    }
    return null;
  }

  function applyPendingMapLibreViewportPreset(): void {
    if (
      !pendingMapLibreViewportPreset ||
      mapInit.viewMode !== ViewMode.MAPLIBRE ||
      !mapInit.map
    ) {
      return;
    }

    const { bounds: presetBounds, preferPreset } =
      pendingMapLibreViewportPreset;
    pendingMapLibreViewportPreset = null;

    // `preferPreset` makes every pending viewport consumer frame the chosen zone.
    const dataBounds = preferPreset ? null : resolveUserDataBounds();
    mapBounds.fitToBounds(dataBounds ?? presetBounds, {
      animate: true,
      reason: dataBounds ? 'dataset' : 'basemap'
    });
  }

  function fitMapLibreViewportAfterViewModeSwitch(
    reason: ViewportFitReason = 'dataset'
  ): void {
    if (mapInit.viewMode !== ViewMode.MAPLIBRE || !mapInit.map) {
      return;
    }

    if (mapInstanceStore.applyPendingMapLibreRestore()) {
      return;
    }

    if (
      pendingMapLibreViewportPreset?.preferPreset ||
      (reason === 'basemap' && pendingMapLibreViewportPreset)
    ) {
      applyPendingMapLibreViewportPreset();
      return;
    }

    const dataBounds = resolveUserDataBounds();
    if (dataBounds) {
      mapBounds.fitToBounds(dataBounds, { reason });
      return;
    }

    const refBasemapId = basemapStyleStore.referenceBasemapId;
    const currentWorldBaseTable = worldBaseTable;

    if (refBasemapId && currentWorldBaseTable) {
      const bounds = getCatalogBasemapBounds();
      if (bounds) {
        mapBounds.fitToBounds(bounds, { reason });
        return;
      }
    }

    const styleViewportPreset = getBasemapViewportPreset(
      basemapStyleStore.selectedStyle
    );
    if (styleViewportPreset) {
      mapBounds.fitToBounds(styleViewportPreset.bounds, { reason });
      return;
    }

    if (currentWorldBaseTable) {
      const bounds = getCatalogBasemapBounds();
      if (bounds) {
        mapBounds.fitToBounds(bounds, { reason });
      }
    }
  }

  function hasPendingViewportRestore(): boolean {
    return mapInit.viewMode === ViewMode.MAPLIBRE
      ? mapInstanceStore.hasPendingMapLibreRestore
      : mapInstanceStore.hasPendingOrthographicRestore;
  }

  function shouldPreserveManualViewport(): boolean {
    return (
      !mapInstanceStore.isViewportAutoFitManaged && !hasPendingViewportRestore()
    );
  }

  const mapBasemap = useMapBasemap({
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    onProjectionChanged: () => {
      if (!isSwitchingViewMode) {
        scheduleLayerUpdate('onProjectionChanged');
      }
    },
    onStyleChangeRequested: () => {
      const map = mapInit.map;
      if (mapInit.viewMode === ViewMode.MAPLIBRE && map) {
        scheduleLayerUpdateAfterStyleIdle(map, 'onStyleChangeRequested');
      }
    },
    onStyleLoaded: () => {
      mapBasemap.syncOSMRasterLayer();
      mapBasemap.syncBasemapLanguage();
      mapBasemap.syncLabelsVisibility();
      mapBasemap.syncGroupVisibility();

      mapBasemap.syncProjection();
      applyPendingMapLibreViewportPreset();
      waitingForStyleIdle = false;
      mapLayers.syncInterleavedLayerOrder();
      const hadPendingLayerUpdate = pendingLayerUpdate;
      pendingLayerUpdate = false;
      scheduleLayerUpdate(
        hadPendingLayerUpdate ? 'onStyleLoaded-pending' : 'onStyleLoaded'
      );
    }
  });

  const mapBounds = useMapBounds({
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    getDatasetId: () => firstDatasetId,
    getFitPaddingPx: () => mapViewportFitPaddingPx,
    onBoundsUpdated: (zoom) => {
      mapInstanceStore.setBaseZoomLevel(zoom);
    },
    onFitComplete: () => {
      mapLoadingStore.markSuggestedPreviewViewportSettled();
      triggerOnReady();
    }
  });

  // Layer-order version changes reschedule rendering so the GPU stack matches the panel.
  $effect(() => {
    void layerOrderStore.version;
    scheduleLayerUpdate('effect:layerOrder');
  });

  // Off-main-thread geometry parses fill their cache asynchronously; each
  // completion bumps this version so the layer pass re-runs and picks up the
  // parsed buffers.
  $effect(() => {
    void trackWorkerParseVersion();
    scheduleLayerUpdate('effect:workerParse');
  });

  $effect(() => {
    const map = mapInit.map;
    if (!map) {
      return;
    }

    const markInteractionPending = () => {
      pendingMapLibreManualInteraction = true;
    };
    const markManualIfNeeded = () => {
      if (!pendingMapLibreManualInteraction) {
        return;
      }
      pendingMapLibreManualInteraction = false;
      mapInstanceStore.markViewportManual();
    };

    map.on('dragstart', markInteractionPending);
    map.on('wheel', markInteractionPending);
    map.on('dblclick', markInteractionPending);
    map.on('touchstart', markInteractionPending);
    map.on('moveend', markManualIfNeeded);
    map.on('zoomend', markManualIfNeeded);

    return () => {
      pendingMapLibreManualInteraction = false;
      map.off('dragstart', markInteractionPending);
      map.off('wheel', markInteractionPending);
      map.off('dblclick', markInteractionPending);
      map.off('touchstart', markInteractionPending);
      map.off('moveend', markManualIfNeeded);
      map.off('zoomend', markManualIfNeeded);
    };
  });

  $effect(() => {
    const map = mapInit.map;
    const isMapLibreSyncActive =
      Boolean(onMoveSync) && mapInit.viewMode === ViewMode.MAPLIBRE;

    if (!map || !isMapLibreSyncActive) {
      cancelPendingMapLibreSync();
      return;
    }

    const scheduleMapLibreSync = () => {
      emitMapLibreSync(false);
    };

    map.on('move', scheduleMapLibreSync);

    return () => {
      cancelPendingMapLibreSync();
      map.off('move', scheduleMapLibreSync);
    };
  });

  $effect(() => {
    if (
      !mapInit.isMapLoaded ||
      (mapInit.viewMode !== ViewMode.ORTHOGRAPHIC &&
        mapInit.viewMode !== ViewMode.MAPLIBRE)
    ) {
      return;
    }

    mapInit.setRenderPixelRatio(renderPixelRatio);
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
      if (
        mapInit.isMapLoaded &&
        !isSwitchingViewMode &&
        mapInstanceStore.isViewportAutoFitManaged &&
        !hasPendingViewportRestore()
      ) {
        pendingViewportAutoRefitReason = getCurrentViewportAutoFitReason();
      }

      if (!globalState.isResizingMapFrame) {
        annotationsActions.redistributePageElements({
          width: fmtState.width,
          height: fmtState.height,
          margins
        });
      }
      if (mapInit.isMapLoaded && !isSwitchingViewMode) {
        scheduleLayerUpdate('effect:formatLayoutChange');
      }
    });
  });

  $effect(() => {
    void mapCanvasWidth;
    void mapCanvasHeight;
    void logicalMapCanvasWidth;
    void logicalMapCanvasHeight;
    void mapViewportFitPaddingPx;
    void logicalMapViewportFitPaddingPx;

    const viewportSnapshot = `${logicalMapCanvasWidth}x${logicalMapCanvasHeight}-${logicalMapViewportFitPaddingPx}`;
    const hasViewportChanged =
      lastMapViewportSnapshot !== null &&
      viewportSnapshot !== lastMapViewportSnapshot;
    lastMapViewportSnapshot = viewportSnapshot;

    untrack(() => {
      projectionStore.setRenderScale(pageDisplayScale);
      projectionStore.setFitPadding(logicalMapViewportFitPaddingPx);
      updateCanvasSize();
      if (mapInit.isMapLoaded && !isSwitchingViewMode) {
        if (mapInit.viewMode === ViewMode.MAPLIBRE) {
          mapInit.map?.resize();
        } else if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
          scheduleLayerUpdate('effect:canvasResize');
          if (mapInstanceStore.hasPendingOrthographicRestore) {
            mapInstanceStore.fitToOrthographicBounds();
          }
        }

        if (
          hasViewportChanged &&
          mapInstanceStore.isViewportAutoFitManaged &&
          !hasPendingViewportRestore()
        ) {
          pendingViewportAutoRefitReason = getCurrentViewportAutoFitReason();
        }
      }
    });
  });

  $effect(() => {
    void zoomModeStore.mode;
    void mapInit.viewMode;
    void mapInit.map;
    void mapInit.deckInstance;

    untrack(() => {
      if (mapInit.viewMode === ViewMode.MAPLIBRE) {
        applyMapLibreInteractionMode();
        return;
      }

      if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
        applyOrthographicInteractionMode();
      }
    });
  });

  $effect(() => {
    const reason = pendingViewportAutoRefitReason;
    if (
      !reason ||
      !mapInit.isMapLoaded ||
      isSwitchingViewMode ||
      hasPendingViewportRestore()
    ) {
      return;
    }

    pendingViewportAutoRefitReason = null;

    untrack(() => {
      if (mapInit.viewMode === ViewMode.MAPLIBRE) {
        requestAnimationFrame(() => {
          fitMapLibreViewportAfterViewModeSwitch(reason);
        });
        return;
      }

      if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
        fitOrthographicViewport(reason);
      }
    });
  });

  $effect(() => {
    void osmBasemapStore.tileConfig;

    const hasDeckContext = mapInit.deckOverlay || mapInit.deckInstance;
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

      const shouldUseMapLibre = shouldUseMapLibreInterleaved({
        requiresMapLibre,
        hasOSMBasemap: osmActive
      });

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
      untrack(() => {
        if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
          syncOrthographicViewportAfterViewModeSwitch();
        } else if (mapInit.viewMode === ViewMode.MAPLIBRE) {
          fitMapLibreViewportAfterViewModeSwitch('basemap');
        }
      });
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
      untrack(() =>
        mapInstanceStore.fitToOrthographicBounds(pendingOrthographicFitReason)
      );
    }
  });

  $effect(() => {
    const simplificationState = getSimplificationState();
    const lastApplied = simplificationState.lastApplied;

    if (lastApplied) {
      untrack(() => {
        const resolvedGeometry = basemapService.currentGeometryTable;
        if (resolvedGeometry) {
          worldBaseTable = resolvedGeometry;
        }
      });
    }
  });

  let lastFittedDatasetId = $state<string | undefined>(undefined);

  $effect(() => {
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (firstTable && canUpdate) {
      const shouldFit = firstDatasetId !== lastFittedDatasetId;
      if (shouldFit) {
        lastFittedDatasetId = firstDatasetId;
      }
      const preserveManualViewport = untrack(() =>
        shouldPreserveManualViewport()
      );
      const shouldFitViewport = shouldFit && !preserveManualViewport;
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

        if (
          untrack(() =>
            refreshOrthographicReferenceForFirstTable(
              getProjectionMetadataForDataset(firstDatasetId)
            )
          )
        ) {
          untrack(() => {
            scheduleLayerUpdate('effect:firstTable-bounds');
            if (shouldFitViewport) fitOrthographicViewport('dataset');
          });
          triggerOnReady();
        } else if (shouldUseBasemapReference && projectionStore.referenceBbox) {
          untrack(() => {
            if (shouldFitViewport) fitOrthographicViewport('basemap');
          });
          triggerOnReady();
        } else if (!shouldUseBasemapReference) {
          const geoMetadata = firstTable.schema.metadata?.get('geo');
          if (geoMetadata) {
            untrack(() => {
              projectionStore.setReferenceBboxFromMetadata(geoMetadata);
              scheduleLayerUpdate('effect:firstTable-metadata');
              if (shouldFitViewport) fitOrthographicViewport('dataset');
            });
            triggerOnReady();
          }
        }
      } else if (mapInit.map && shouldFit) {
        if (mapInstanceStore.applyPendingMapLibreRestore()) {
          triggerOnReady();
          return;
        }
        if (preserveManualViewport) {
          triggerOnReady();
          return;
        }
        const hasOwnDataGeometry = Boolean(
          calculateBoundsFromGeoArrow(firstTable)
        );
        if (hasOwnDataGeometry) {
          untrack(() =>
            mapBounds.fitToArrowBounds(firstTable, firstDatasetId, {
              reason: 'dataset'
            })
          );
        } else if (refBasemapId && worldBaseTable) {
          const bBounds = getCatalogBasemapBounds();
          if (bBounds) {
            untrack(() =>
              mapBounds.fitToBounds(bBounds, {
                animate: true,
                reason: 'basemap'
              })
            );
          }
        }
      }
    }
  });

  $effect(() => {
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (firstGeoJSON && canUpdate) {
      if (mapInit.viewMode === ViewMode.MAPLIBRE && mapInit.map) {
        if (mapInstanceStore.applyPendingMapLibreRestore()) {
          triggerOnReady();
          return;
        }
        if (untrack(() => shouldPreserveManualViewport())) {
          triggerOnReady();
          return;
        }
        untrack(() =>
          mapBounds.fitToGeoJSONBounds(firstGeoJSON, {
            reason: 'dataset'
          })
        );
      } else if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
        untrack(() => {
          const preserveManualViewport = shouldPreserveManualViewport();
          const refBasemapId = basemapStyleStore.referenceBasemapId;
          if (refBasemapId && worldBaseTable) {
            const referenceState = resolveOrthographicBasemapReferenceState(
              basemapService.currentMetadata,
              worldBaseTable
            );

            if (referenceState.bbox) {
              projectionStore.setReferenceBbox(
                referenceState.bbox,
                undefined,
                referenceState.isProjected,
                referenceState.renderProjection
              );
              scheduleLayerUpdate('effect:firstGeoJSON-basemap');
              if (!preserveManualViewport) fitOrthographicViewport('basemap');
              return;
            }
          }

          const bounds = calculateBoundsFromGeoJSON(firstGeoJSON);
          if (bounds) {
            const [[minX, minY], [maxX, maxY]] = bounds as [
              [number, number],
              [number, number]
            ];
            projectionStore.setReferenceBbox(
              [minX, minY, maxX, maxY],
              undefined,
              false,
              null
            );
            scheduleLayerUpdate('effect:firstGeoJSON');
            if (!preserveManualViewport) fitOrthographicViewport('dataset');
          }
        });
        triggerOnReady();
      } else {
        triggerOnReady();
      }
    }
  });

  $effect(() => {
    void basemapService.projectionPresets;
    untrack(() => scheduleLayerUpdate('effect:projectionPresets'));
  });

  $effect(() => {
    const currentCount = datasetsStore.datasets.length;
    const currentProjectSourceFileCount = untrack(
      () => projectStore.currentProject?.data?.sourceFiles?.length ?? 0
    );
    const visualizationCount = visualizationStore.visualizations.length;

    if (currentCount > 0) {
      previousDatasetCount = currentCount;
      if (projectEmptyResetTimeoutId) {
        clearTimeout(projectEmptyResetTimeoutId);
        projectEmptyResetTimeoutId = null;
      }
    }

    if (currentCount === 0 && previousDatasetCount > 0 && mapInit.isMapLoaded) {
      if (visualizationCount > 0) {
        return;
      }

      if (currentProjectSourceFileCount > 0) {
        return;
      }

      if (projectEmptyResetTimeoutId) {
        return;
      }

      projectEmptyResetTimeoutId = setTimeout(() => {
        projectEmptyResetTimeoutId = null;

        const datasetsCountNow = datasetsStore.datasets.length;
        const sourceFileCountAfterDelay =
          projectStore.currentProject?.data?.sourceFiles?.length ?? 0;
        const visualizationCountNow = visualizationStore.visualizations.length;
        if (
          datasetsCountNow !== 0 ||
          sourceFileCountAfterDelay > 0 ||
          visualizationCountNow > 0 ||
          !mapInit.isMapLoaded
        ) {
          return;
        }

        previousDatasetCount = 0;

        pendingViewReset = true;
        projectionStore.clear();
        mapBounds.resetFitState();
        basemapStyleStore.reset();
        basemapLayersStore.resetToDefaults();
        worldBaseTable = null;
        scheduleLayerUpdate('effect:projectEmpty');
      }, MAP_TIMING.PROJECT_EMPTY_RESET_DEBOUNCE_MS);
    }
  });

  $effect(() => {
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    const currentSourceFileCount = sourceFileCount;
    const refId = basemapStyleStore.referenceBasemapId;
    if (!hasData && canUpdate) {
      untrack(() => {
        scheduleLayerUpdate('effect:noData');
        if (!worldBaseTable && !refId && currentSourceFileCount === 0) {
          triggerOnReady();
        }
      });
    }
  });

  $effect(() => {
    const dataPresent = hasData;
    const refId = basemapStyleStore.referenceBasemapId;
    const currentSourceFileCount = sourceFileCount;

    if (
      (dataPresent || currentSourceFileCount > 0) &&
      !refId &&
      worldBaseTable
    ) {
      worldBaseTable = null;
      untrack(() => scheduleLayerUpdate('effect:clearDefaultBasemapForData'));
    }
  });

  $effect(() => {
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (worldBaseTable && canUpdate) {
      untrack(() => {
        scheduleLayerUpdate('effect:worldBaseTable');

        if (!hasData) {
          triggerOnReady();

          if (pendingViewReset && worldBaseTable) {
            pendingViewReset = false;
            if (mapInit.viewMode === ViewMode.MAPLIBRE && mapInit.map) {
              const preset = getBasemapViewportPreset(
                basemapStyleStore.selectedStyle
              );
              if (preset) {
                mapBounds.fitToBounds(preset.bounds, {
                  animate: true,
                  reason: 'reset'
                });
              } else {
                const bounds = getCatalogBasemapBounds();
                if (bounds) {
                  mapBounds.fitToBounds(bounds, {
                    animate: true,
                    reason: 'reset'
                  });
                }
              }
            } else if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
              fitOrthographicViewport('reset');
            }
            // Orthographic reference bbox was refreshed by updateProjectionFromTable().
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
    const selectedStyle = basemapStyleStore.selectedStyle;
    const isMapLoaded = mapInit.isMapLoaded;
    const viewMode = mapInit.viewMode;
    const map = mapInit.map;
    const nextZone = getBasemapZone(selectedStyle);
    const previousZone = lastSelectedBasemapZone;
    lastSelectedBasemapZone = nextZone;

    if (
      selectedStyle !== BasemapStyle.BLANK_WHITE &&
      isMapLoaded &&
      viewMode === ViewMode.MAPLIBRE &&
      map
    ) {
      untrack(() =>
        scheduleLayerUpdateAfterStyleIdle(map, 'effect:selectedStyle-idle')
      );
    }

    if (
      selectedStyle === BasemapStyle.BLANK_WHITE ||
      !previousZone ||
      !nextZone ||
      previousZone === nextZone
    ) {
      return;
    }

    const preset = getBasemapViewportPreset(selectedStyle);
    if (preset) {
      pendingMapLibreViewportPreset = {
        bounds: preset.bounds,
        preferPreset: false
      };
    }
  });

  $effect(() => {
    void basemapStyleStore.showLabels;
    untrack(() => mapBasemap.syncLabelsVisibility());
  });

  $effect(() => {
    void getLocale();
    untrack(() => mapBasemap.syncBasemapLanguage());
  });

  $effect(() => {
    void basemapStyleStore.groupVisibilityVersion;
    untrack(() => mapBasemap.syncGroupVisibility());
  });

  $effect(() => {
    void basemapStyleStore.viewportRequestVersion;

    const requestedStyle = basemapStyleStore.requestedViewportStyle;
    const preferPreset = basemapStyleStore.requestedViewportPreferPreset;
    const preset = requestedStyle
      ? getBasemapViewportPreset(requestedStyle)
      : null;

    if (!preset) {
      return;
    }

    pendingMapLibreViewportPreset = { bounds: preset.bounds, preferPreset };

    untrack(() => {
      if (
        mapInit.isMapLoaded &&
        mapInit.viewMode === ViewMode.MAPLIBRE &&
        !isSwitchingViewMode &&
        !mapBasemap.isStyleLoading &&
        mapInit.map?.isStyleLoaded()
      ) {
        applyPendingMapLibreViewportPreset();
      }
    });
  });

  $effect(() => {
    void mapProjectionStore.projection;
    untrack(() => {
      mapBasemap.syncProjection();

      if (
        mapInit.isMapLoaded &&
        mapInit.viewMode === ViewMode.MAPLIBRE &&
        !isSwitchingViewMode &&
        !mapBasemap.isStyleLoading
      ) {
        fitMapLibreViewportAfterViewModeSwitch('projection');
      }
    });
  });

  const projectionRenderTrigger = $derived.by(() => {
    const projectionState = getProjectionState();

    return `${buildProjectionRenderKey(projectionState)}|${mapProjectionStore.projection}`;
  });

  const layerUpdateTrigger = $derived({
    vizVersion: visualizationStore.version,
    basemapVersion: basemapLayersStore.version,
    basemapAuxVersion: basemapAuxLayersStore.version,
    basemapStyleVersion: basemapStyleStore.styleVersion,
    fontVersion: fontAssetsStore.version,
    highlightVersion: mapHighlightStore.version,
    dataVersion,
    dataSize: `${tables.size}-${geoJSONs.size}`,
    rowScopeVersion: rowScopeStore.version,
    projectionVersion: projectionRenderTrigger,
    selectedStep: globalState.selectedStep,
    isMapExporting: globalState.isMapExporting
  });

  $effect(() => {
    void layerUpdateTrigger;

    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (canUpdate) {
      untrack(() => scheduleLayerUpdate('effect:layerUpdateTrigger'));
    }
  });

  $effect(() => {
    void projectionRenderTrigger;

    if (
      mapInit.isMapLoaded &&
      mapInit.viewMode === ViewMode.ORTHOGRAPHIC &&
      !isSwitchingViewMode
    ) {
      untrack(() => {
        syncOrthographicViewportAfterViewModeSwitch('projection', {
          fitViewport: false
        });
        scheduleLayerUpdate('effect:projectionRenderTrigger');
      });
    }
  });

  const referenceBasemap = useMapReferenceBasemap({
    getIsMapLoaded: () => mapInit.isMapLoaded,
    getViewMode: () => mapInit.viewMode,
    getMap: () => mapInit.map,
    getHasData: () => hasData,
    getIsSwitchingViewMode: () => isSwitchingViewMode,
    setWorldBaseTable: (table) => {
      worldBaseTable = table;
    },
    scheduleLayerUpdate,
    fitMapLibreBounds: (bounds) =>
      mapBounds.fitToBounds(bounds, {
        animate: true,
        reason: 'basemap'
      }),
    shouldPreserveManualViewport,
    queueSuggestedPreviewViewportSettled,
    resolveOrthographicBasemapReferenceState,
    requestPendingOrthographicFit: (reason) => {
      pendingOrthographicFit = true;
      pendingOrthographicFitReason = reason;
    },
    triggerOnReady,
    onReferenceBasemapLoadComplete: handleReferenceBasemapLoadComplete
  });

  $effect(() => {
    const sv = syncViewState;
    const deck = mapInit.deckInstance;
    const map = mapInit.map;
    if (!sv) return;

    if (sv.type === 'orthographic' && sv.target && deck) {
      const zoomBounds = resolveOrthographicZoomBounds();
      const orthographicViewState: DeckOrthographicViewStateMap = {
        main: {
          target: sv.target,
          zoom: sv.zoom,
          minZoom: zoomBounds.minZoom,
          maxZoom: zoomBounds.maxZoom
        }
      };
      deck.setProps({
        viewState: orthographicViewState as Parameters<
          typeof deck.setProps
        >[0]['viewState']
      });
    } else if (sv.type === 'maplibre' && sv.center && map) {
      if (!shouldApplyMapLibreSync(sv.center, sv.zoom)) {
        return;
      }

      isApplyingMapLibreSync = true;
      map.jumpTo({ center: sv.center, zoom: sv.zoom });
    }
  });

  onMount(() => {
    if (!mapContainer) {
      return;
    }

    const container = mapContainer;

    const initialViewMode = shouldUseMapLibreInterleaved({
      requiresMapLibre: basemapStyleStore.requiresMapLibre,
      hasOSMBasemap: osmBasemapStore.isActive
    })
      ? ViewMode.MAPLIBRE
      : ViewMode.ORTHOGRAPHIC;
    mapInit.initialize(container, initialViewMode);

    updateCanvasSize();

    referenceBasemap.markInitialLoadingIfNeeded();

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();

      const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
      if (canUpdate && mapInit.viewMode === ViewMode.MAPLIBRE) {
        mapInit.map?.resize();
      }

      if (canUpdate) {
        if (resizeTimeoutId) {
          clearTimeout(resizeTimeoutId);
        }
        resizeTimeoutId = setTimeout(() => {
          scheduleLayerUpdate('resizeObserver');
          resizeTimeoutId = null;
        }, MAP_TIMING.MAP_RESIZE_DEBOUNCE_MS);
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      mapInit.destroy();
      projectionStore.reset();
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

{#if isFacetCell}
  <div
    class="map-stage facet-cell-stage"
    style="width: {width}px; height: {height}px;{colorBlindnessMatrix
      ? ' filter: url(#color-blindness-filter);'
      : ''}"
  >
    <div
      bind:this={mapContainer}
      class="map-canvas"
      style={mapCanvasStyle}
    ></div>

    {#if isSwitchingViewMode}
      <div class="view-mode-loader" transition:fade={{ duration: 200 }}>
        <SkeletonPlaceholder style="width: 100%; height: 100%;" />
      </div>
    {/if}
  </div>
{:else}
  <div class="page-container" style={pageStyle}>
    {#if showPageGrid}
      <PageGridOverlay displayScale={pageDisplayScale} />
    {/if}

    <div
      class="map-stage"
      class:is-empty={isBlankCanvas}
      style="width: {mapCanvasWidth}px; height: {mapCanvasHeight}px;{colorBlindnessMatrix
        ? ' filter: url(#color-blindness-filter);'
        : ''}"
    >
      <div
        bind:this={mapContainer}
        class="map-canvas"
        class:is-empty={isBlankCanvas}
        style={mapCanvasStyle}
      ></div>

      {#if isSwitchingViewMode}
        <div class="view-mode-loader" transition:fade={{ duration: 200 }}>
          <SkeletonPlaceholder style="width: 100%; height: 100%;" />
        </div>
      {/if}

      {#if showGeoIndicationsOverlay}
        <GeoIndicationsOverlay
          interactive={isStylingMode}
          hidden={!isStylingMode}
        />
      {/if}
    </div>

    {#if showLegendOverlay}
      <div class="legend-stage" style={legendStageStyle}>
        <LegendOverlay hidden={!showLegendPreview} />
      </div>
    {/if}

    {#if showAnnotationOverlay}
      <AnnotationOverlay interactive={isStylingMode} hidden={!isStylingMode} />
    {/if}
  </div>
{/if}

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

  .legend-stage {
    position: absolute;
    pointer-events: none;
  }

  .map-stage.is-empty {
    background: #ffffff;
  }

  .map-canvas.is-empty :global(canvas) {
    opacity: 0;
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
