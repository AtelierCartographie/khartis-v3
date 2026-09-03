<script lang="ts">
  import { Deck, OrthographicView, type DeckProps } from '@deck.gl/core';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import type { FeatureCollection } from 'geojson';
  import { onMount, untrack } from 'svelte';
  import * as m from '$lib/paraglide/messages';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { ToolbarStep } from '$lib/features/commons/types/global';
  import { showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
  import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
  import { zoomModeStore } from '$lib/features/commons/stores/zoom-mode.store.svelte';
  import {
    visualizationStore,
    type VisualizationConfig
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import {
    createClickHandler,
    createHoverHandler
  } from '$lib/features/map/interactions';
  import { useMapLayers, useMapState } from '$lib/features/map/hooks';
  import {
    createDeckWithDeferredResizeObserver,
    patchLumaCanvasContextResizeGuard,
    supportsWebGL2,
    type DeckInstance
  } from '$lib/features/map/hooks/use-map-init.svelte';
  import { calculateBoundsFromGeoJSON } from '$lib/features/map/core';
  import { DECK_DEVICE_TYPE } from '$lib/features/map/constants';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import {
    basemapLayersStore,
    basemapService,
    getPreferredBasemapFile,
    mapHighlightStore,
    mapProjectionStore,
    osmBasemapStore,
    projectionStore,
    trackWorkerParseVersion,
    type BBox,
    type SplitRenderingTable
  } from '$lib/features/map';
  import { getProjectionState } from '$lib/features/step-toolbar/tools/projections/projection.store.svelte';
  import { getSimplificationState } from '$lib/features/step-toolbar/tools/simplification/simplification.store.svelte';
  import { getMainlandBboxForBasemap } from '$lib/features/map/utils/geoarrow-stream-bridge.utils';
  import { resolveActiveBasemapMetadata } from '$lib/features/map/utils/basemap-metadata-resolution.utils';
  import { resolveUserProjectionOverride } from '$lib/features/map/utils/user-projection.utils';
  import {
    resolveOrthographicBasemapReferenceState as resolveSharedOrthographicBasemapReferenceState,
    resolveOrthographicReferenceState as resolveSharedOrthographicReferenceState,
    resolveOrthographicRenderProjection,
    resolveOrthographicRenderedDatasetBounds,
    toBboxFromOrthographicBounds,
    toOrthographicBounds
  } from '$lib/features/map/utils/orthographic-render-resolution.utils';
  import {
    getBrowserMaxRenderBufferSizePx,
    resolveMapRenderPixelRatio
  } from '$lib/features/map/utils/render-pixel-ratio.utils';
  import {
    resolveOrthographicProjectionFitBbox,
    shouldUseBasemapReferenceInOrthographicView
  } from '$lib/features/map/utils/orthographic-reference.utils';
  import { resolveOrthographicInteractionController } from '$lib/features/map/utils/map-interaction-mode.utils';
  import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
  import {
    buildFacetRenderDescriptors,
    FACET_TITLE_HEIGHT
  } from './facets-shared-renderer.utils';
  import {
    facetsStore,
    SCALE_MODE,
    type FacetsLayout
  } from './facets.store.svelte';
  import { resolveSharedFacetScaleStats } from './facets-shared-scale';
  import LegendOverlay from '$lib/features/map/components/legend-overlay.svelte';

  interface Props {
    visualizations: VisualizationConfig[];
    tables: Map<string, ArrowTable>;
    densityTables?: Map<string, ArrowTable>;
    splitData?: Map<string, SplitRenderingTable>;
    geoJSONs: Map<string, FeatureCollection>;
    layout: FacetsLayout;
    containerWidth: number;
    containerHeight: number;
    pageAspectRatio: number;
    onReady?: () => void;
  }

  let {
    visualizations,
    tables,
    densityTables,
    splitData,
    geoJSONs,
    layout,
    containerWidth,
    containerHeight,
    pageAspectRatio,
    onReady
  }: Props = $props();

  const IS_DEV = import.meta.env.DEV;
  let rendererContainer = $state<HTMLDivElement | undefined>(undefined);
  let deckInstance = $state<DeckInstance | null>(null);
  let isRendererLoaded = $state(false);
  let hasCalledOnReady = $state(false);
  let pendingOnReady = $state(false);
  let isLoadingReferenceBasemap = $state(false);
  let referenceBasemapRequestId = 0;
  let worldBaseTable = $state.raw<ArrowTable | null>(null);

  const FACET_VIEWPORT_FIT_PADDING_PX = 16;
  const descriptors = $derived(
    buildFacetRenderDescriptors({
      visualizations,
      layout,
      containerWidth,
      containerHeight,
      pageAspectRatio,
      primarySlotPath: facetsStore.primarySlotPath
    })
  );
  // Scale anchored legends to facet cells while keeping a legible floor.
  const FACET_LEGEND_MIN_SCALE = 0.4;
  const facetLegendScale = $derived.by(() => {
    const cellWidth = descriptors[0]?.frame.width ?? 0;
    if (cellWidth <= 0 || containerWidth <= 0) {
      return 1;
    }
    return Math.max(
      FACET_LEGEND_MIN_SCALE,
      Math.min(1, cellWidth / containerWidth)
    );
  });
  const isStylingMode = $derived(
    globalState.selectedStep === ToolbarStep.Styling
  );
  // Independent-scale facets use per-cell legends; shared scale uses the global legend.
  const showAnchoredLegends = $derived(
    (globalState.selectedStep === ToolbarStep.Visualizations ||
      isStylingMode) &&
      facetsStore.scaleMode === SCALE_MODE.INDEPENDENT
  );

  function resolveFacetTitle(variable: string): string {
    return facetsStore.getFacetTitle(variable) ?? variable;
  }

  function handleFacetTitleChange(variable: string, value: string): void {
    facetsStore.setFacetTitle(variable, value);
  }

  function handleFacetTitleKeydown(
    variable: string,
    event: KeyboardEvent & { currentTarget: HTMLSpanElement }
  ): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.currentTarget.textContent = resolveFacetTitle(variable);
      event.currentTarget.blur();
    }
  }

  // Facets use orthographic Deck.gl only; warn once when a tiled basemap cannot render.
  let hasWarnedTiledBasemap = false;
  $effect(() => {
    const tiledBasemapOnly =
      (basemapStyleStore.requiresMapLibre || osmBasemapStore.isActive) &&
      !basemapStyleStore.referenceBasemapId;
    untrack(() => {
      if (tiledBasemapOnly && !hasWarnedTiledBasemap) {
        hasWarnedTiledBasemap = true;
        showWarning(
          m.facets_notice_title(),
          m.facets_tiled_basemap_unsupported()
        );
      } else if (!tiledBasemapOnly) {
        hasWarnedTiledBasemap = false;
      }
    });
  });

  const facetCanvasSize = $derived.by(() => ({
    width: Math.max(1, descriptors[0]?.frame.width ?? 1),
    height: Math.max(1, descriptors[0]?.frame.height ?? 1)
  }));

  // Keep facet fit padding fixed so viewport fitting cannot feed back into relayout.
  const mapViewportFitPaddingPx = FACET_VIEWPORT_FIT_PADDING_PX;
  const firstTable = $derived(
    tables.size > 0 ? tables.values().next().value : null
  );
  const firstGeoJSON = $derived(
    geoJSONs.size > 0 ? geoJSONs.values().next().value : null
  );
  const firstDatasetId = $derived(
    tables.size > 0 ? tables.keys().next().value : undefined
  );
  const maxRenderBufferSizePx = $derived(getBrowserMaxRenderBufferSizePx());
  const renderPixelRatio = $derived.by(() => {
    return resolveMapRenderPixelRatio(
      typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      globalState.zoom.pageZoomScale,
      Math.max(containerWidth, containerHeight),
      maxRenderBufferSizePx
    );
  });
  const sharedScaleStats = $derived.by(() => {
    return resolveSharedFacetScaleStats({
      visualizations,
      scaleMode: facetsStore.scaleMode,
      primarySlotPath: facetsStore.primarySlotPath,
      getColumnStatistics: (datasetId, columnName) =>
        datasetsStore.getColumnStatistics(datasetId, columnName)
    });
  });

  const mapState = useMapState();

  function triggerOnReady(): void {
    if (hasCalledOnReady) {
      return;
    }

    if (isLoadingReferenceBasemap) {
      pendingOnReady = true;
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (hasCalledOnReady) {
          return;
        }
        hasCalledOnReady = true;
        onReady?.();
      });
    });
  }

  function getRenderedDataset(datasetId: string | undefined) {
    if (!datasetId) {
      return null;
    }

    return (
      datasetsStore.datasets.find((dataset) => dataset.id === datasetId) ?? null
    );
  }

  function getRenderedDuckDBDataset(datasetId: string | undefined) {
    const dataset = getRenderedDataset(datasetId);
    if (!dataset?.sourceFileId) {
      return null;
    }

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

    const duckDataset = getRenderedDuckDBDataset(datasetId);
    const referenceBasemapId =
      basemapStyleStore.referenceBasemapId ?? duckDataset?.joinedBasemap;

    if (!referenceBasemapId) {
      return null;
    }

    const resolvedBasemapId = getPreferredBasemapFile(
      basemapService.availableBasemaps,
      referenceBasemapId
    );

    return resolveActiveBasemapMetadata({
      referenceBasemapId,
      resolvedBasemapId,
      availableBasemaps: basemapService.availableBasemaps,
      currentMetadata: basemapService.currentMetadata
    });
  }

  function getProjectionViewportSize(): { width: number; height: number } {
    return facetCanvasSize;
  }

  function getProjectionOverrideForRender(
    requiredSource?: 'auto' | 'manual'
  ): ProjectionLike | undefined {
    const projectionState = getProjectionState();
    const viewportSize = getProjectionViewportSize();
    if (
      !projectionState.overrideActive ||
      projectionState.overrideSource !== 'manual' ||
      (requiredSource && projectionState.overrideSource !== requiredSource)
    ) {
      return undefined;
    }

    return resolveUserProjectionOverride({
      state: projectionState,
      fitBbox: getProjectionFitBbox(),
      viewportSize,
      padding: mapViewportFitPaddingPx,
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
      padding: mapViewportFitPaddingPx,
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
    basemapMeta: ReturnType<typeof getProjectionMetadataForDataset>,
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

  function refreshReferenceBbox(): void {
    const basemapMeta = getProjectionMetadataForDataset(firstDatasetId);

    if (firstTable) {
      const dataset = getRenderedDataset(firstDatasetId);
      const duckDataset = getRenderedDuckDBDataset(firstDatasetId);
      const shouldUseBasemapReference =
        shouldUseBasemapReferenceInOrthographicView(
          dataset,
          duckDataset,
          basemapStyleStore.referenceBasemapId
        );
      const bounds = resolveRenderedReferenceBounds({
        datasetId: firstDatasetId,
        shouldUseBasemapReference
      });
      const referenceState = resolveOrthographicReferenceState(
        dataset,
        bounds,
        basemapMeta,
        shouldUseBasemapReference
      );

      if (referenceState.bbox) {
        projectionStore.setReferenceBbox(
          referenceState.bbox,
          undefined,
          referenceState.isProjected,
          referenceState.renderProjection
        );
        return;
      }
      // Fall through to basemap reference bounds when dataset bounds are unavailable.
    }

    if (firstGeoJSON) {
      if (basemapStyleStore.referenceBasemapId && worldBaseTable) {
        const referenceState = resolveOrthographicBasemapReferenceState(
          basemapMeta,
          worldBaseTable
        );
        if (referenceState.bbox) {
          projectionStore.setReferenceBbox(
            referenceState.bbox,
            undefined,
            referenceState.isProjected,
            referenceState.renderProjection
          );
          return;
        }
      }

      const bounds = toOrthographicBounds(
        calculateBoundsFromGeoJSON(firstGeoJSON)
      );
      if (bounds) {
        const [[minX, minY], [maxX, maxY]] = bounds;
        projectionStore.setReferenceBbox([minX, minY, maxX, maxY]);
        return;
      }
    }

    if (worldBaseTable) {
      const referenceState = resolveOrthographicBasemapReferenceState(
        basemapMeta,
        worldBaseTable
      );
      if (referenceState.bbox) {
        projectionStore.setReferenceBbox(
          referenceState.bbox,
          undefined,
          referenceState.isProjected,
          referenceState.renderProjection
        );
      }
    }
  }

  const mapLayers = useMapLayers({
    getDeckOverlay: () => null,
    getDeckInstance: () => deckInstance,
    getMap: () => null,
    getIsMapLoaded: () => isRendererLoaded,
    getWorldBaseTable: () => worldBaseTable,
    getActiveVisualizations: () => visualizations,
    buildLayerContextForViz: (viz) => {
      const context = mapState.buildLayerContextForViz(viz);
      return sharedScaleStats ? { ...context, ...sharedScaleStats } : context;
    },
    getProjectionMetadataForDataset: (datasetId) =>
      getProjectionMetadataForDataset(datasetId),
    getProjectionFitBbox: () => getProjectionFitBbox(),
    getShouldRenderDatasetFallbacks: () => false,
    onBasemapLayersLoaded: () =>
      mapLayers.updateLayers(tables, geoJSONs, splitData, densityTables),
    onRepresentativePointTablesLoaded: () =>
      mapLayers.updateLayers(tables, geoJSONs, splitData, densityTables)
  });

  function buildDeckViewStateMap() {
    const sharedViewState = {
      target: [...mapInstanceStore.deckViewState.target] as [
        number,
        number,
        number
      ],
      zoom: mapInstanceStore.deckViewState.zoom,
      minZoom: mapInstanceStore.deckViewState.minZoom,
      maxZoom: mapInstanceStore.deckViewState.maxZoom
    };

    return Object.fromEntries(
      descriptors.map((descriptor) => [
        descriptor.viewId,
        { ...sharedViewState }
      ])
    );
  }

  function applySharedDeckViewState(): void {
    if (!deckInstance) {
      return;
    }

    const nextViewState = buildDeckViewStateMap();
    deckInstance.setProps({
      viewState: nextViewState,
      initialViewState: nextViewState
    });
  }

  function resolveLayerViewId(layerId: string): string | null {
    const descriptor = descriptors.find((item) => layerId.includes(item.vizId));
    return descriptor?.viewId ?? null;
  }

  function updateDeckProps(): void {
    if (!deckInstance) {
      return;
    }

    deckInstance.setProps({
      views: descriptors.map(
        (descriptor) =>
          new OrthographicView({
            id: descriptor.viewId,
            x: descriptor.frame.x,
            y: descriptor.frame.y,
            width: descriptor.frame.width,
            height: descriptor.frame.height,
            flipY: false,
            controller: resolveOrthographicInteractionController(
              zoomModeStore.isPageMode
            )
          })
      ),
      layerFilter: ({ layer, viewport }) => {
        const viewId = resolveLayerViewId(String(layer.id));
        return viewId ? viewport.id === viewId : true;
      },
      useDevicePixels: renderPixelRatio
    });
    applySharedDeckViewState();
  }

  onMount(() => {
    if (!rendererContainer) {
      return;
    }

    patchLumaCanvasContextResizeGuard();

    if (!supportsWebGL2()) {
      mapInstanceStore.setDeckInstance(null);
      mapInstanceStore.setMapLoaded(true);
      triggerOnReady();
      return;
    }

    const hoverHandler = createHoverHandler(() => visualizations);
    const clickHandler = createClickHandler(() => visualizations);

    const sharedDeck = createDeckWithDeferredResizeObserver(
      () =>
        new Deck({
          parent: rendererContainer,
          deviceProps: {
            type: DECK_DEVICE_TYPE,
            debugGPUTime: IS_DEV
          },
          useDevicePixels: renderPixelRatio,
          width: '100%',
          height: '100%',
          controller: false,
          layers: [],
          onHover: hoverHandler,
          onClick: clickHandler,
          onViewStateChange: (({ viewState, interactionState }) => {
            const nextViewState = viewState as unknown as {
              target: [number, number, number];
              zoom: number;
            };
            const isUserInteraction =
              interactionState.isDragging ||
              interactionState.isPanning ||
              interactionState.isZooming;

            mapInstanceStore.updateDeckViewState(
              {
                target: nextViewState.target,
                zoom: nextViewState.zoom
              },
              isUserInteraction
            );

            return nextViewState;
          }) as DeckProps['onViewStateChange'],
          onLoad: () => {
            if (deckInstance !== sharedDeck) {
              return;
            }

            isRendererLoaded = true;
            mapInstanceStore.setDeckInstance(sharedDeck);
            mapInstanceStore.setMapLoaded(true);
            updateDeckProps();
            refreshReferenceBbox();
            mapInstanceStore.fitToOrthographicBounds('dataset');
            triggerOnReady();
          },
          onError: (error, layer) => {
            logger.error(
              'Shared Deck.gl facet renderer runtime error',
              LogCategory.MAP,
              {
                error,
                layerId: layer?.id
              }
            );
          }
        })
    );

    deckInstance = sharedDeck;
    mapInstanceStore.setDeckInstance(sharedDeck);
    mapInstanceStore.setOrthographicViewStateAdapter({
      applyViewState: () => {
        applySharedDeckViewState();
      }
    });

    if (IS_DEV) {
      (window as unknown as Record<string, unknown>).__deck = sharedDeck;
    }

    return () => {
      mapInstanceStore.setOrthographicViewStateAdapter(null);
      mapInstanceStore.setDeckInstance(null);
      mapInstanceStore.setMapLoaded(false);
      isRendererLoaded = false;

      try {
        sharedDeck.setProps({ layers: [] });
        sharedDeck.finalize();
      } catch (error) {
        logger.error(
          'Failed to finalize facet Deck instance',
          LogCategory.MAP,
          error
        );
      }
    };
  });

  // Off-main-thread geometry parses fill their cache asynchronously; each
  // completion bumps this version so the facet layer pass re-runs and picks
  // up the parsed buffers.
  $effect(() => {
    void trackWorkerParseVersion();
    if (isRendererLoaded) {
      untrack(() =>
        mapLayers.updateLayers(tables, geoJSONs, splitData, densityTables)
      );
    }
  });

  $effect(() => {
    void facetCanvasSize.width;
    void facetCanvasSize.height;
    void mapViewportFitPaddingPx;

    untrack(() => {
      projectionStore.updateCanvasSize(facetCanvasSize);
      projectionStore.setFitPadding(mapViewportFitPaddingPx);
      if (isRendererLoaded) {
        updateDeckProps();
        refreshReferenceBbox();
        // Refit render projection to the facet cell before rebuilding layers.
        mapLayers.updateLayers(tables, geoJSONs, splitData, densityTables);
        if (mapInstanceStore.isViewportAutoFitManaged) {
          mapInstanceStore.fitToOrthographicBounds(
            mapInstanceStore.viewportFitReason ?? 'dataset'
          );
        }
      }
    });
  });

  $effect(() => {
    void getSimplificationState().level;
    void getSimplificationState().lastApplied;

    if (!basemapStyleStore.referenceBasemapId) {
      return;
    }

    const nextWorldBaseTable = basemapService.currentGeometryTable;
    if (!nextWorldBaseTable || nextWorldBaseTable === worldBaseTable) {
      return;
    }

    worldBaseTable = nextWorldBaseTable;
  });

  $effect(() => {
    void basemapStyleStore.referenceBasemapId;
    const requestId = ++referenceBasemapRequestId;

    untrack(async () => {
      const refId = basemapStyleStore.referenceBasemapId;

      if (refId) {
        isLoadingReferenceBasemap = true;
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
          }
        } catch (error) {
          logger.error(
            'Failed to load the facets reference basemap',
            LogCategory.MAP,
            { referenceBasemapId: refId, error }
          );
        } finally {
          if (requestId === referenceBasemapRequestId) {
            isLoadingReferenceBasemap = false;
            if (pendingOnReady) {
              pendingOnReady = false;
              triggerOnReady();
            }
          }
        }
        return;
      }

      worldBaseTable = null;
      isLoadingReferenceBasemap = false;
    });
  });

  $effect(() => {
    void visualizationStore.version;
    void basemapLayersStore.version;
    void mapHighlightStore.version;
    void basemapStyleStore.referenceBasemapId;
    void basemapStyleStore.requiresMapLibre;
    void basemapStyleStore.selectedStyle;
    void mapProjectionStore.projection;
    void osmBasemapStore.activeOSMBasemap;
    void sharedScaleStats;
    const projectionState = getProjectionState();
    void projectionState.overrideActive;
    void projectionState.overrideSource;
    void projectionState.selected;
    void projectionState.customCode;
    void projectionState.suggestionD3Config;
    void projectionState.activeSuggestionId;
    void projectionState.longitude;
    void projectionState.latitude;
    void projectionState.rotation;
    void projectionState.center;
    void zoomModeStore.mode;
    void tables;
    void densityTables;
    void splitData;
    void geoJSONs;
    void visualizations;
    void worldBaseTable;

    if (!isRendererLoaded) {
      return;
    }

    untrack(() => {
      refreshReferenceBbox();
      updateDeckProps();
      if (mapInstanceStore.isViewportAutoFitManaged) {
        mapInstanceStore.fitToOrthographicBounds(
          basemapStyleStore.referenceBasemapId ? 'basemap' : 'dataset'
        );
      }
      mapLayers.updateLayers(tables, geoJSONs, splitData, densityTables);
      triggerOnReady();
    });
  });
</script>

<div class="facets-grid-wrapper">
  <div class="shared-facets-stage">
    <div bind:this={rendererContainer} class="shared-facets-canvas"></div>

    <div class="facets-overlay">
      {#each descriptors as descriptor (descriptor.facetId)}
        <div
          class="facet-cell"
          style:left="{descriptor.frame.x}px"
          style:top="{descriptor.frame.y - FACET_TITLE_HEIGHT}px"
          style:width="{descriptor.frame.width}px"
        >
          <h4 class="facet-title" style:height="{FACET_TITLE_HEIGHT}px">
            {#if isStylingMode}
              <span
                class="facet-title-input"
                contenteditable="plaintext-only"
                role="textbox"
                tabindex="0"
                aria-label={m.facets_facet_title_label({
                  variable: descriptor.title
                })}
                onblur={(
                  event: FocusEvent & { currentTarget: HTMLSpanElement }
                ) =>
                  handleFacetTitleChange(
                    descriptor.title,
                    event.currentTarget.textContent ?? ''
                  )}
                onkeydown={(
                  event: KeyboardEvent & { currentTarget: HTMLSpanElement }
                ) => handleFacetTitleKeydown(descriptor.title, event)}
                >{resolveFacetTitle(descriptor.title)}</span
              >
            {:else}
              {resolveFacetTitle(descriptor.title)}
            {/if}
          </h4>
          <div
            class="facet-map-frame"
            style:width="{descriptor.frame.width}px"
            style:height="{descriptor.frame.height}px"
            style:border={layout.frameVisible
              ? `${layout.frameThickness}px solid ${layout.frameColor}`
              : 'none'}
          >
            {#if showAnchoredLegends}
              <LegendOverlay
                scopeVizId={descriptor.vizId}
                inline
                sizeScale={facetLegendScale}
              />
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style lang="scss">
  .facets-grid-wrapper {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
  }

  .shared-facets-stage {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .shared-facets-canvas {
    position: absolute;
    inset: 0;
  }

  .facets-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .facet-cell {
    position: absolute;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  .facet-title {
    font-size: 13px;
    font-weight: 500;
    text-align: center;
    color: var(--cds-text-primary, #161616);
    margin: 0;
    padding: 2px 8px;
    line-height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-sizing: border-box;
  }

  .facet-map-frame {
    position: relative;
    box-sizing: border-box;
  }

  .facet-title-input {
    display: inline-block;
    max-width: 100%;
    border: none;
    background: transparent;
    text-align: center;
    font: inherit;
    color: inherit;
    padding: 1px 6px;
    border-radius: 2px;
    pointer-events: auto;
    outline: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .facet-title-input:hover {
    background: var(--cds-field-hover-01, rgba(141, 141, 141, 0.12));
  }

  .facet-title-input:focus {
    outline: 2px solid var(--cds-focus, #0f62fe);
    outline-offset: -2px;
    background: var(--cds-field-01, #f4f4f4);
  }
</style>
