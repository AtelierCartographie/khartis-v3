<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import { SkeletonPlaceholder } from 'carbon-components-svelte';
  import type { LngLatBoundsLike } from 'maplibre-gl';
  import { onMount, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { basemapStyleStore } from '../../commons/store/basemap-style.store.svelte';
  import {
    BasemapStyle,
    getBasemapViewportPreset,
    getBasemapZone
  } from '../constants/basemap-styles';
  import { hslToHex } from '../../commons/utils/color-utils';
  import { LogCategory, logger } from '../../commons/utils/logger';
  import {
    mapInstanceStore,
    type ViewportFitReason
  } from '../../commons/store/map-instance.store.svelte';
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
  import {
    basemapService,
    getPreferredBasemapFile
  } from '../services/basemap.service.svelte';
  import { shouldUseIdentityProjectionForDatasetCrs } from '../utils/dataset-crs';
  import { basemapLayersStore } from '../stores/basemap-layers.store.svelte';
  import { mapHighlightStore } from '../stores/map-highlight.store.svelte';
  import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
  import { projectionStore } from '../stores/projection.store.svelte';
  import { mapProjectionStore } from '../stores/map-projection.store.svelte';
  import { mapLoadingStore } from '../stores/map-loading.store.svelte';
  import { globalState } from '$lib/features/commons/store/global.svelte';
  import { zoomModeStore } from '$lib/features/commons/store/zoom-mode.store.svelte';
  import { FormatMode } from '$lib/features/commons/constants/ui.constants';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { resolveLayoutSizingTokens } from '$lib/features/commons/utils/layout-sizing.utils';
  import type {
    BBox,
    DeckMapProps,
    DeckOrthographicViewStateMap
  } from '../types';
  import {
    DEFAULT_PAGE_COLOR,
    getFormatState
  } from '../../step-toolbar/tools/format/format.store.svelte';
  import { getSimplificationState } from '../../step-toolbar/tools/simplification/simplification.store.svelte';
  import { getProjectionState } from '../../step-toolbar/tools/projections/projection.store.svelte';
  import { buildProjectionRenderKey } from '../../step-toolbar/tools/projections/projection-render-key';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { getFiltersMap } from '$lib/features/duckdb/orchestrator/state.svelte';
  import { annotationsActions } from '$lib/features/step-toolbar/tools/annotations/annotations.store.svelte';
  import { getColorBlindnessState } from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.store.svelte';
  import { getColorBlindnessMatrix } from '$lib/features/step-toolbar/tools/color-blindness/color-blindness.filter';
  import {
    resolveOrthographicDatasetBounds,
    resolveOrthographicReferenceBbox,
    resolveOrthographicReferenceTable,
    shouldUseBasemapReferenceInOrthographicView
  } from '../utils/orthographic-reference';
  import {
    buildProjectionForBasemap,
    computeProjectedBboxForProjection,
    getMainlandBboxForBasemap
  } from '../utils/geoarrow-stream-bridge';
  import { fitBasemapRenderProjection } from '../utils/fit-basemap-render-projection.utils';
  import { buildProjectionMaskPath } from '../utils/projection-mask.utils';
  import { resolveProjectionForRender } from '../utils/projection-priority';
  import { resolveUserProjectionOverride } from '../utils/user-projection.utils';
  import {
    getBrowserMaxRenderBufferSizePx,
    resolveMapRenderPixelRatio
  } from '../utils/render-pixel-ratio';
  import {
    type OrthographicInteractiveDeck,
    syncMapLibreInteractionMode,
    syncOrthographicInteractionMode
  } from '../utils/map-interaction-mode.utils';
  import type { ProjectionLike } from 'geoarrow-deck-stream';
  import AnnotationOverlay from './annotation-overlay.svelte';
  import GeoIndicationsOverlay from './geo-indications-overlay.svelte';
  import LegendOverlay from './legend-overlay.svelte';

  let {
    tables,
    densityTables,
    splitData,
    geoJSONs,
    dataVersion = 0,
    width,
    height,
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
    resolveLayoutSizingTokens({
      width: fmtState.width,
      height: fmtState.height,
      model: fmtState.mode === FormatMode.PRESET ? fmtState.model : 'custom'
    })
  );
  const mapViewportFitPaddingPx = $derived(
    layoutSizingTokens.mapViewport.fitPaddingPx
  );
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
  const projectionMaskPath = $derived.by(() => {
    if (mapInit.viewMode !== ViewMode.ORTHOGRAPHIC) {
      return null;
    }

    if (getProjectionState().overrideSource !== 'manual') {
      return null;
    }

    const basemapMeta =
      getProjectionMetadataForDataset(firstDatasetId) ??
      basemapService.currentMetadata;
    const renderProjection = getOrthographicRenderProjection(basemapMeta);

    return buildProjectionMaskPath({
      projection: renderProjection,
      width: mapCanvasWidth,
      height: mapCanvasHeight
    });
  });
  const maxRenderBufferSizePx = $derived(getBrowserMaxRenderBufferSizePx());
  const renderPixelRatio = $derived.by(() =>
    resolveMapRenderPixelRatio(
      typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      globalState.zoom.pageZoomScale,
      Math.max(mapCanvasWidth, mapCanvasHeight),
      maxRenderBufferSizePx
    )
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
  const visibleVisualizations = $derived.by(() =>
    globalState.selectedStep === ToolbarStep.Data
      ? []
      : mapState.activeVisualizations
  );

  const MIN_SKELETON_DURATION_MS = 500;
  const MAX_WAIT_FOR_DATA_MS = 5000;

  let mapContainer: HTMLDivElement;
  let hasCalledOnReady = $state(false);
  let projectionMaskId = $state<string | null>(null);
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
  let renderPixelRatioTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const LAYER_UPDATE_DEBOUNCE_MS = 16;
  const PROJECT_EMPTY_RESET_DEBOUNCE_MS = 250;

  let previousDatasetCount = 0;
  let pendingViewReset = false;
  let pendingOrthographicFit = $state(false);
  let pendingOrthographicFitReason = $state<ViewportFitReason>('dataset');
  let pendingMapLibreViewportPreset = $state<LngLatBoundsLike | null>(null);
  let pendingViewportAutoRefitReason = $state<ViewportFitReason | null>(null);
  let lastMapViewportSnapshot: string | null = null;
  let pendingMapLibreManualInteraction = false;
  let projectEmptyResetTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastDatasetCountSnapshot = -1;
  let lastLayoutSnapshot: string | null = null;
  let lastSelectedBasemapZone = getBasemapZone(basemapStyleStore.selectedStyle);

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
      mapLayers.updateLayers(tables, geoJSONs, splitData, densityTables);
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
          setTimeout(() => {
            if (mapPosition.restorePosition()) {
              mapInstanceStore.markViewportManual();
            }
          }, 100);
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
    getActiveVisualizations: () => visibleVisualizations,
    onOrthographicViewStateChanged: (target, zoom) => {
      mapInstanceStore.markViewportManual();
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

  function getProjectionMetadataForDataset(datasetId: string | undefined) {
    if (basemapStyleStore.referenceBasemapId) {
      return basemapService.currentMetadata;
    }

    const duckDataset = getRenderedDuckDBDataset(datasetId);
    if (!duckDataset?.joinedBasemap) {
      return basemapService.currentMetadata;
    }

    const resolvedBasemapId = getPreferredBasemapFile(
      basemapService.availableBasemaps,
      duckDataset.joinedBasemap
    );

    return (
      basemapService.availableBasemaps.find(
        (basemap) => basemap.file === resolvedBasemapId
      ) ?? basemapService.currentMetadata
    );
  }

  function getProjectionFitBbox(): BBox | null {
    const currentBasemapMeta = getProjectionMetadataForDataset(firstDatasetId);
    const mainlandBbox = currentBasemapMeta
      ? getMainlandBboxForBasemap(
          currentBasemapMeta,
          basemapService.projectionPresets
        )
      : null;
    const datasetTableBounds = firstTable
      ? toOrthographicBounds(calculateBoundsFromGeoArrow(firstTable))
      : null;

    if (!firstDatasetId) {
      return mainlandBbox ?? currentBasemapMeta?.bbox ?? null;
    }

    const dataset = getRenderedDataset(firstDatasetId);
    const resolvedDatasetBounds = resolveOrthographicDatasetBounds(
      dataset,
      datasetTableBounds
    );
    const resolvedDatasetBbox: BBox | null = resolvedDatasetBounds
      ? [
          resolvedDatasetBounds[0][0],
          resolvedDatasetBounds[0][1],
          resolvedDatasetBounds[1][0],
          resolvedDatasetBounds[1][1]
        ]
      : null;

    const duckDataset = getRenderedDuckDBDataset(firstDatasetId);
    const shouldUseBasemapReference =
      shouldUseBasemapReferenceInOrthographicView(
        dataset,
        duckDataset,
        basemapStyleStore.referenceBasemapId
      );

    if (shouldUseBasemapReference) {
      return (
        mainlandBbox ?? currentBasemapMeta?.bbox ?? resolvedDatasetBbox ?? null
      );
    }

    return (
      resolvedDatasetBbox ?? mainlandBbox ?? currentBasemapMeta?.bbox ?? null
    );
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
    getShouldRenderDatasetFallbacks: () =>
      globalState.selectedStep === ToolbarStep.Data,
    getTableFilters: getTableFiltersForDataset,
    onBasemapLayersLoaded: () =>
      scheduleLayerUpdate('useMapLayers:basemapLayersLoaded'),
    onRepresentativePointTablesLoaded: () =>
      scheduleLayerUpdate('useMapLayers:representativePointTablesLoaded')
  });

  function updateCanvasSize() {
    if (mapContainer) {
      projectionStore.updateCanvasSize({
        width: mapContainer.offsetWidth || 800,
        height: mapContainer.offsetHeight || 600
      });
    }
  }

  function getProjectionViewportSize(): { width: number; height: number } {
    return {
      width: Math.max(1, mapCanvasWidth),
      height: Math.max(1, mapCanvasHeight)
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

  function refreshOrthographicReferenceForFirstTable(
    basemapMeta: ReturnType<typeof getProjectionMetadataForDataset>,
    basemapTableOverride: ArrowTable | null = null
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
    const referenceTable = resolveOrthographicReferenceTable({
      dataset,
      duckDataset,
      datasetTable: firstTable,
      basemapTable: basemapTableOverride ?? worldBaseTable,
      referenceBasemapId: refBasemapId
    });
    const bounds = referenceTable
      ? shouldUseBasemapReference
        ? toOrthographicBounds(calculateBoundsFromGeoArrow(referenceTable))
        : resolveOrthographicDatasetBounds(
            dataset,
            toOrthographicBounds(calculateBoundsFromGeoArrow(referenceTable))
          )
      : null;

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
      referenceState.isProjected
    );

    return true;
  }

  function syncOrthographicReferenceWithBasemap(
    basemapMeta: typeof basemapService.currentMetadata,
    basemapTable: ArrowTable | null
  ): void {
    if (
      mapInit.viewMode !== ViewMode.ORTHOGRAPHIC ||
      !basemapMeta ||
      !basemapTable
    ) {
      return;
    }

    let didSetReference = false;

    if (shouldPreferDatasetReferenceBounds()) {
      didSetReference = refreshOrthographicReferenceForFirstTable(
        basemapMeta,
        basemapTable
      );
    }

    if (!didSetReference) {
      const referenceState = resolveOrthographicBasemapReferenceState(
        basemapMeta,
        basemapTable
      );

      if (referenceState.bbox) {
        projectionStore.setReferenceBbox(
          referenceState.bbox,
          undefined,
          referenceState.isProjected
        );
        didSetReference = true;
      }
    }

    if (!didSetReference) {
      return;
    }

    if (mapInit.isMapLoaded) {
      mapInstanceStore.fitToOrthographicBounds('basemap');
    } else {
      pendingOrthographicFit = true;
      pendingOrthographicFitReason = 'basemap';
    }
  }

  function shouldPreferDatasetReferenceBounds(): boolean {
    if (!firstTable && !firstGeoJSON) {
      return false;
    }

    const dataset = getRenderedDataset(firstDatasetId);
    const duckDataset = getRenderedDuckDBDataset(firstDatasetId);
    return !shouldUseBasemapReferenceInOrthographicView(
      dataset,
      duckDataset,
      basemapStyleStore.referenceBasemapId
    );
  }

  function getProjectionOverrideForRender(
    requiredSource?: 'auto' | 'manual'
  ): ProjectionLike | undefined {
    const projectionState = getProjectionState();
    const viewportSize = getProjectionViewportSize();
    const fitPaddingPx = mapViewportFitPaddingPx;
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
    const viewportSize = getProjectionViewportSize();
    const fitBbox = getProjectionFitBbox();
    const defaultProjection =
      basemapMeta &&
      !basemapMeta.isCustom &&
      basemapMeta.proj_to?.type !== 'identity'
        ? fitBasemapRenderProjection({
            projection: buildProjectionForBasemap(
              basemapMeta,
              viewportSize.width,
              viewportSize.height,
              basemapService.projectionPresets
            ),
            metadata: basemapMeta,
            fitBbox,
            width: viewportSize.width,
            height: viewportSize.height,
            padding: mapViewportFitPaddingPx
          })
        : undefined;
    const overrideProjection = getProjectionOverrideForRender();

    return resolveProjectionForRender(
      defaultProjection,
      overrideProjection,
      projectionState.overrideSource,
      allowManualOverride
    );
  }

  function projectBboxForRenderProjection(
    bbox: BBox | null,
    basemapMeta: ReturnType<typeof getProjectionMetadataForDataset>,
    allowManualOverride = true
  ): BBox | null {
    const renderProjection = getOrthographicRenderProjection(
      basemapMeta,
      allowManualOverride
    );
    if (!renderProjection || !bbox) {
      return null;
    }

    return computeProjectedBboxForProjection(renderProjection, bbox);
  }

  function resolveOrthographicReferenceState(
    dataset: ReturnType<typeof getRenderedDataset>,
    bounds: [[number, number], [number, number]] | null,
    basemapMeta: ReturnType<typeof getProjectionMetadataForDataset>,
    shouldUseBasemapReference: boolean
  ): { bbox: BBox | null; isProjected: boolean } {
    if (!bounds) {
      return { bbox: null, isProjected: false };
    }

    const shouldUseIdentityReferenceBounds =
      shouldUseIdentityProjectionForDatasetCrs(dataset?.geometry?.crs);
    const mainlandBbox = basemapMeta
      ? getMainlandBboxForBasemap(basemapMeta, basemapService.projectionPresets)
      : null;
    const basemapReferenceBbox = mainlandBbox ?? basemapMeta?.bbox ?? null;
    const basemapProjectedBbox = projectBboxForRenderProjection(
      basemapReferenceBbox,
      basemapMeta
    );

    const [[minX, minY], [maxX, maxY]] = bounds;
    const datasetBbox: BBox = [minX, minY, maxX, maxY];
    const datasetProjectedBbox = shouldUseIdentityReferenceBounds
      ? null
      : projectBboxForRenderProjection(datasetBbox, basemapMeta, false);

    const referenceBbox = resolveOrthographicReferenceBbox({
      datasetBounds: datasetBbox,
      datasetProjectedBbox,
      shouldUseBasemapReference,
      basemapProjectedBbox,
      basemapMainlandBbox: mainlandBbox
    });

    return {
      bbox: referenceBbox,
      isProjected:
        referenceBbox === basemapProjectedBbox ||
        referenceBbox === datasetProjectedBbox
    };
  }

  function toOrthographicBounds(
    bounds: LngLatBoundsLike | null
  ): [[number, number], [number, number]] | null {
    if (!bounds) {
      return null;
    }

    if (
      Array.isArray(bounds) &&
      bounds.length === 2 &&
      Array.isArray(bounds[0]) &&
      Array.isArray(bounds[1])
    ) {
      return [
        [bounds[0][0], bounds[0][1]],
        [bounds[1][0], bounds[1][1]]
      ];
    }

    if (Array.isArray(bounds) && bounds.length === 4) {
      return [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]]
      ];
    }

    if (
      typeof bounds === 'object' &&
      bounds !== null &&
      'toArray' in bounds &&
      typeof bounds.toArray === 'function'
    ) {
      const arrayBounds = bounds.toArray();
      return [
        [arrayBounds[0][0], arrayBounds[0][1]],
        [arrayBounds[1][0], arrayBounds[1][1]]
      ];
    }

    return null;
  }

  function resolveOrthographicBasemapReferenceState(
    basemapMeta: typeof basemapService.currentMetadata,
    basemapTable: ArrowTable | null
  ): { bbox: BBox | null; isProjected: boolean } {
    if (!basemapMeta) {
      return { bbox: null, isProjected: false };
    }

    const mainlandBbox = getMainlandBboxForBasemap(
      basemapMeta,
      basemapService.projectionPresets
    );
    const basemapReferenceBbox = mainlandBbox ?? basemapMeta.bbox ?? null;
    const projectedBbox = projectBboxForRenderProjection(
      basemapReferenceBbox,
      basemapMeta
    );
    if (projectedBbox) {
      return { bbox: projectedBbox, isProjected: true };
    }

    if (mainlandBbox) {
      return { bbox: mainlandBbox, isProjected: false };
    }

    const bounds = basemapTable
      ? calculateBoundsFromGeoArrow(basemapTable)
      : null;
    const orthographicBounds = toOrthographicBounds(bounds);
    if (orthographicBounds) {
      const [[minX, minY], [maxX, maxY]] = orthographicBounds;
      return {
        bbox: [minX, minY, maxX, maxY],
        isProjected: false
      };
    }

    return {
      bbox: basemapMeta.bbox ?? null,
      isProjected: false
    };
  }

  function syncOrthographicViewportAfterViewModeSwitch(
    reasonOverride?: ViewportFitReason
  ): void {
    if (mapInit.viewMode !== ViewMode.ORTHOGRAPHIC) {
      return;
    }

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
      const referenceTable = resolveOrthographicReferenceTable({
        dataset,
        duckDataset,
        datasetTable: firstTable,
        basemapTable: currentWorldBaseTable,
        referenceBasemapId: refBasemapId
      });
      const bounds = referenceTable
        ? shouldUseBasemapReference
          ? toOrthographicBounds(calculateBoundsFromGeoArrow(referenceTable))
          : resolveOrthographicDatasetBounds(
              dataset,
              toOrthographicBounds(calculateBoundsFromGeoArrow(referenceTable))
            )
        : null;

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
            referenceState.isProjected
          );
        }

        fitOrthographicViewport(
          reasonOverride ?? (shouldUseBasemapReference ? 'basemap' : 'dataset')
        );
        return;
      }

      if (shouldUseBasemapReference && projectionStore.referenceBbox) {
        fitOrthographicViewport(reasonOverride ?? 'basemap');
        return;
      }

      const geoMetadata = firstTable.schema.metadata?.get('geo');
      if (geoMetadata) {
        projectionStore.setReferenceBboxFromMetadata(geoMetadata);
        fitOrthographicViewport(reasonOverride ?? 'dataset');
        return;
      }
    }

    if (firstGeoJSON) {
      const useBasemapBounds = Boolean(refBasemapId) && currentWorldBaseTable;
      const bounds = useBasemapBounds
        ? calculateBoundsFromGeoArrow(currentWorldBaseTable)
        : calculateBoundsFromGeoJSON(firstGeoJSON);

      if (bounds) {
        const [[minX, minY], [maxX, maxY]] = bounds as [
          [number, number],
          [number, number]
        ];
        projectionStore.setReferenceBbox([minX, minY, maxX, maxY]);
        fitOrthographicViewport(
          reasonOverride ?? (useBasemapBounds ? 'basemap' : 'dataset')
        );
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
          referenceState.isProjected
        );
        fitOrthographicViewport(reasonOverride ?? 'basemap');
        return;
      }
    }
  }

  function applyPendingMapLibreViewportPreset(): void {
    if (
      !pendingMapLibreViewportPreset ||
      mapInit.viewMode !== ViewMode.MAPLIBRE ||
      !mapInit.map
    ) {
      return;
    }

    const bounds = pendingMapLibreViewportPreset;
    pendingMapLibreViewportPreset = null;
    mapBounds.fitToBounds(bounds, {
      animate: true,
      reason: 'basemap'
    });
  }

  function fitMapLibreViewportAfterViewModeSwitch(
    reason: ViewportFitReason = 'dataset'
  ): void {
    if (mapInit.viewMode !== ViewMode.MAPLIBRE || !mapInit.map) {
      return;
    }

    const refBasemapId = basemapStyleStore.referenceBasemapId;
    const currentWorldBaseTable = worldBaseTable;

    if (refBasemapId && currentWorldBaseTable) {
      const bounds = calculateBoundsFromGeoArrow(currentWorldBaseTable);
      if (bounds) {
        mapBounds.fitToBounds(bounds, { reason });
        return;
      }
    }

    if (firstTable) {
      const bounds = calculateBoundsFromGeoArrow(firstTable);
      if (bounds) {
        mapBounds.fitToBounds(bounds, { reason });
        return;
      }
    }

    if (firstGeoJSON) {
      const bounds = calculateBoundsFromGeoJSON(firstGeoJSON);
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
      const bounds = calculateBoundsFromGeoArrow(currentWorldBaseTable);
      if (bounds) {
        mapBounds.fitToBounds(bounds, { reason });
      }
    }
  }

  const mapBasemap = useMapBasemap({
    getMap: () => mapInit.map,
    getIsMapLoaded: () => mapInit.isMapLoaded,
    onProjectionChanged: () => {
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
      applyPendingMapLibreViewportPreset();
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
    getFitPaddingPx: () => mapViewportFitPaddingPx,
    onBoundsUpdated: (zoom) => {
      mapInstanceStore.setBaseZoomLevel(zoom);
    },
    savePosition: () => mapPosition.savePosition(),
    onFitComplete: () => {
      triggerOnReady();
    }
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
    if (renderPixelRatioTimeoutId) {
      clearTimeout(renderPixelRatioTimeoutId);
      renderPixelRatioTimeoutId = null;
    }

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
        !mapInstanceStore.hasPendingRestore
      ) {
        pendingViewportAutoRefitReason = getCurrentViewportAutoFitReason();
      }

      annotationsActions.redistributePageElements({
        width: fmtState.width,
        height: fmtState.height,
        margins
      });
      if (mapInit.isMapLoaded && !isSwitchingViewMode) {
        scheduleLayerUpdate('effect:formatLayoutChange');
      }
    });
  });

  $effect(() => {
    void mapCanvasWidth;
    void mapCanvasHeight;
    void mapViewportFitPaddingPx;

    const viewportSnapshot = `${mapCanvasWidth}x${mapCanvasHeight}-${mapViewportFitPaddingPx}`;
    const hasViewportChanged =
      lastMapViewportSnapshot !== null &&
      viewportSnapshot !== lastMapViewportSnapshot;
    lastMapViewportSnapshot = viewportSnapshot;

    untrack(() => {
      projectionStore.setFitPadding(mapViewportFitPaddingPx);
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

        if (
          hasViewportChanged &&
          mapInstanceStore.isViewportAutoFitManaged &&
          !mapInstanceStore.hasPendingRestore
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
      mapInstanceStore.hasPendingRestore
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
            if (shouldFit) fitOrthographicViewport('dataset');
          });
          triggerOnReady();
        } else if (shouldUseBasemapReference && projectionStore.referenceBbox) {
          untrack(() => {
            if (shouldFit) fitOrthographicViewport('basemap');
          });
          triggerOnReady();
        } else if (!shouldUseBasemapReference) {
          const geoMetadata = firstTable.schema.metadata?.get('geo');
          if (geoMetadata) {
            untrack(() => {
              projectionStore.setReferenceBboxFromMetadata(geoMetadata);
              scheduleLayerUpdate('effect:firstTable-metadata');
              if (shouldFit) fitOrthographicViewport('dataset');
            });
            triggerOnReady();
          }
        }
      } else if (mapInit.map && shouldFit) {
        if (refBasemapId && worldBaseTable) {
          const bBounds = calculateBoundsFromGeoArrow(worldBaseTable);
          if (bBounds) {
            untrack(() =>
              mapBounds.fitToBounds(bBounds, {
                animate: true,
                reason: 'basemap'
              })
            );
          }
        } else {
          untrack(() =>
            mapBounds.fitToArrowBounds(firstTable, firstDatasetId, {
              reason: 'dataset'
            })
          );
        }
      }
    }
  });

  $effect(() => {
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (firstGeoJSON && canUpdate) {
      if (mapInit.viewMode === ViewMode.MAPLIBRE && mapInit.map) {
        untrack(() =>
          mapBounds.fitToGeoJSONBounds(firstGeoJSON, {
            reason: 'dataset'
          })
        );
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
            fitOrthographicViewport('dataset');
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
    const visualizationCount = visualizationStore.visualizations.length;

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
      if (visualizationCount > 0) {
        return;
      }

      // Guard: don't reset if the project still has source files.
      // Datasets can be temporarily empty during reprocessing or lifecycle transitions.
      if (sourceFileCount > 0) {
        return;
      }

      if (projectEmptyResetTimeoutId) {
        return;
      }

      projectEmptyResetTimeoutId = setTimeout(() => {
        projectEmptyResetTimeoutId = null;

        const datasetsCountNow = datasetsStore.datasets.length;
        const sourceFileCountNow =
          projectStore.currentProject?.data?.sourceFiles?.length ?? 0;
        const visualizationCountNow = visualizationStore.visualizations.length;
        if (
          datasetsCountNow !== 0 ||
          sourceFileCountNow > 0 ||
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
      }, PROJECT_EMPTY_RESET_DEBOUNCE_MS);
    }
  });

  $effect(() => {
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (!hasData && canUpdate) {
      untrack(() => {
        scheduleLayerUpdate('effect:noData');

        if (!worldBaseTable) {
          loadWorldBasemap();
        }
      });
    }
  });

  $effect(() => {
    const dataPresent = hasData;
    const refId = basemapStyleStore.referenceBasemapId;

    if (dataPresent && !refId && worldBaseTable) {
      worldBaseTable = null;
      untrack(() => scheduleLayerUpdate('effect:clearDefaultBasemapForData'));
    }
  });

  $effect(() => {
    const canUpdate = mapInit.isMapLoaded && !isSwitchingViewMode;
    if (worldBaseTable && canUpdate) {
      untrack(() => {
        scheduleLayerUpdate('effect:worldBaseTable');
        // When no user data, basemap loading completes the init — trigger ready immediately
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
                const bounds = calculateBoundsFromGeoArrow(worldBaseTable);
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
    const selectedStyle = basemapStyleStore.selectedStyle;
    const nextZone = getBasemapZone(selectedStyle);
    const previousZone = lastSelectedBasemapZone;
    lastSelectedBasemapZone = nextZone;

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
      pendingMapLibreViewportPreset = preset.bounds;
    }
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
    void basemapStyleStore.viewportRequestVersion;

    const requestedStyle = basemapStyleStore.requestedViewportStyle;
    const preset = requestedStyle
      ? getBasemapViewportPreset(requestedStyle)
      : null;

    if (!preset) {
      return;
    }

    pendingMapLibreViewportPreset = preset.bounds;

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
        !isSwitchingViewMode
      ) {
        fitMapLibreViewportAfterViewModeSwitch('projection');
      }
    });
  });

  const filtersVersion = $derived(
    Array.from(getFiltersMap().entries())
      .map(([k, v]) => `${k}:${v.length}:${v.map((f) => f.id).join(',')}`)
      .join('|')
  );
  const projectionRenderTrigger = $derived.by(() => {
    const projectionState = getProjectionState();

    return `${buildProjectionRenderKey(projectionState)}|${mapProjectionStore.projection}`;
  });

  const layerUpdateTrigger = $derived({
    vizVersion: visualizationStore.version,
    basemapVersion: basemapLayersStore.version,
    highlightVersion: mapHighlightStore.version,
    dataVersion,
    dataSize: `${tables.size}-${geoJSONs.size}`,
    filtersVersion,
    projectionVersion: projectionRenderTrigger,
    selectedStep: globalState.selectedStep
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
      untrack(() => syncOrthographicViewportAfterViewModeSwitch('projection'));
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
            const resolvedBasemap =
              basemapService.getResolvedVariantData(
                loaded.metadata.file,
                loaded.activeSimplificationLevel ?? undefined
              ) ?? loaded;
            worldBaseTable = resolvedBasemap.geometryTable;
            if (!isSwitchingViewMode) {
              scheduleLayerUpdate('effect:referenceBasemapChanged');

              if (mapInit.viewMode === ViewMode.MAPLIBRE && mapInit.map) {
                let bounds = calculateBoundsFromGeoArrow(
                  resolvedBasemap.geometryTable
                );
                if (!bounds && resolvedBasemap.metadata.bbox) {
                  const [minLng, minLat, maxLng, maxLat] =
                    resolvedBasemap.metadata.bbox;
                  bounds = [
                    [minLng, minLat],
                    [maxLng, maxLat]
                  ];
                }
                if (bounds) {
                  mapBounds.fitToBounds(bounds, {
                    animate: true,
                    reason: 'basemap'
                  });
                }
              } else if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
                const referenceState = resolveOrthographicBasemapReferenceState(
                  resolvedBasemap.metadata,
                  resolvedBasemap.geometryTable
                );
                if (referenceState.bbox) {
                  projectionStore.setReferenceBbox(
                    referenceState.bbox,
                    undefined,
                    referenceState.isProjected
                  );
                }
                if (mapInit.isMapLoaded) {
                  mapInstanceStore.fitToOrthographicBounds('basemap');
                } else {
                  pendingOrthographicFit = true;
                  pendingOrthographicFitReason = 'basemap';
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
      } else if (!hasData) {
        await loadWorldBasemap(requestId);
      } else {
        worldBaseTable = null;
        scheduleLayerUpdate('effect:referenceBasemapCleared');
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
            const resolvedBasemap =
              basemapService.getResolvedVariantData(
                refLoaded.metadata.file,
                refLoaded.activeSimplificationLevel ?? undefined
              ) ?? refLoaded;
            worldBaseTable = resolvedBasemap.geometryTable;
            if (!isSwitchingViewMode) {
              scheduleLayerUpdate('loadWorldBasemap:pendingRef');

              if (mapInit.viewMode === ViewMode.MAPLIBRE && mapInit.map) {
                let refBounds = calculateBoundsFromGeoArrow(
                  resolvedBasemap.geometryTable
                );
                if (!refBounds && resolvedBasemap.metadata.bbox) {
                  const [minLng, minLat, maxLng, maxLat] =
                    resolvedBasemap.metadata.bbox;
                  refBounds = [
                    [minLng, minLat],
                    [maxLng, maxLat]
                  ];
                }
                if (refBounds) {
                  mapBounds.fitToBounds(refBounds, {
                    animate: true,
                    reason: 'basemap'
                  });
                }
              } else if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
                const referenceState = resolveOrthographicBasemapReferenceState(
                  resolvedBasemap.metadata,
                  resolvedBasemap.geometryTable
                );
                if (referenceState.bbox) {
                  projectionStore.setReferenceBbox(
                    referenceState.bbox,
                    undefined,
                    referenceState.isProjected
                  );
                }
                if (mapInit.isMapLoaded) {
                  mapInstanceStore.fitToOrthographicBounds('basemap');
                } else {
                  pendingOrthographicFit = true;
                  pendingOrthographicFitReason = 'basemap';
                }
              }
            }
          } else {
            logger.warn(
              'Reference basemap failed, falling back to world',
              LogCategory.MAP,
              { refId: pendingRefId }
            );
            const fallback = await basemapService.loadDefaultBasemap();
            if (fallback) {
              const resolvedBasemap =
                basemapService.getResolvedVariantData(
                  fallback.metadata.file,
                  fallback.activeSimplificationLevel ?? undefined
                ) ?? fallback;
              worldBaseTable = resolvedBasemap.geometryTable;
              syncOrthographicReferenceWithBasemap(
                resolvedBasemap.metadata,
                resolvedBasemap.geometryTable
              );
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
        const resolvedBasemap =
          basemapService.getResolvedVariantData(
            loaded.metadata.file,
            loaded.activeSimplificationLevel ?? undefined
          ) ?? loaded;
        if (mapInit.viewMode === ViewMode.ORTHOGRAPHIC) {
          syncOrthographicReferenceWithBasemap(
            resolvedBasemap.metadata,
            resolvedBasemap.geometryTable
          );
        }

        if (!hasData) {
          worldBaseTable = resolvedBasemap.geometryTable;
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
    projectionMaskId =
      typeof crypto?.randomUUID === 'function'
        ? `projection-mask-${crypto.randomUUID()}`
        : `projection-mask-${Math.random().toString(36).slice(2)}`;

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

      if (canUpdate) {
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
      if (renderPixelRatioTimeoutId) {
        clearTimeout(renderPixelRatioTimeoutId);
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

    {#if projectionMaskPath && projectionMaskId}
      <svg
        aria-hidden="true"
        class="projection-mask-overlay"
        viewBox={`0 0 ${mapCanvasWidth} ${mapCanvasHeight}`}
        preserveAspectRatio="none"
      >
        <defs>
          <mask
            id={projectionMaskId}
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
          >
            <rect width={mapCanvasWidth} height={mapCanvasHeight} fill="white"
            ></rect>
            <path
              d={projectionMaskPath}
              fill="black"
              fill-rule="evenodd"
              clip-rule="evenodd"
            ></path>
          </mask>
        </defs>
        <rect
          width={mapCanvasWidth}
          height={mapCanvasHeight}
          fill={pageBackgroundColor}
          mask={`url(#${projectionMaskId})`}
        ></rect>
      </svg>
    {/if}

    {#if isSwitchingViewMode}
      <div class="view-mode-loader" transition:fade={{ duration: 200 }}>
        <SkeletonPlaceholder style="width: 100%; height: 100%;" />
      </div>
    {/if}
  </div>
{:else}
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

      {#if projectionMaskPath && projectionMaskId}
        <svg
          aria-hidden="true"
          class="projection-mask-overlay"
          viewBox={`0 0 ${mapCanvasWidth} ${mapCanvasHeight}`}
          preserveAspectRatio="none"
        >
          <defs>
            <mask
              id={projectionMaskId}
              maskUnits="userSpaceOnUse"
              maskContentUnits="userSpaceOnUse"
            >
              <rect width={mapCanvasWidth} height={mapCanvasHeight} fill="white"
              ></rect>
              <path
                d={projectionMaskPath}
                fill="black"
                fill-rule="evenodd"
                clip-rule="evenodd"
              ></path>
            </mask>
          </defs>
          <rect
            width={mapCanvasWidth}
            height={mapCanvasHeight}
            fill={pageBackgroundColor}
            mask={`url(#${projectionMaskId})`}
          ></rect>
        </svg>
      {/if}

      {#if showPageGrid}
        <div class="page-grid"></div>
      {/if}

      {#if isSwitchingViewMode}
        <div class="view-mode-loader" transition:fade={{ duration: 200 }}>
          <SkeletonPlaceholder style="width: 100%; height: 100%;" />
        </div>
      {/if}

      {#if showLegendOverlay}
        <LegendOverlay hidden={!isStylingMode} />
      {/if}

      {#if showGeoIndicationsOverlay}
        <GeoIndicationsOverlay
          interactive={isStylingMode}
          hidden={!isStylingMode}
        />
      {/if}
    </div>

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

  .page-grid {
    position: absolute;
    inset: 0;
    z-index: var(--z-map-layer);
    pointer-events: none;
    background-image:
      radial-gradient(circle, rgba(22, 22, 22, 0.35) 0.6px, transparent 0.6px),
      radial-gradient(circle, rgba(22, 22, 22, 0.15) 0.5px, transparent 0.5px);
    background-size:
      20px 20px,
      10px 10px;
    background-position:
      0 0,
      5px 5px;
  }

  .page-container.is-exporting-map .page-grid {
    display: none !important;
  }

  .map-canvas {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .map-canvas :global(canvas) {
    display: block;
  }

  .projection-mask-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: var(--z-map-layer);
    pointer-events: none;
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
