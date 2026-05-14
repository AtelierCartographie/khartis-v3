import type { Layer } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Matrix4 } from '@math.gl/core';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck } from '$lib/features/duckdb';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { mapProjectionStore } from '../stores/map-projection.store.svelte';
import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
import { projectionStore } from '../stores/projection.store.svelte';
import { mapHighlightStore } from '../stores/map-highlight.store.svelte';
import { basemapService } from '../services/basemap.service.svelte';
import {
  BASEMAP_LAYER_ID,
  basemapLayersStore
} from '../stores/basemap-layers.store.svelte';
import {
  createBasemapLayers,
  createDeckLayers,
  createGeoJsonLayers,
  type MetadataLayerEntry
} from '../layers';
import { extractGeometryInfo } from '../io';
import { buildProjectionForBasemap } from '../utils/geoarrow-stream-bridge.utils';
import { DeckLayerId, GeometryType } from '../constants';
import { PrimitiveFilterType } from '$lib/features/commons/stores/visualization.store.svelte';
import type { PrimitiveFilter } from '$lib/features/commons/stores/visualization.store.svelte';
import type {
  BBox,
  DeckDataRow,
  LayerContext,
  SplitRenderingTable
} from '../types';
import type { DeckInstance } from './use-map-init.svelte';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import {
  filterArrowTableByYear,
  filterArrowTableByDataFilters,
  filterArrowTableByTableFilters,
  selectRowsByIndices
} from '../utils/arrow-filter.utils';
import { getSplitMatchedGeometryRowIndices } from '../layers/split-rendering-accessors';
import {
  getMapLayerRenderOrder,
  getVisualizationRenderOrder
} from '../utils/layer-order.utils';
import type { DataTableFilter } from '$lib/features/duckdb/types';
import { getProjectionState } from '$lib/features/step-toolbar/tools/projections';
import type { ProjectionLike } from 'geoarrow-deck-stream';
import type { BasemapMetadata } from '../types/basemap.types';
import { shouldUseIdentityProjectionForDatasetCrs } from '../utils/dataset-crs.utils';
import { fitBasemapRenderProjection } from '../utils/fit-basemap-render-projection.utils';
import {
  shouldShowGeneratedOrthographicOceanLayer,
  shouldShowOrthographicBasemapLayers
} from '../utils/orthographic-basemap-visibility.utils';
import { resolveProjectionForRender } from '../utils/projection-priority.utils';
import { resolveUserProjectionOverride } from '../utils/user-projection.utils';
import { getRepresentativePointArrowTable } from '$lib/features/duckdb/orchestrator/arrow-ops';
import { resolveRepresentativePointTableName } from '../utils/representative-point-table.utils';

const GEOMETRY_TO_PRIMITIVE: Partial<Record<GeometryType, PrimitiveFilter>> = {
  [GeometryType.POINT]: PrimitiveFilterType.POINT,
  [GeometryType.MULTIPOINT]: PrimitiveFilterType.POINT,
  [GeometryType.LINESTRING]: PrimitiveFilterType.LINE,
  [GeometryType.MULTILINESTRING]: PrimitiveFilterType.LINE,
  [GeometryType.POLYGON]: PrimitiveFilterType.POLYGON,
  [GeometryType.MULTIPOLYGON]: PrimitiveFilterType.POLYGON
};

const ORTHOGRAPHIC_BASEMAP_LAYER_PREFIXES = [
  DeckLayerId.BASEMAP_TERRE,
  DeckLayerId.BASEMAP_MERS,
  DeckLayerId.BASEMAP_LACS,
  DeckLayerId.BASEMAP_RIVIERES,
  DeckLayerId.BASEMAP_RELIEF,
  DeckLayerId.BASEMAP_EQUATEUR,
  DeckLayerId.BASEMAP_MERIDIENS,
  DeckLayerId.BASEMAP_FRONTIERES,
  DeckLayerId.BASEMAP_VILLES,
  DeckLayerId.BASEMAP_VILLES_LABELS,
  DeckLayerId.BASEMAP_META_LAND,
  DeckLayerId.BASEMAP_META_LIMIT,
  DeckLayerId.BASEMAP_META_GRATICULE,
  DeckLayerId.BASEMAP_META_GEO_LINES,
  DeckLayerId.BASEMAP_META_CENTROID
] as const;

const GENERATED_ORTHOGRAPHIC_BASEMAP_LAYER_IDS = new Set<string>([
  BASEMAP_LAYER_ID.MERS,
  BASEMAP_LAYER_ID.EQUATEUR,
  BASEMAP_LAYER_ID.MERIDIENS
]);

const GENERATED_ORTHOGRAPHIC_OCEAN_LAYER_IDS = new Set<string>([
  BASEMAP_LAYER_ID.MERS
]);

const GENERATED_ORTHOGRAPHIC_CONTEXT_LAYER_IDS = new Set<string>([
  BASEMAP_LAYER_ID.EQUATEUR,
  BASEMAP_LAYER_ID.MERIDIENS
]);

const DEFAULT_GENERATED_OCEAN_COLOR = '#e0e0e0';
const DEFAULT_GENERATED_OCEAN_OPACITY = 100;

export interface UseMapLayersProps {
  getDeckOverlay: () => MapboxOverlay | null;
  getDeckInstance: () => DeckInstance | null;
  getMap: () => MapLibreMap | null;
  getIsMapLoaded: () => boolean;
  getWorldBaseTable: () => ArrowTable | null;
  getActiveVisualizations: () => VisualizationConfig[];
  buildLayerContextForViz: (viz: VisualizationConfig) => LayerContext;
  getProjectionMetadataForDataset?: (
    datasetId: string
  ) => BasemapMetadata | null;
  getProjectionFitBbox?: () => BBox | null;
  getModelMatrix?: () => Matrix4 | null | undefined;
  getShouldRenderDatasetFallbacks?: () => boolean;
  getTableFilters?: (datasetId: string) => DataTableFilter[] | undefined;
  onBasemapLayersLoaded?: () => void;
  onRepresentativePointTablesLoaded?: () => void;
}

export interface UseMapLayersReturn {
  updateLayers: (
    tables: Map<string, ArrowTable>,
    geoJSONs: Map<string, FeatureCollection>,
    splitData?: Map<string, SplitRenderingTable>,
    densityTables?: Map<string, ArrowTable>
  ) => void;
}

export function useMapLayers(props: UseMapLayersProps): UseMapLayersReturn {
  const {
    getDeckOverlay,
    getDeckInstance,
    getMap,
    getIsMapLoaded,
    getWorldBaseTable,
    getActiveVisualizations,
    buildLayerContextForViz,
    getProjectionMetadataForDataset,
    getProjectionFitBbox,
    getModelMatrix,
    getShouldRenderDatasetFallbacks,
    getTableFilters,
    onBasemapLayersLoaded,
    onRepresentativePointTablesLoaded
  } = props;

  const DATA_PREVIEW_FILL_COLOR: [number, number, number] = [96, 96, 96];
  const DATA_PREVIEW_STROKE_COLOR: [number, number, number] = [255, 255, 255];
  const DATA_PREVIEW_FILL_OPACITY = 0.9;
  const DATA_PREVIEW_STROKE_WIDTH = 1;
  const DATA_PREVIEW_STROKE_OPACITY = 1;

  function buildDatasetFallbackContext(datasetId: string): LayerContext {
    return {
      viz: null,
      datasetId,
      fillColor: DATA_PREVIEW_FILL_COLOR,
      symbolFillColor: DATA_PREVIEW_FILL_COLOR,
      strokeColor: DATA_PREVIEW_STROKE_COLOR,
      fillOpacity: DATA_PREVIEW_FILL_OPACITY,
      strokeWidth: DATA_PREVIEW_STROKE_WIDTH,
      strokeOpacity: DATA_PREVIEW_STROKE_OPACITY,
      statistics: { min: 0, max: 100 },
      categoryColorMap: null,
      highlightedRowIds: mapHighlightStore.hasHighlights
        ? mapHighlightStore.highlightedRowIds
        : undefined,
      highlightVersion: mapHighlightStore.version
    };
  }

  function findFirstSymbolLayerId(map: MapLibreMap): string | undefined {
    const style = map.getStyle();
    if (!style?.layers) return undefined;

    for (const layer of style.layers) {
      if (layer.type === 'symbol') {
        return layer.id;
      }
    }
    return undefined;
  }

  function setLayers(layers: Layer<DeckDataRow>[]): boolean {
    const deckOverlay = getDeckOverlay();
    const deckInstance = getDeckInstance();

    try {
      if (deckOverlay) {
        deckOverlay.setProps({ layers });
        return true;
      }
      if (deckInstance) {
        deckInstance.setProps({ layers });
        return true;
      }
      return false;
    } catch (error) {
      logger.error(
        'Failed to apply Deck.gl layers on current rendering context',
        LogCategory.MAP,
        error
      );
      return false;
    }
  }

  let lastAppliedLayers: Layer<DeckDataRow>[] = [];

  function isOrthographicBasemapLayer(layer: Layer<DeckDataRow>): boolean {
    const layerId = String(layer.id);
    return ORTHOGRAPHIC_BASEMAP_LAYER_PREFIXES.some(
      (prefix) => layerId === prefix || layerId.startsWith(`${prefix}-`)
    );
  }

  function getPreservablePreviousLayers(
    shouldShowBasemapLayers: boolean
  ): Layer<DeckDataRow>[] {
    if (shouldShowBasemapLayers) {
      return lastAppliedLayers;
    }
    return lastAppliedLayers.filter(
      (layer) => !isOrthographicBasemapLayer(layer)
    );
  }

  const basemapProjectionCache = new WeakMap<
    NonNullable<BasemapMetadata>,
    Map<string, ProjectionLike>
  >();
  const representativePointTableCache = new WeakMap<ArrowTable, ArrowTable>();
  const representativePointGeometryInfoCache = new WeakMap<
    ArrowTable,
    NonNullable<ReturnType<typeof extractGeometryInfo>>
  >();
  const representativePointLoadPromises = new WeakMap<
    ArrowTable,
    Promise<void>
  >();
  const representativePointLoadFailures = new WeakSet<ArrowTable>();
  const representativePointNotifyOnReady = new WeakSet<ArrowTable>();
  const matchedSplitTableCache = new WeakMap<
    ArrowTable,
    WeakMap<ArrowTable, Map<string, ArrowTable>>
  >();
  let cachedProjectionOverrideKey: string | null = null;
  let cachedProjectionOverrideRef: ProjectionLike | undefined;

  function getProjectionViewportSize(): { width: number; height: number } {
    return {
      width: Math.max(1, projectionStore.canvasSize.width),
      height: Math.max(1, projectionStore.canvasSize.height)
    };
  }

  function getProjectionFromMetadata(
    metadata: BasemapMetadata | null | undefined,
    isOrthographicMode: boolean,
    fitBbox: BBox | null,
    fitPaddingPx: number
  ): ProjectionLike | undefined {
    if (!isOrthographicMode || !metadata || metadata.isCustom) {
      return undefined;
    }

    const viewportSize = getProjectionViewportSize();
    const cacheKey = [
      `${viewportSize.width}x${viewportSize.height}`,
      `padding:${fitPaddingPx}`,
      `bbox:${fitBbox?.join(',') ?? 'none'}`
    ].join('|');
    const cached = basemapProjectionCache.get(metadata)?.get(cacheKey);
    if (cached) {
      return cached;
    }

    const projection = fitBasemapRenderProjection({
      projection: buildProjectionForBasemap(
        metadata,
        viewportSize.width,
        viewportSize.height,
        basemapService.projectionPresets
      ),
      metadata,
      fitBbox,
      width: viewportSize.width,
      height: viewportSize.height,
      padding: fitPaddingPx
    });
    let entryCache = basemapProjectionCache.get(metadata);
    if (!entryCache) {
      entryCache = new Map();
      basemapProjectionCache.set(metadata, entryCache);
    }
    entryCache.set(cacheKey, projection);
    return projection;
  }

  function getProjectionOverride(
    isOrthographicMode: boolean,
    fitBbox: BBox | null
  ): ProjectionLike | undefined {
    if (!isOrthographicMode) {
      return undefined;
    }

    const projState = getProjectionState();
    const viewportSize = getProjectionViewportSize();
    const fitPaddingPx = projectionStore.fitPaddingPx;
    if (!projState.overrideActive || projState.overrideSource !== 'manual') {
      return undefined;
    }

    if (!fitBbox) {
      return undefined;
    }

    const overrideKey = [
      projState.customCode
        ? `custom:${projState.customCode}`
        : projState.suggestionD3Config
          ? `d3:${JSON.stringify(projState.suggestionD3Config)}`
          : `preset:${projState.selected}`,
      `bbox:${fitBbox.join(',')}`,
      `viewport:${viewportSize.width}x${viewportSize.height}`,
      `padding:${fitPaddingPx}`,
      `center:${(projState.center ?? [projState.longitude, projState.latitude]).join(',')}`,
      `rotation:${projState.rotation}`
    ].join('|');

    if (overrideKey === cachedProjectionOverrideKey) {
      return cachedProjectionOverrideRef;
    }

    const projectionOverride = resolveUserProjectionOverride({
      state: projState,
      fitBbox,
      viewportSize,
      padding: fitPaddingPx,
      projectionPresets: basemapService.projectionPresets
    });

    cachedProjectionOverrideKey = overrideKey;
    cachedProjectionOverrideRef = projectionOverride;

    return projectionOverride;
  }

  function getDatasetGeometryCrs(datasetId: string): string | null | undefined {
    return datasetsStore.datasets.find((dataset) => dataset.id === datasetId)
      ?.geometry?.crs;
  }

  function getDatasetTableName(datasetId: string): string | null {
    const dataset = datasetsStore.datasets.find(
      (item) => item.id === datasetId
    );
    if (dataset?.tableName) {
      return dataset.tableName;
    }

    if (dataset?.sourceFileId) {
      return (
        duckDBOrchestrator.getDatasetBySourceFile(dataset.sourceFileId)
          ?.tableName ?? null
      );
    }

    return duckDBOrchestrator.getDatasetById(datasetId)?.tableName ?? null;
  }

  function getDatasetJoinedBasemap(datasetId: string): string | null {
    const dataset = datasetsStore.datasets.find(
      (item) => item.id === datasetId
    );
    if (dataset?.joinedBasemap) {
      return dataset.joinedBasemap;
    }

    if (dataset?.sourceFileId) {
      return (
        duckDBOrchestrator.getDatasetBySourceFile(dataset.sourceFileId)
          ?.joinedBasemap ?? null
      );
    }

    return duckDBOrchestrator.getDatasetById(datasetId)?.joinedBasemap ?? null;
  }

  function supportsRepresentativePointTable(
    geometryType: string | undefined
  ): boolean {
    return (
      geometryType === GeometryType.POLYGON ||
      geometryType === GeometryType.MULTIPOLYGON ||
      geometryType === GeometryType.LINESTRING ||
      geometryType === GeometryType.MULTILINESTRING ||
      geometryType === GeometryType.MULTIPOINT
    );
  }

  function getCachedRepresentativeGeometryInfo(
    table: ArrowTable
  ): ReturnType<typeof extractGeometryInfo> | null {
    const cached = representativePointGeometryInfoCache.get(table);
    if (cached) {
      return cached;
    }

    const geometryInfo = extractGeometryInfo(table);
    if (geometryInfo) {
      representativePointGeometryInfoCache.set(table, geometryInfo);
    }
    return geometryInfo;
  }

  function startRepresentativePointTableLoad(
    datasetId: string,
    sourceTable: ArrowTable,
    geometryInfo: NonNullable<LayerContext['geometryInfo']>,
    joinedBasemapId?: string | null,
    notifyOnReady = false
  ): void {
    if (!supportsRepresentativePointTable(geometryInfo.type)) {
      return;
    }

    if (notifyOnReady) {
      representativePointNotifyOnReady.add(sourceTable);
    }

    if (
      representativePointTableCache.has(sourceTable) ||
      representativePointLoadPromises.has(sourceTable) ||
      representativePointLoadFailures.has(sourceTable)
    ) {
      return;
    }

    const loadPromise = (async () => {
      if (joinedBasemapId) {
        await basemapService.ensureBasemapLayersLoaded(joinedBasemapId, [
          BasemapLayerType.CENTROID
        ]);

        const centroidTable = basemapService.getBasemapLayerTableByType(
          joinedBasemapId,
          BasemapLayerType.CENTROID
        );

        if (centroidTable) {
          return centroidTable;
        }
      }

      const tableName = await resolveRepresentativePointTableName({
        datasetTableName: getDatasetTableName(datasetId),
        joinedBasemapId,
        loadBasemapGeometryTableName: (basemapId) =>
          basemapService.loadGeometryIntoDuckDB(basemapId)
      });
      if (!tableName) {
        return null;
      }

      return getRepresentativePointArrowTable(
        tableName,
        geometryInfo.type,
        Duck
      );
    })()
      .then((representativePointTable) => {
        if (!representativePointTable) {
          return;
        }
        representativePointTableCache.set(
          sourceTable,
          representativePointTable
        );
        getCachedRepresentativeGeometryInfo(representativePointTable);
        if (representativePointNotifyOnReady.has(sourceTable)) {
          representativePointNotifyOnReady.delete(sourceTable);
          onRepresentativePointTablesLoaded?.();
        }
      })
      .catch((error) => {
        representativePointLoadFailures.add(sourceTable);
        representativePointNotifyOnReady.delete(sourceTable);
        logger.warn(
          'Deferred representative point table loading failed',
          LogCategory.MAP,
          {
            datasetId,
            joinedBasemapId,
            geometryType: geometryInfo.type,
            error
          }
        );
      })
      .finally(() => {
        representativePointLoadPromises.delete(sourceTable);
      });

    representativePointLoadPromises.set(sourceTable, loadPromise);
  }

  function prefetchRepresentativePointTable(
    datasetId: string,
    sourceTable: ArrowTable,
    geometryInfo: NonNullable<LayerContext['geometryInfo']>,
    joinedBasemapId?: string | null
  ): void {
    startRepresentativePointTableLoad(
      datasetId,
      sourceTable,
      geometryInfo,
      joinedBasemapId,
      false
    );
  }

  function getRepresentativePointTable(
    datasetId: string,
    sourceTable: ArrowTable,
    geometryInfo: NonNullable<LayerContext['geometryInfo']>,
    joinedBasemapId?: string | null
  ): ArrowTable | null {
    if (!supportsRepresentativePointTable(geometryInfo.type)) {
      return null;
    }

    const cachedTable = representativePointTableCache.get(sourceTable);
    if (cachedTable) {
      return cachedTable;
    }

    if (joinedBasemapId) {
      const loadedCentroidTable = basemapService.getBasemapLayerTableByType(
        joinedBasemapId,
        BasemapLayerType.CENTROID
      );

      if (loadedCentroidTable) {
        representativePointTableCache.set(sourceTable, loadedCentroidTable);
        getCachedRepresentativeGeometryInfo(loadedCentroidTable);
        return loadedCentroidTable;
      }
    }

    if (representativePointLoadFailures.has(sourceTable)) {
      return null;
    }

    startRepresentativePointTableLoad(
      datasetId,
      sourceTable,
      geometryInfo,
      joinedBasemapId,
      true
    );
    return null;
  }

  function getDatasetDefaultProjection(
    datasetId: string,
    metadata: BasemapMetadata | null | undefined,
    isOrthographicMode: boolean,
    fitBbox: BBox | null,
    fitPaddingPx: number
  ): ProjectionLike | undefined {
    const datasetGeometryCrs = getDatasetGeometryCrs(datasetId);

    if (
      !isOrthographicMode &&
      shouldUseIdentityProjectionForDatasetCrs(datasetGeometryCrs)
    ) {
      return undefined;
    }

    return getProjectionFromMetadata(
      metadata,
      isOrthographicMode,
      fitBbox,
      fitPaddingPx
    );
  }

  function getDatasetProjectionMetadata(
    datasetId: string,
    currentMetadata: BasemapMetadata | null
  ): BasemapMetadata | null {
    const metadata = getProjectionMetadataForDataset?.(datasetId);
    const resolvedMetadata =
      metadata === undefined ? currentMetadata : metadata;
    if (
      !basemapStyleStore.referenceBasemapId &&
      !getDatasetJoinedBasemap(datasetId)
    ) {
      return null;
    }
    return resolvedMetadata;
  }

  function getMatchedSplitTable(
    table: ArrowTable,
    split: SplitRenderingTable
  ): ArrowTable {
    let datasetCache = matchedSplitTableCache.get(table);
    if (!datasetCache) {
      datasetCache = new WeakMap();
      matchedSplitTableCache.set(table, datasetCache);
    }

    let columnCache = datasetCache.get(split.dataset);
    if (!columnCache) {
      columnCache = new Map();
      datasetCache.set(split.dataset, columnCache);
    }

    const cached = columnCache.get(split.featureIdColumn);
    if (cached) {
      return cached;
    }

    const matchedRows = getSplitMatchedGeometryRowIndices(
      table,
      split.dataset,
      split.featureIdColumn
    );
    const matchedTable =
      matchedRows.length === table.numRows
        ? table
        : selectRowsByIndices(table, matchedRows);
    columnCache.set(split.featureIdColumn, matchedTable);
    return matchedTable;
  }

  function getRenderableSplitGeometryTable(
    split: SplitRenderingTable | undefined
  ): ArrowTable | undefined {
    if (!split) {
      return undefined;
    }

    return getMatchedSplitTable(split.geometry, split);
  }

  function filterSplitGeometryTableByDatasetRows(
    geometryTable: ArrowTable,
    split: SplitRenderingTable,
    dataFilters: VisualizationConfig['dataFilters'],
    primitiveType: PrimitiveFilter | undefined,
    tableFilters: DataTableFilter[] | undefined,
    yearFilter: VisualizationConfig['yearFilter']
  ): ArrowTable {
    const matchedGeometryTable = getMatchedSplitTable(geometryTable, split);
    const dataFilteredDataset = filterArrowTableByDataFilters(
      split.dataset,
      dataFilters,
      primitiveType
    );
    const tableFilteredDataset = filterArrowTableByTableFilters(
      dataFilteredDataset,
      tableFilters
    );
    const filteredDataset = yearFilter
      ? filterArrowTableByYear(tableFilteredDataset, yearFilter)
      : tableFilteredDataset;

    if (filteredDataset === split.dataset) {
      return matchedGeometryTable;
    }

    const matchingRows = getSplitMatchedGeometryRowIndices(
      matchedGeometryTable,
      filteredDataset,
      split.featureIdColumn
    );
    return matchingRows.length === matchedGeometryTable.numRows
      ? matchedGeometryTable
      : selectRowsByIndices(matchedGeometryTable, matchingRows);
  }

  function getRequestedMetadataLayerTypes(
    worldBaseTable: ArrowTable | null
  ): BasemapLayerType[] {
    const requestedTypes = new Set<BasemapLayerType>();

    for (const layer of basemapLayersStore.visibleLayers) {
      switch (layer.id) {
        case 'terre':
          if (!worldBaseTable) {
            requestedTypes.add(BasemapLayerType.LAND);
          }
          break;
        case 'frontieres':
          requestedTypes.add(BasemapLayerType.LIMIT);
          break;
        case 'lacs':
          requestedTypes.add(BasemapLayerType.POLYGON);
          break;
        case 'rivieres':
          requestedTypes.add(BasemapLayerType.LINE);
          break;
        case 'villes':
          requestedTypes.add(BasemapLayerType.CENTROID);
          requestedTypes.add(BasemapLayerType.POINT);
          break;
      }
    }

    return [...requestedTypes];
  }

  function hasVisibleGeneratedBasemapLayer(
    layerIds: ReadonlySet<string> = GENERATED_ORTHOGRAPHIC_BASEMAP_LAYER_IDS
  ): boolean {
    return basemapLayersStore.layers.some(
      (layer) => layer.visible && layerIds.has(layer.id)
    );
  }

  function isGeneratedOceanLayer(layer: Layer<DeckDataRow>): boolean {
    return String(layer.id).startsWith(DeckLayerId.BASEMAP_MERS);
  }

  function hasCustomizedGeneratedOceanStyle(): boolean {
    const oceanLayer = basemapLayersStore.getLayer(BASEMAP_LAYER_ID.MERS);
    if (!oceanLayer) {
      return false;
    }

    return (
      oceanLayer.color !== DEFAULT_GENERATED_OCEAN_COLOR ||
      oceanLayer.opacity !== DEFAULT_GENERATED_OCEAN_OPACITY
    );
  }

  function updateLayers(
    tables: Map<string, ArrowTable>,
    geoJSONs: Map<string, FeatureCollection>,
    splitData?: Map<string, SplitRenderingTable>,
    densityTables?: Map<string, ArrowTable>
  ): void {
    const deckOverlay = getDeckOverlay();
    const deckInstance = getDeckInstance();
    const map = getMap();

    if ((!deckOverlay && !deckInstance) || !getIsMapLoaded()) {
      return;
    }

    if (deckOverlay && map && !map.isStyleLoaded()) {
      return;
    }

    try {
      const isOSMActive = Boolean(osmBasemapStore.activeOSMBasemap);
      const worldBaseTable = getWorldBaseTable();
      const activeVisualizations = getActiveVisualizations();
      const visualizationsToRender =
        getVisualizationRenderOrder(activeVisualizations);

      const isOrthographicMode = !deckOverlay && Boolean(deckInstance);
      const matrixToApply = isOrthographicMode
        ? (getModelMatrix?.() ?? projectionStore.modelMatrix)
        : null;

      const projectionSuffix = deckOverlay
        ? mapProjectionStore.projection
        : undefined;
      const projectionFitBbox = getProjectionFitBbox?.() ?? null;
      const fitPaddingPx = projectionStore.fitPaddingPx;

      const currentMetadata = basemapService.currentMetadata;
      const basemapProjection = getProjectionFromMetadata(
        currentMetadata,
        isOrthographicMode,
        projectionFitBbox,
        fitPaddingPx
      );
      const projectionState = getProjectionState();
      const projectionOverride = getProjectionOverride(
        isOrthographicMode,
        projectionFitBbox
      );

      const activeBasemapProjection = resolveProjectionForRender(
        basemapProjection,
        projectionOverride,
        projectionState.overrideSource
      );

      const beforeId =
        map && deckOverlay ? findFirstSymbolLayerId(map) : undefined;

      const layers: Layer<DeckDataRow>[] = [];

      const datasetContentIds = new Set<string>();
      for (const datasetId of tables.keys()) datasetContentIds.add(datasetId);
      for (const datasetId of geoJSONs.keys()) datasetContentIds.add(datasetId);
      for (const viz of activeVisualizations)
        datasetContentIds.add(viz.datasetId);
      for (const dataset of datasetsStore.datasets) {
        datasetContentIds.add(dataset.id);
      }
      if (splitData) {
        for (const datasetId of splitData.keys()) {
          datasetContentIds.add(datasetId);
        }
      }
      if (densityTables) {
        for (const datasetId of densityTables.keys()) {
          datasetContentIds.add(datasetId);
        }
      }

      let hasJoinedBasemapReference = false;
      for (const datasetId of datasetContentIds) {
        if (getDatasetJoinedBasemap(datasetId)) {
          hasJoinedBasemapReference = true;
          break;
        }
      }

      const hasDatasetContent = datasetContentIds.size > 0;
      const shouldShowBasemapLayers = shouldShowOrthographicBasemapLayers({
        isOrthographicMode,
        isOSMActive,
        hasDatasetContent,
        hasBasemapReference:
          Boolean(basemapStyleStore.referenceBasemapId) ||
          hasJoinedBasemapReference
      });
      const hasManualProjectionOverride =
        projectionState.overrideActive === true &&
        projectionState.overrideSource === 'manual';
      const canShowGeneratedBasemapLayers =
        !shouldShowBasemapLayers && isOrthographicMode && !isOSMActive;
      const shouldShowGeneratedOceanLayer =
        shouldShowGeneratedOrthographicOceanLayer({
          canShowGeneratedBasemapLayers,
          hasVisibleGeneratedOceanLayer: hasVisibleGeneratedBasemapLayer(
            GENERATED_ORTHOGRAPHIC_OCEAN_LAYER_IDS
          ),
          hasDatasetContent,
          hasManualProjectionOverride,
          hasCustomizedOceanStyle: hasCustomizedGeneratedOceanStyle()
        });
      const shouldShowGeneratedContextLayers =
        canShowGeneratedBasemapLayers &&
        hasVisibleGeneratedBasemapLayer(
          GENERATED_ORTHOGRAPHIC_CONTEXT_LAYER_IDS
        );
      const shouldShowGeneratedBasemapLayers =
        shouldShowGeneratedOceanLayer || shouldShowGeneratedContextLayers;
      const shouldKeepOrthographicBasemapLayers =
        shouldShowBasemapLayers || shouldShowGeneratedBasemapLayers;

      let basemapBackgroundLayers: Layer<DeckDataRow>[] = [];
      let basemapForegroundLayers: Layer<DeckDataRow>[] = [];

      if (shouldKeepOrthographicBasemapLayers) {
        try {
          const basemapCtx = {
            modelMatrix: matrixToApply ?? undefined,
            projectionSuffix,
            projection: shouldShowBasemapLayers
              ? activeBasemapProjection
              : projectionOverride,
            bbox: shouldShowBasemapLayers
              ? (currentMetadata?.bbox ?? projectionFitBbox)
              : projectionFitBbox
          };

          const metadataLayers: MetadataLayerEntry[] = [];
          if (shouldShowBasemapLayers && currentMetadata) {
            const requestedLayerTypes =
              getRequestedMetadataLayerTypes(worldBaseTable);
            if (requestedLayerTypes.length > 0) {
              void basemapService
                .ensureCurrentLayersLoaded(requestedLayerTypes)
                .then((didLoad) => {
                  if (didLoad) {
                    onBasemapLayersLoaded?.();
                  }
                })
                .catch((error) => {
                  logger.warn(
                    'Deferred basemap layer loading failed',
                    LogCategory.MAP,
                    { basemapId: currentMetadata.file, error }
                  );
                });
            }

            for (const layer of currentMetadata.layers) {
              const table = layer.file
                ? basemapService.currentLayers.get(layer.file)
                : currentMetadata.isCustom
                  ? null
                  : worldBaseTable;
              if (!table) continue;
              metadataLayers.push({
                table,
                style: layer.style ?? null,
                type: layer.type,
                file: layer.file ?? currentMetadata.file
              });
            }
          }

          const additionalData = {
            frontieresTable: shouldShowBasemapLayers
              ? (basemapService.getLayerTableByType(BasemapLayerType.LIMIT) ??
                undefined)
              : undefined,
            availableMetadataLayerTypes: metadataLayers.map(
              (layer) => layer.type
            ),
            metadataLayers,
            stylePresets: shouldShowBasemapLayers
              ? basemapService.stylePresets
              : null
          };
          const basemapGroups = createBasemapLayers(
            shouldShowBasemapLayers ? worldBaseTable : null,
            basemapCtx,
            additionalData
          );
          basemapBackgroundLayers =
            shouldShowBasemapLayers || shouldShowGeneratedOceanLayer
              ? basemapGroups.background
              : basemapGroups.background.filter(
                  (layer) => !isGeneratedOceanLayer(layer)
                );
          basemapForegroundLayers = basemapGroups.foreground;
        } catch (error) {
          logger.error(
            'Basemap layer creation failed; rendering thematic layers only',
            LogCategory.MAP,
            error
          );
        }
      }

      const renderedDatasetIds = new Set<string>();
      for (const viz of visualizationsToRender) {
        try {
          const datasetId = viz.datasetId;
          const split = splitData?.get(datasetId);
          const table =
            getRenderableSplitGeometryTable(split) ?? tables.get(datasetId);
          const densityTable = densityTables?.get(datasetId);
          const geojson = geoJSONs.get(datasetId);

          const ctx = buildLayerContextForViz(viz);
          if (split) {
            ctx.splitDatasetTable = split.dataset;
            ctx.splitFeatureIdColumn = split.featureIdColumn;
          }
          if (densityTable) {
            ctx.densityTable = densityTable;
            ctx.densityGeometryInfo =
              extractGeometryInfo(densityTable) ?? undefined;
          }
          const datasetProjectionMetadata = getDatasetProjectionMetadata(
            datasetId,
            currentMetadata
          );
          const datasetGeometryCrs = getDatasetGeometryCrs(datasetId);
          const allowProjectionOverride =
            !shouldUseIdentityProjectionForDatasetCrs(datasetGeometryCrs);
          const datasetDefaultProjection = getDatasetDefaultProjection(
            datasetId,
            datasetProjectionMetadata,
            isOrthographicMode,
            projectionFitBbox,
            fitPaddingPx
          );
          ctx.modelMatrix = matrixToApply;
          ctx.projectionSuffix = projectionSuffix;
          ctx.beforeId = beforeId;
          ctx.customProjection = resolveProjectionForRender(
            datasetDefaultProjection,
            projectionOverride,
            projectionState.overrideSource,
            allowProjectionOverride
          );

          if (geojson) {
            const geojsonLayers = createGeoJsonLayers(geojson, ctx);
            layers.push(...geojsonLayers);
            if (geojsonLayers.length > 0) {
              renderedDatasetIds.add(datasetId);
            }
          } else if (table) {
            const geoMetadata = table.schema.metadata?.get('geo');
            if (!geoMetadata) {
              logger.warn(
                'Arrow table missing GeoArrow metadata, skipping',
                LogCategory.MAP,
                { datasetId }
              );
              continue;
            }
            const geoInfo = extractGeometryInfo(table);
            ctx.geometryInfo = geoInfo ?? undefined;
            const tablePrimitiveType = geoInfo?.type
              ? GEOMETRY_TO_PRIMITIVE[geoInfo.type as GeometryType]
              : undefined;

            const vizFiltered = filterArrowTableByDataFilters(
              table,
              viz.dataFilters,
              tablePrimitiveType
            );
            const tableFilters = getTableFilters?.(datasetId);
            const tableFiltered = filterArrowTableByTableFilters(
              vizFiltered,
              tableFilters
            );
            const filteredTable = viz.yearFilter
              ? filterArrowTableByYear(tableFiltered, viz.yearFilter)
              : tableFiltered;
            const joinedBasemapId = split
              ? getDatasetJoinedBasemap(datasetId)
              : null;
            const rawRepresentativePointBaseTable = geoInfo
              ? getRepresentativePointTable(
                  datasetId,
                  table,
                  geoInfo,
                  joinedBasemapId
                )
              : null;
            const representativePointBaseTable =
              rawRepresentativePointBaseTable && split
                ? getMatchedSplitTable(rawRepresentativePointBaseTable, split)
                : rawRepresentativePointBaseTable;

            if (representativePointBaseTable) {
              const filteredRepresentativePointTable = split
                ? filterSplitGeometryTableByDatasetRows(
                    representativePointBaseTable,
                    split,
                    viz.dataFilters,
                    PrimitiveFilterType.POINT,
                    tableFilters,
                    viz.yearFilter
                  )
                : (() => {
                    const representativeVizFiltered =
                      filterArrowTableByDataFilters(
                        representativePointBaseTable,
                        viz.dataFilters,
                        PrimitiveFilterType.POINT
                      );
                    const representativeTableFiltered =
                      filterArrowTableByTableFilters(
                        representativeVizFiltered,
                        tableFilters
                      );
                    return viz.yearFilter
                      ? filterArrowTableByYear(
                          representativeTableFiltered,
                          viz.yearFilter
                        )
                      : representativeTableFiltered;
                  })();
              ctx.representativePointTable = filteredRepresentativePointTable;
              ctx.representativePointGeometryInfo =
                getCachedRepresentativeGeometryInfo(
                  filteredRepresentativePointTable
                ) ?? undefined;
            } else {
              ctx.representativePointTable = undefined;
              ctx.representativePointGeometryInfo = undefined;
            }

            const arrowLayers = createDeckLayers(filteredTable, ctx);
            layers.push(...arrowLayers);
            if (arrowLayers.length > 0) {
              renderedDatasetIds.add(datasetId);
            }
          }
        } catch (error) {
          logger.error(
            'Visualization layer creation failed; continuing with remaining visualizations',
            LogCategory.MAP,
            {
              visualizationId: viz.id,
              datasetId: viz.datasetId,
              error
            }
          );
        }
      }

      const shouldRenderDatasetFallbacks =
        getShouldRenderDatasetFallbacks?.() ?? false;

      if (shouldRenderDatasetFallbacks) {
        for (const [datasetId, table] of tables) {
          const joinedBasemapId = getDatasetJoinedBasemap(datasetId);
          if (!joinedBasemapId) {
            continue;
          }

          const geometryInfo = extractGeometryInfo(table);
          if (!geometryInfo) {
            continue;
          }

          prefetchRepresentativePointTable(
            datasetId,
            table,
            geometryInfo,
            joinedBasemapId
          );
        }
      }

      if (shouldRenderDatasetFallbacks) {
        const fallbackDatasetIds = new Set<string>([
          ...tables.keys(),
          ...geoJSONs.keys()
        ]);

        for (const renderedDatasetId of renderedDatasetIds) {
          fallbackDatasetIds.delete(renderedDatasetId);
        }

        for (const datasetId of fallbackDatasetIds) {
          const table = tables.get(datasetId);
          const geojson = geoJSONs.get(datasetId);
          const fallbackCtx = buildDatasetFallbackContext(datasetId);
          const datasetProjectionMetadata = getDatasetProjectionMetadata(
            datasetId,
            currentMetadata
          );
          const datasetGeometryCrs = getDatasetGeometryCrs(datasetId);
          const allowProjectionOverride =
            !shouldUseIdentityProjectionForDatasetCrs(datasetGeometryCrs);
          const datasetDefaultProjection = getDatasetDefaultProjection(
            datasetId,
            datasetProjectionMetadata,
            isOrthographicMode,
            projectionFitBbox,
            fitPaddingPx
          );
          fallbackCtx.modelMatrix = matrixToApply;
          fallbackCtx.projectionSuffix = projectionSuffix;
          fallbackCtx.beforeId = beforeId;
          fallbackCtx.customProjection = resolveProjectionForRender(
            datasetDefaultProjection,
            projectionOverride,
            projectionState.overrideSource,
            allowProjectionOverride
          );

          if (geojson) {
            const fallbackGeoJsonLayers = createGeoJsonLayers(
              geojson,
              fallbackCtx
            );
            layers.push(...fallbackGeoJsonLayers);
          } else if (table) {
            const geoMetadata = table.schema.metadata?.get('geo');
            if (!geoMetadata) {
              logger.warn(
                'Arrow table missing GeoArrow metadata, skipping fallback preview',
                LogCategory.MAP,
                { datasetId }
              );
              continue;
            }
            const fallbackArrowLayers = createDeckLayers(table, fallbackCtx);
            layers.push(...fallbackArrowLayers);
          }
        }
      }

      const orderedLayers = getMapLayerRenderOrder({
        basemapBackgroundLayers,
        thematicLayers: layers,
        basemapForegroundLayers
      });
      layers.length = 0;
      layers.push(...orderedLayers);

      const hasExpectedActiveViz = activeVisualizations.length > 0;
      const hasExpectedDatasetFallbacks =
        shouldRenderDatasetFallbacks && (tables.size > 0 || geoJSONs.size > 0);
      const hasVisibleBasemapConfig =
        shouldKeepOrthographicBasemapLayers &&
        basemapLayersStore.visibleLayers.length > 0;
      const hasExpectedVisibleLayers =
        hasExpectedActiveViz ||
        hasExpectedDatasetFallbacks ||
        hasVisibleBasemapConfig;
      const previousLayersToPreserve = getPreservablePreviousLayers(
        shouldKeepOrthographicBasemapLayers
      );
      const shouldPreservePreviousLayers =
        layers.length === 0 &&
        previousLayersToPreserve.length > 0 &&
        hasExpectedVisibleLayers;

      if (shouldPreservePreviousLayers) {
        const applied = setLayers(previousLayersToPreserve);
        if (!applied) {
          return;
        }
        lastAppliedLayers = previousLayersToPreserve;
      } else {
        const applied = setLayers(layers);
        if (!applied) {
          return;
        }
        if (layers.length > 0) {
          lastAppliedLayers = layers;
        } else if (
          !hasExpectedVisibleLayers ||
          previousLayersToPreserve.length !== lastAppliedLayers.length
        ) {
          lastAppliedLayers = previousLayersToPreserve;
        }
      }
      logger.success('Deck.gl layers applied', LogCategory.MAP, {
        layerCount: layers.length,
        isOSMActive
      });
    } catch (error) {
      logger.error(
        'Unexpected failure while updating map layers',
        LogCategory.MAP,
        error
      );

      if (lastAppliedLayers.length > 0) {
        setLayers(lastAppliedLayers);
      }
    }
  }

  return {
    updateLayers
  };
}
