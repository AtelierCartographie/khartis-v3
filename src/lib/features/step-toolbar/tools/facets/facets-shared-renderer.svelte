<script lang="ts">
  import { Deck, OrthographicView, type DeckProps } from '@deck.gl/core';
  import type { Table as ArrowTable } from 'apache-arrow/Arrow';
  import type { FeatureCollection } from 'geojson';
  import type { LngLatBoundsLike } from 'maplibre-gl';
  import { onMount, untrack } from 'svelte';
  import { globalState } from '$lib/features/commons/stores/global.svelte';
  import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
  import { zoomModeStore } from '$lib/features/commons/stores/zoom-mode.store.svelte';
  import {
    visualizationStore,
    type VisualizationConfig
  } from '$lib/features/commons/stores/visualization.store.svelte';
  import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
  import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
  import { getFiltersMap } from '$lib/features/duckdb/orchestrator/state.svelte';
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
  import {
    calculateBoundsFromGeoArrow,
    calculateBoundsFromGeoArrowRows,
    calculateBoundsFromGeoJSON
  } from '$lib/features/map/core';
  import { DECK_DEVICE_TYPE } from '$lib/features/map/constants';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
  import {
    basemapService,
    getPreferredBasemapFile
  } from '$lib/features/map/services/basemap.service.svelte';
  import { projectionStore } from '$lib/features/map/stores/projection.store.svelte';
  import { basemapLayersStore } from '$lib/features/map/stores/basemap-layers.store.svelte';
  import { mapHighlightStore } from '$lib/features/map/stores/map-highlight.store.svelte';
  import { mapProjectionStore } from '$lib/features/map/stores/map-projection.store.svelte';
  import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
  import { getProjectionState } from '$lib/features/step-toolbar/tools/projections/projection.store.svelte';
  import { getSimplificationState } from '$lib/features/step-toolbar/tools/simplification/simplification.store.svelte';
  import {
    getFormatLayoutSizingContext,
    getFormatState
  } from '$lib/features/step-toolbar/tools/format/format.store.svelte';
  import { resolveLayoutSizingTokens } from '$lib/features/commons/utils/layout-sizing.utils';
  import { getMainlandBboxForBasemap } from '$lib/features/map/utils/geoarrow-stream-bridge';
  import { fitBasemapRenderProjection } from '$lib/features/map/utils/fit-basemap-render-projection.utils';
  import { buildProjectionForBasemap } from '$lib/features/map/utils/geoarrow-stream-bridge';
  import { computeProjectedBboxForProjection } from '$lib/features/map/utils/geoarrow-stream-bridge';
  import { resolveOrthographicBasemapReferenceBboxes } from '$lib/features/map/utils/orthographic-basemap-reference';
  import { resolveProjectionForRender } from '$lib/features/map/utils/projection-priority';
  import { resolveUserProjectionOverride } from '$lib/features/map/utils/user-projection.utils';
  import { shouldUseIdentityProjectionForDatasetCrs } from '$lib/features/map/utils/dataset-crs';
  import {
    getBrowserMaxRenderBufferSizePx,
    resolveMapRenderPixelRatio
  } from '$lib/features/map/utils/render-pixel-ratio';
  import {
    resolveOrthographicDatasetBounds,
    resolveOrthographicProjectionFitBbox,
    resolveOrthographicReferenceBbox,
    resolveOrthographicReferenceTable,
    shouldUseBasemapReferenceInOrthographicView
  } from '$lib/features/map/utils/orthographic-reference';
  import {
    buildSplitDatasetRowMapping,
    getSplitMatchedGeometryRowIndices
  } from '$lib/features/map/layers/split-rendering-accessors';
  import { selectRowsByIndices } from '$lib/features/map/utils/arrow-filter.utils';
  import {
    arrowTableToGeoJSON,
    extractGeometryInfo
  } from '$lib/features/map/io';
  import { resolveOrthographicInteractionController } from '$lib/features/map/utils/map-interaction-mode.utils';
  import type { BBox, SplitRenderingTable } from '$lib/features/map/types';
  import type { ProjectionLike } from 'geoarrow-deck-stream';
  import { buildFacetRenderDescriptors } from './facets-shared-renderer.utils';
  import type { FacetsLayout } from './facets.store.svelte';

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
  const FACET_RENDER_PIXEL_RATIO_MAX = 1;

  let rendererContainer = $state<HTMLDivElement | undefined>(undefined);
  let deckInstance = $state<DeckInstance | null>(null);
  let isRendererLoaded = $state(false);
  let hasCalledOnReady = $state(false);
  let pendingOnReady = $state(false);
  let isLoadingReferenceBasemap = $state(false);
  let referenceBasemapRequestId = 0;
  let worldBaseTable = $state.raw<ArrowTable | null>(null);

  const fmtState = $derived(getFormatState());
  const mapViewportFitPaddingPx = $derived(
    resolveLayoutSizingTokens(getFormatLayoutSizingContext(fmtState))
      .mapViewport.fitPaddingPx
  );
  const descriptors = $derived(
    buildFacetRenderDescriptors({
      visualizations,
      layout,
      containerWidth,
      containerHeight,
      pageAspectRatio
    })
  );
  const gridStyle = $derived.by(() => {
    const columns = Math.max(
      1,
      Math.min(layout.columns, descriptors.length || 1)
    );
    const cellWidth = descriptors[0]?.frame.width ?? 0;
    const cellHeight = descriptors[0]?.frame.height ?? 0;

    return [
      `grid-template-columns: repeat(${columns}, ${cellWidth}px)`,
      `grid-auto-rows: ${cellHeight + 28}px`,
      `gap: ${layout.gap}px`
    ].join('; ');
  });
  const facetCanvasSize = $derived.by(() => ({
    width: Math.max(1, descriptors[0]?.frame.width ?? 1),
    height: Math.max(1, descriptors[0]?.frame.height ?? 1)
  }));
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
    const resolvedPixelRatio = resolveMapRenderPixelRatio(
      typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      globalState.zoom.pageZoomScale,
      Math.max(containerWidth, containerHeight),
      maxRenderBufferSizePx
    );

    return Math.min(resolvedPixelRatio, FACET_RENDER_PIXEL_RATIO_MAX);
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

    if (Array.isArray(bounds) && bounds.length === 4) {
      const flatBounds = bounds as [number, number, number, number];
      return [
        [flatBounds[0], flatBounds[1]],
        [flatBounds[2], flatBounds[3]]
      ];
    }

    return null;
  }

  function toBboxFromOrthographicBounds(
    bounds: [[number, number], [number, number]] | null
  ): BBox | null {
    return bounds
      ? [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]]
      : null;
  }

  function getSplitDatasetBounds(datasetId: string | undefined) {
    const split = datasetId ? splitData?.get(datasetId) : undefined;
    if (!split) {
      return null;
    }

    const rowMapping = buildSplitDatasetRowMapping(
      split.geometry,
      split.dataset,
      split.featureIdColumn
    );

    const rowBounds = calculateBoundsFromGeoArrowRows(
      split.geometry,
      (rowIndex) => rowMapping[rowIndex] !== -1
    );
    if (rowBounds) {
      return rowBounds;
    }

    const matchedRows = getSplitMatchedGeometryRowIndices(
      split.geometry,
      split.dataset,
      split.featureIdColumn
    );
    if (matchedRows.length === 0) {
      return null;
    }

    const filteredGeometry = selectRowsByIndices(split.geometry, matchedRows);
    const geometryInfo = extractGeometryInfo(filteredGeometry);
    const geojson = geometryInfo
      ? arrowTableToGeoJSON(filteredGeometry, geometryInfo.geoColumn)
      : null;

    return geojson ? calculateBoundsFromGeoJSON(geojson) : null;
  }

  function getRenderedDatasetBounds(datasetId: string | undefined) {
    const splitBounds = getSplitDatasetBounds(datasetId);
    if (splitBounds || (datasetId && splitData?.has(datasetId))) {
      return toOrthographicBounds(splitBounds);
    }

    return firstTable
      ? toOrthographicBounds(calculateBoundsFromGeoArrow(firstTable))
      : null;
  }

  function shouldPreferDatasetProjectionBbox(datasetBbox: BBox | null) {
    const projectionState = getProjectionState();
    return projectionState.overrideSource === 'manual' && Boolean(datasetBbox);
  }

  function resolveRenderedReferenceBounds(params: {
    datasetId: string | undefined;
    dataset: ReturnType<typeof getRenderedDataset>;
    referenceTable: ArrowTable | null;
    shouldUseBasemapReference: boolean;
  }): [[number, number], [number, number]] | null {
    const datasetBounds = getRenderedDatasetBounds(params.datasetId);
    const preferDatasetBbox = shouldPreferDatasetProjectionBbox(
      toBboxFromOrthographicBounds(datasetBounds)
    );

    if (params.shouldUseBasemapReference && !preferDatasetBbox) {
      return params.referenceTable
        ? toOrthographicBounds(
            calculateBoundsFromGeoArrow(params.referenceTable)
          )
        : datasetBounds;
    }

    const tableBounds =
      params.referenceTable && !preferDatasetBbox
        ? toOrthographicBounds(
            calculateBoundsFromGeoArrow(params.referenceTable)
          )
        : datasetBounds;

    return resolveOrthographicDatasetBounds(params.dataset, tableBounds);
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

    if (!allowManualOverride) {
      return defaultProjection;
    }

    return resolveProjectionForRender(
      defaultProjection,
      getProjectionOverrideForRender(),
      projectionState.overrideSource
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
    const basemapReference = resolveOrthographicBasemapReferenceBboxes({
      basemapMeta,
      projectionPresets: basemapService.projectionPresets,
      viewportSize: getProjectionViewportSize(),
      projectBbox: (bbox) => projectBboxForRenderProjection(bbox, basemapMeta)
    });
    const [[minX, minY], [maxX, maxY]] = bounds;
    const datasetBbox: BBox = [minX, minY, maxX, maxY];
    const preferDatasetBbox = shouldPreferDatasetProjectionBbox(datasetBbox);
    const datasetProjectedBbox = shouldUseIdentityReferenceBounds
      ? null
      : projectBboxForRenderProjection(
          datasetBbox,
          basemapMeta,
          preferDatasetBbox
        );
    const referenceBbox = resolveOrthographicReferenceBbox({
      datasetBounds: datasetBbox,
      datasetProjectedBbox,
      shouldUseBasemapReference,
      basemapProjectedBbox: basemapReference.projectedBbox,
      basemapMainlandBbox: basemapReference.fallbackBbox,
      preferDatasetBbox
    });

    return {
      bbox: referenceBbox,
      isProjected:
        referenceBbox === basemapReference.projectedBbox ||
        referenceBbox === datasetProjectedBbox
    };
  }

  function resolveOrthographicBasemapReferenceState(
    basemapMeta: ReturnType<typeof getProjectionMetadataForDataset>,
    basemapTable: ArrowTable | null
  ): { bbox: BBox | null; isProjected: boolean } {
    if (!basemapMeta) {
      return { bbox: null, isProjected: false };
    }

    const basemapReference = resolveOrthographicBasemapReferenceBboxes({
      basemapMeta,
      projectionPresets: basemapService.projectionPresets,
      viewportSize: getProjectionViewportSize(),
      projectBbox: (bbox) => projectBboxForRenderProjection(bbox, basemapMeta)
    });

    if (basemapReference.projectedBbox) {
      return { bbox: basemapReference.projectedBbox, isProjected: true };
    }

    if (basemapReference.fallbackBbox) {
      return { bbox: basemapReference.fallbackBbox, isProjected: false };
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

  function getProjectionFitBbox(): BBox | null {
    const currentBasemapMeta = getProjectionMetadataForDataset(firstDatasetId);
    const mainlandBbox = currentBasemapMeta
      ? getMainlandBboxForBasemap(
          currentBasemapMeta,
          basemapService.projectionPresets
        )
      : null;
    const datasetTableBounds = getRenderedDatasetBounds(firstDatasetId);

    if (!firstDatasetId) {
      return mainlandBbox ?? currentBasemapMeta?.bbox ?? null;
    }

    const dataset = getRenderedDataset(firstDatasetId);
    const resolvedDatasetBounds = resolveOrthographicDatasetBounds(
      dataset,
      datasetTableBounds
    );
    const resolvedDatasetBbox = toBboxFromOrthographicBounds(
      resolvedDatasetBounds
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
      const referenceTable = resolveOrthographicReferenceTable({
        dataset,
        duckDataset,
        datasetTable: firstTable,
        basemapTable: worldBaseTable,
        referenceBasemapId: basemapStyleStore.referenceBasemapId
      });
      const bounds = resolveRenderedReferenceBounds({
        datasetId: firstDatasetId,
        dataset,
        referenceTable,
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
          referenceState.isProjected
        );
      }
      return;
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
            referenceState.isProjected
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
          referenceState.isProjected
        );
      }
    }
  }

  function getTableFiltersForDataset(datasetId: string) {
    const dataset = datasetsStore.datasets.find(
      (item) => item.id === datasetId
    );
    if (!dataset?.sourceFileId) {
      return undefined;
    }

    const duckDataset = duckDBOrchestrator.getDatasetBySourceFile(
      dataset.sourceFileId
    );
    if (!duckDataset?.tableName) {
      return undefined;
    }

    return getFiltersMap().get(duckDataset.tableName);
  }

  const mapLayers = useMapLayers({
    getDeckOverlay: () => null,
    getDeckInstance: () => deckInstance,
    getMap: () => null,
    getIsMapLoaded: () => isRendererLoaded,
    getWorldBaseTable: () => worldBaseTable,
    getActiveVisualizations: () => visualizations,
    buildLayerContextForViz: (viz) => mapState.buildLayerContextForViz(viz),
    getProjectionMetadataForDataset: (datasetId) =>
      getProjectionMetadataForDataset(datasetId),
    getProjectionFitBbox: () => getProjectionFitBbox(),
    getShouldRenderDatasetFallbacks: () => false,
    getTableFilters: getTableFiltersForDataset,
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
      logger.warn(
        'WebGL2 unavailable: shared facet renderer disabled',
        LogCategory.MAP
      );
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
        logger.warn(
          'Shared facet deck finalize raised an error during teardown',
          LogCategory.MAP,
          error
        );
      }
    };
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
        } finally {
          isLoadingReferenceBasemap = false;
          if (pendingOnReady) {
            pendingOnReady = false;
            triggerOnReady();
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

    <div class="facets-grid facets-grid-overlay" style={gridStyle}>
      {#each descriptors as descriptor (descriptor.facetId)}
        <div class="facet-cell" style:width="{descriptor.frame.width}px">
          <h4 class="facet-title">{descriptor.title}</h4>
          <div
            class="facet-map-shell"
            style:width="{descriptor.frame.width}px"
            style:height="{descriptor.frame.height}px"
          ></div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style lang="scss">
  .facets-grid-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: 16px;
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

  .facets-grid {
    display: grid;
    justify-content: center;
    align-content: center;
    justify-items: center;
    align-items: center;
  }

  .facets-grid-overlay {
    position: relative;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .facet-cell {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }

  .facet-title {
    font-size: 13px;
    font-weight: 500;
    text-align: center;
    color: var(--cds-text-primary, #161616);
    margin: 0;
    padding: 2px 8px;
    line-height: 20px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .facet-map-shell {
    border-radius: 0;
  }
</style>
