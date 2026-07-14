import type { Layer } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Matrix4 } from '@math.gl/core';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  Duck,
  duckDBOrchestrator,
  type DataTableFilter
} from '$lib/features/duckdb';
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
import { SYNTHETIC_AUX_LAYER_KEY } from '$lib/features/commons/constants/basemap.constants';
import {
  createBasemapLayers,
  createDeckLayers,
  createGeoJsonLayers,
  type MetadataLayerEntry
} from '../layers';
import { extractGeometryInfo } from '../io';
import { buildProjectionForBasemap } from '../utils/geoarrow-stream-bridge.utils';
import { DeckLayerId, GeometryType } from '../constants';
import {
  PrimitiveFilterType,
  getSymbolPrimitive,
  getLinePrimitive,
  getTextPrimitive,
  getPolygonPrimitive
} from '$lib/features/commons/stores/visualization.store.svelte';
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
  filterArrowTableByDataFilters,
  filterArrowTableByTableFilters,
  selectRowsByIndices
} from '../utils/arrow-filter.utils';
import { get_bbox_center, get_max_scale } from '../core/projscreen';
import { getSplitMatchedGeometryRowIndices } from '../layers/split-rendering-accessors';
import {
  applyPanelRenderOrder,
  getVisualizationRenderOrder
} from '../utils/layer-order.utils';
import {
  buildVisualizationSubLayerId,
  classifyThematicLayerPrimitive,
  mergeLayerOrder,
  type LayerOrderRow
} from '../utils/layer-panel-row.utils';
import { facetsStore } from '$lib/features/step-toolbar/tools/facets';
import { layerOrderStore } from '$lib/features/step-toolbar/tools/layers/layer-order.store.svelte';
import { getProjectionState } from '$lib/features/step-toolbar/tools/projections';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import type { BasemapMetadata } from '../types/basemap.types';
import {
  shouldReprojectDatasetForActiveProjection,
  shouldUseIdentityProjectionForDatasetCrs
} from '../utils/dataset-crs.utils';
import { fitBasemapRenderProjection } from '../utils/fit-basemap-render-projection.utils';
import {
  shouldShowGeneratedOrthographicOceanLayer,
  shouldShowOrthographicBasemapLayers
} from '../utils/orthographic-basemap-visibility.utils';
import { getBasemapAuxLayerDefaultVisibility } from '../utils/basemap-aux-layer-visibility.utils';
import { resolveProjectionForRender } from '../utils/projection-priority.utils';
import {
  applyProjectionSphereMask,
  createProjectionSphereMaskLayer,
  createProjectionSphereOutlineLayer
} from '../utils/projection-sphere-mask.utils';
import { basemapAuxLayersStore } from '../stores/basemap-aux-layers.store.svelte';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
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

const DEFAULT_GENERATED_OCEAN_COLOR = '#ffffff';
const DEFAULT_GENERATED_OCEAN_OPACITY = 100;
const CARTE_FACILE_LAYER_GROUP_METADATA_KEY = 'cartefacile:group';
const CARTE_FACILE_LABEL_GROUP_ID = 'labels';

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
  getProjectionForSphereMask?: () => ProjectionLike | undefined;
  getModelMatrix?: () => Matrix4 | null | undefined;
  getPageDisplayScale?: () => number;
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
  syncInterleavedLayerOrder: () => boolean;
}

function visualizationHasEnabledPrimitive(viz: VisualizationConfig): boolean {
  return (
    getSymbolPrimitive(viz)?.enabled === true ||
    getLinePrimitive(viz)?.enabled === true ||
    getTextPrimitive(viz)?.enabled === true ||
    getPolygonPrimitive(viz)?.enabled === true
  );
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
    getProjectionForSphereMask,
    getModelMatrix,
    getPageDisplayScale,
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

    let firstSymbolLayerId: string | undefined;

    for (const layer of style.layers) {
      if (layer.type !== 'symbol') {
        continue;
      }

      firstSymbolLayerId ??= layer.id;

      const metadata = layer.metadata as Record<string, unknown> | undefined;
      if (
        metadata?.[CARTE_FACILE_LAYER_GROUP_METADATA_KEY] ===
        CARTE_FACILE_LABEL_GROUP_ID
      ) {
        return layer.id;
      }
    }
    return firstSymbolLayerId;
  }

  function getLayerBeforeIdKey(layers: Layer<DeckDataRow>[]): string {
    const beforeIds = new Set<string>();
    for (const layer of layers) {
      const beforeId = (layer.props as { beforeId?: unknown }).beforeId;
      if (typeof beforeId === 'string') {
        beforeIds.add(beforeId);
      }
    }
    return [...beforeIds].join('|');
  }

  let lastAppliedMapLibreBeforeIdKey = '';

  function applyBeforeIdToLayers(
    layers: Layer<DeckDataRow>[],
    beforeId: string | undefined
  ): Layer<DeckDataRow>[] {
    return layers.map((layer) => {
      const currentBeforeId = (layer.props as { beforeId?: unknown }).beforeId;
      if (currentBeforeId === beforeId) {
        return layer;
      }

      return layer.clone({ beforeId }) as Layer<DeckDataRow>;
    });
  }

  function setLayers(layers: Layer<DeckDataRow>[]): boolean {
    const deckOverlay = getDeckOverlay();
    const deckInstance = getDeckInstance();

    try {
      if (deckOverlay) {
        const nextBeforeIdKey = getLayerBeforeIdKey(layers);
        if (nextBeforeIdKey !== lastAppliedMapLibreBeforeIdKey) {
          deckOverlay.setProps({ layers: [] });
        }
        deckOverlay.setProps({ layers });
        lastAppliedMapLibreBeforeIdKey = nextBeforeIdKey;
        return true;
      }
      if (deckInstance) {
        lastAppliedMapLibreBeforeIdKey = '';
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

  function syncInterleavedLayerOrder(): boolean {
    const deckOverlay = getDeckOverlay();
    const map = getMap();

    if (!deckOverlay || !map || lastAppliedLayers.length === 0) {
      return false;
    }

    const beforeId = findFirstSymbolLayerId(map);
    if (!beforeId) {
      return false;
    }

    const orderedLayers = applyBeforeIdToLayers(lastAppliedLayers, beforeId);
    const applied = setLayers(orderedLayers);

    if (applied) {
      lastAppliedLayers = orderedLayers;
    }

    return applied;
  }

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
  const matchedSplitFilteredTableCache = new WeakMap<
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

  function getVisibleProjectedCanvasExtent():
    [[number, number], [number, number]] | null {
    const referenceBbox = projectionStore.referenceBbox;
    if (!referenceBbox) {
      const viewportSize = getProjectionViewportSize();
      return [
        [0, 0],
        [viewportSize.width, viewportSize.height]
      ];
    }

    const viewportSize = getProjectionViewportSize();
    const scale = get_max_scale(
      viewportSize,
      referenceBbox,
      projectionStore.fitPaddingPx
    );
    if (!Number.isFinite(scale) || scale <= 0) {
      return [
        [0, 0],
        [viewportSize.width, viewportSize.height]
      ];
    }

    const [centerX, centerY] = get_bbox_center(referenceBbox);
    const halfWidth = viewportSize.width / scale / 2;
    const halfHeight = viewportSize.height / scale / 2;

    return [
      [centerX - halfWidth, centerY - halfHeight],
      [centerX + halfWidth, centerY + halfHeight]
    ];
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
      `bbox:${fitBbox?.join(',') ?? 'none'}`,
      `presets:${basemapService.projectionPresets !== null ? '1' : '0'}`
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
        logger.error(
          'Failed to build representative point table',
          LogCategory.MAP,
          error
        );
        representativePointLoadFailures.add(sourceTable);
        representativePointNotifyOnReady.delete(sourceTable);
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

  function getFilteredMatchedSplitTable(
    matchedGeometryTable: ArrowTable,
    filteredDataset: ArrowTable,
    featureIdColumn: string
  ): ArrowTable {
    let datasetCache = matchedSplitFilteredTableCache.get(matchedGeometryTable);
    if (!datasetCache) {
      datasetCache = new WeakMap();
      matchedSplitFilteredTableCache.set(matchedGeometryTable, datasetCache);
    }

    let columnCache = datasetCache.get(filteredDataset);
    if (!columnCache) {
      columnCache = new Map();
      datasetCache.set(filteredDataset, columnCache);
    }

    const cached = columnCache.get(featureIdColumn);
    if (cached) {
      return cached;
    }

    const matchingRows = getSplitMatchedGeometryRowIndices(
      matchedGeometryTable,
      filteredDataset,
      featureIdColumn
    );
    const filteredTable =
      matchingRows.length === matchedGeometryTable.numRows
        ? matchedGeometryTable
        : selectRowsByIndices(matchedGeometryTable, matchingRows);
    columnCache.set(featureIdColumn, filteredTable);
    return filteredTable;
  }

  function filterSplitGeometryTableByDatasetRows(
    geometryTable: ArrowTable,
    split: SplitRenderingTable,
    dataFilters: VisualizationConfig['dataFilters'],
    primitiveType: PrimitiveFilter | undefined,
    tableFilters: DataTableFilter[] | undefined
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

    if (tableFilteredDataset === split.dataset) {
      return matchedGeometryTable;
    }

    return getFilteredMatchedSplitTable(
      matchedGeometryTable,
      tableFilteredDataset,
      split.featureIdColumn
    );
  }

  function filterRepresentativePointTableByPrimitive(
    representativePointBaseTable: ArrowTable,
    split: SplitRenderingTable | undefined,
    dataFilters: VisualizationConfig['dataFilters'],
    primitiveType: PrimitiveFilter,
    tableFilters: DataTableFilter[] | undefined
  ): ArrowTable {
    return split
      ? filterSplitGeometryTableByDatasetRows(
          representativePointBaseTable,
          split,
          dataFilters,
          primitiveType,
          tableFilters
        )
      : filterArrowTableByTableFilters(
          filterArrowTableByDataFilters(
            representativePointBaseTable,
            dataFilters,
            primitiveType
          ),
          tableFilters
        );
  }

  function getRequestedMetadataLayerTypes(): BasemapLayerType[] {
    const requestedTypes = new Set<BasemapLayerType>();

    for (const layer of basemapLayersStore.visibleLayers) {
      switch (layer.id) {
        case 'terre':
          requestedTypes.add(BasemapLayerType.LAND);
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
        case 'meridiens':
          requestedTypes.add(BasemapLayerType.GEOGRAPHIC_LINES);
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

      const isOrthographicMode = !deckOverlay && Boolean(deckInstance);
      const matrixToApply = isOrthographicMode
        ? (getModelMatrix?.() ?? projectionStore.modelMatrix)
        : null;
      // Page zoom scales pixel-sized marks (radius, line width, label size) so
      // they track the canvas and SVG legend. Only orthographic mode applies the
      // render modelMatrix that scales geometry positions, so gate the mark scale
      // to that mode too; interleaved (MapLibre) keeps it at 1 to stay in sync.
      const pageDisplayScaleToApply = isOrthographicMode
        ? (getPageDisplayScale?.() ?? 1)
        : 1;

      const projectionSuffix = deckOverlay
        ? mapProjectionStore.projection
        : undefined;
      const projectionFitBbox = getProjectionFitBbox?.() ?? null;
      const fitPaddingPx = projectionStore.fitPaddingPx;
      const graticuleClipExtent: [[number, number], [number, number]] | null =
        isOrthographicMode ? getVisibleProjectedCanvasExtent() : null;

      const currentMetadata = basemapService.currentMetadata;
      const projectionState = getProjectionState();
      const hasManualProjectionOverride =
        projectionState.overrideActive === true &&
        projectionState.overrideSource === 'manual';
      const visualizationsToRender =
        getVisualizationRenderOrder(activeVisualizations);
      const shouldRenderDatasetFallbacks =
        getShouldRenderDatasetFallbacks?.() ?? false;
      const basemapProjection = getProjectionFromMetadata(
        currentMetadata,
        isOrthographicMode,
        projectionFitBbox,
        fitPaddingPx
      );
      const projectionOverride = getProjectionOverride(
        isOrthographicMode,
        projectionFitBbox
      );

      const activeBasemapProjection = resolveProjectionForRender(
        basemapProjection,
        projectionOverride,
        projectionState.overrideSource
      );
      // NOTE: the projection store is published exclusively by the
      // reference-fit path (resolveOrthographicReferenceState), which pairs
      // the render projection with the bbox it produced. Publishing
      // `activeBasemapProjection` from here too would race that path and could
      // store a differently-fit instance, leaving consumers that invert against
      // the reference bbox — the scale bar — mismatched. So we deliberately do
      // not publish render projections outside projectionStore.setReferenceBbox.

      const beforeId =
        map && deckOverlay ? findFirstSymbolLayerId(map) : undefined;

      const layers: Layer<DeckDataRow>[] = [];
      let hasEmptyFilteredVisualization = false;

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
      let basemapForegroundBelowThematicLayers: Layer<DeckDataRow>[] = [];
      // Deck layer id → panel row id for the basemap pool (computed by
      // `createBasemapLayers`); the thematic half is filled in the viz loop.
      let basemapRowIdByLayerId = new Map<string, string>();

      if (shouldKeepOrthographicBasemapLayers) {
        try {
          const basemapCtx = {
            modelMatrix: matrixToApply ?? undefined,
            projectionSuffix,
            projection: shouldShowBasemapLayers
              ? activeBasemapProjection
              : projectionOverride,
            bbox: shouldShowBasemapLayers
              ? (projectionFitBbox ?? currentMetadata?.bbox ?? null)
              : projectionFitBbox,
            graticuleClipExtent
          };

          const metadataLayers: MetadataLayerEntry[] = [];
          // Metadata layers (limits, lakes, graticules, etc.) follow the
          // user's explicit basemap selection signal. When `referenceBasemapId`
          // is set we keep rendering the currently cached metadata so an
          // in-flight basemap switch does not flash. When the user explicitly
          // toggles the basemap off (`referenceBasemapId` becomes null), we
          // suppress them so antimeridian wraparounds and stale catalog state
          // do not bleed through.
          const hasExplicitBasemapSelection = Boolean(
            basemapStyleStore.referenceBasemapId
          );
          if (
            shouldShowBasemapLayers &&
            currentMetadata &&
            hasExplicitBasemapSelection
          ) {
            const requestedLayerTypes = getRequestedMetadataLayerTypes();
            if (requestedLayerTypes.length > 0) {
              void basemapService
                .ensureCurrentLayersLoaded(requestedLayerTypes)
                .then((didLoad) => {
                  if (didLoad) {
                    onBasemapLayersLoaded?.();
                  }
                })
                .catch((error) => {
                  logger.error(
                    'Failed to ensure basemap auxiliary layers are loaded',
                    LogCategory.MAP,
                    error
                  );
                });
            }

            void basemapAuxLayersStore.version;
            const metadataLayerEntries = currentMetadata.layers.map(
              (layer) => ({
                layer,
                layerKey: layer.file ?? `${currentMetadata.file}:${layer.type}`
              })
            );
            const metadataLayerByKey = new Map(
              metadataLayerEntries.map((entry) => [entry.layerKey, entry])
            );
            const metadataLayerKeys = basemapAuxLayersStore
              .getOrderedLayerKeys(
                currentMetadata.file,
                metadataLayerEntries.map((entry) => entry.layerKey)
              )
              .reverse();

            for (const layerKey of metadataLayerKeys) {
              const entry = metadataLayerByKey.get(layerKey);
              if (!entry) continue;
              const { layer } = entry;
              const defaultVisible = getBasemapAuxLayerDefaultVisibility(
                layer,
                currentMetadata.layers
              );
              if (
                !basemapAuxLayersStore.isVisible(
                  currentMetadata.file,
                  layerKey,
                  defaultVisible
                )
              ) {
                continue;
              }
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
                file: layer.file ?? currentMetadata.file,
                styleOverride: basemapAuxLayersStore.getStyle(
                  currentMetadata.file,
                  layerKey
                )
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
            hasLandMetadataLayers:
              currentMetadata?.layers.some(
                (layer) => layer.type === BasemapLayerType.LAND
              ) ?? false,
            hasLimitMetadataLayers:
              currentMetadata?.layers.some(
                (layer) => layer.type === BasemapLayerType.LIMIT
              ) ?? false,
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
          const foregroundBelowSet = new Set(
            basemapGroups.foregroundBelowThematic
          );
          basemapForegroundBelowThematicLayers =
            basemapGroups.foregroundBelowThematic;
          basemapForegroundLayers = basemapGroups.foreground.filter(
            (layer) => !foregroundBelowSet.has(layer)
          );
          basemapRowIdByLayerId = basemapGroups.rowIdByLayerId;
        } catch (error) {
          logger.error(
            'Basemap layer creation failed; rendering thematic layers only',
            LogCategory.MAP,
            error
          );
        }
      }

      // Flat layer order (single source of truth, shared with the layer
      // panel): map every thematic deck layer to its panel row id so the render
      // can be ordered by the same `mergeLayerOrder` projection the panel runs,
      // and the GPU stack stays the exact reverse of the panel. In facet mode
      // the collection reads as one visualization (one row per primitive), so
      // every generated facet viz maps its layers onto the base viz's rows.
      const facetsEnabledForOrder = facetsStore.enabled;
      const facetBaseVizIdForOrder = facetsStore.baseVisualizationId;
      const facetGeneratedVizIds = new Set(
        facetsStore.generatedVisualizationIds
      );
      const resolveOrderVizId = (vizId: string): string =>
        facetsEnabledForOrder &&
        facetBaseVizIdForOrder &&
        (vizId === facetBaseVizIdForOrder || facetGeneratedVizIds.has(vizId))
          ? facetBaseVizIdForOrder
          : vizId;
      const thematicRowIdByLayerId = new Map<string, string>();
      const thematicOrderRows = new Map<string, LayerOrderRow>();
      const recordThematicRows = (vizId: string, fromIndex: number): void => {
        const rowVizId = resolveOrderVizId(vizId);
        for (let i = fromIndex; i < layers.length; i += 1) {
          const layerId = String(layers[i].id);
          const primitive = classifyThematicLayerPrimitive(layerId);
          if (!primitive) continue;
          const rowId = buildVisualizationSubLayerId(rowVizId, primitive);
          thematicRowIdByLayerId.set(layerId, rowId);
          if (!thematicOrderRows.has(rowId)) {
            thematicOrderRows.set(rowId, {
              id: rowId,
              kind: 'viz-primitive',
              primitive,
              parentId: rowVizId
            });
          }
        }
      };

      const renderedDatasetIds = new Set<string>();
      for (const viz of visualizationsToRender) {
        const vizLayerStart = layers.length;
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
            !shouldUseIdentityProjectionForDatasetCrs(datasetGeometryCrs) ||
            shouldReprojectDatasetForActiveProjection(
              datasetGeometryCrs,
              hasManualProjectionOverride
            );
          const datasetDefaultProjection = getDatasetDefaultProjection(
            datasetId,
            datasetProjectionMetadata,
            isOrthographicMode,
            projectionFitBbox,
            fitPaddingPx
          );
          ctx.modelMatrix = matrixToApply;
          ctx.pageDisplayScale = pageDisplayScaleToApply;
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
              continue;
            }
            const geoInfo = extractGeometryInfo(table);
            ctx.geometryInfo = geoInfo ?? undefined;
            const tablePrimitiveType = geoInfo?.type
              ? GEOMETRY_TO_PRIMITIVE[geoInfo.type as GeometryType]
              : undefined;
            const tableFilters = getTableFilters?.(datasetId);
            const filteredTable = split
              ? filterSplitGeometryTableByDatasetRows(
                  table,
                  split,
                  viz.dataFilters,
                  tablePrimitiveType,
                  tableFilters
                )
              : filterArrowTableByTableFilters(
                  filterArrowTableByDataFilters(
                    table,
                    viz.dataFilters,
                    tablePrimitiveType
                  ),
                  tableFilters
                );
            if (filteredTable !== table && filteredTable.numRows === 0) {
              hasEmptyFilteredVisualization = true;
            }
            // Raw point datasets have no representative-point table, so the
            // text layer renders from the main table; give it its own
            // TEXT-filtered copy so Texts filters apply and Symbols filters
            // don't leak onto the labels.
            ctx.textPointTable =
              geoInfo?.type === GeometryType.POINT
                ? split
                  ? filterSplitGeometryTableByDatasetRows(
                      table,
                      split,
                      viz.dataFilters,
                      PrimitiveFilterType.TEXT,
                      tableFilters
                    )
                  : filterArrowTableByTableFilters(
                      filterArrowTableByDataFilters(
                        table,
                        viz.dataFilters,
                        PrimitiveFilterType.TEXT
                      ),
                      tableFilters
                    )
                : undefined;
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
              const filteredRepresentativePointTable =
                filterRepresentativePointTableByPrimitive(
                  representativePointBaseTable,
                  split,
                  viz.dataFilters,
                  PrimitiveFilterType.POINT,
                  tableFilters
                );
              const filteredTextRepresentativePointTable =
                filterRepresentativePointTableByPrimitive(
                  representativePointBaseTable,
                  split,
                  viz.dataFilters,
                  PrimitiveFilterType.TEXT,
                  tableFilters
                );
              ctx.representativePointTable = filteredRepresentativePointTable;
              ctx.representativePointGeometryInfo =
                getCachedRepresentativeGeometryInfo(
                  filteredRepresentativePointTable
                ) ?? undefined;
              ctx.textRepresentativePointTable =
                filteredTextRepresentativePointTable;
              ctx.textRepresentativePointGeometryInfo =
                getCachedRepresentativeGeometryInfo(
                  filteredTextRepresentativePointTable
                ) ?? undefined;
            } else {
              ctx.representativePointTable = undefined;
              ctx.representativePointGeometryInfo = undefined;
              ctx.textRepresentativePointTable = undefined;
              ctx.textRepresentativePointGeometryInfo = undefined;
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
        recordThematicRows(viz.id, vizLayerStart);
      }

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

        const activeReferenceBasemapId = basemapStyleStore.referenceBasemapId;
        const hasReferenceBasemap = Boolean(activeReferenceBasemapId);

        for (const datasetId of fallbackDatasetIds) {
          const datasetJoinedBasemap = getDatasetJoinedBasemap(datasetId);
          const datasetEntry = datasetsStore.datasets.find(
            (d) => d.id === datasetId
          );
          const datasetHasOwnGeometry = Boolean(datasetEntry?.geometry);
          const table = tables.get(datasetId);
          const geojson = geoJSONs.get(datasetId);
          const hasLoadedRenderableGeometry = Boolean(
            geojson || table?.schema.metadata?.get('geo')
          );
          // Skip rendering when the dataset cannot produce geometry that is
          // safe to project under the active basemap:
          //   1. Joined to a basemap but user has explicitly toggled it off
          //      (e.g. a country dataset waiting for a basemap reselection).
          //   2. Joined to a basemap that does not match the active reference
          //      basemap (e.g. Monde-joined dataset rendered through the
          //      EUROPE_DOM_TOM composite leaves wedges for clipped countries).
          //   3. No active join and the dataset has no own geometry — there is
          //      nothing meaningful to draw and the stale table from a prior
          //      join would otherwise leak through.
          if (datasetJoinedBasemap && !hasReferenceBasemap) {
            continue;
          }
          if (
            datasetJoinedBasemap &&
            activeReferenceBasemapId &&
            datasetJoinedBasemap !== activeReferenceBasemapId
          ) {
            continue;
          }
          if (
            !datasetJoinedBasemap &&
            !datasetHasOwnGeometry &&
            !hasLoadedRenderableGeometry
          ) {
            continue;
          }
          const fallbackCtx = buildDatasetFallbackContext(datasetId);
          const datasetProjectionMetadata = getDatasetProjectionMetadata(
            datasetId,
            currentMetadata
          );
          const datasetGeometryCrs = getDatasetGeometryCrs(datasetId);
          const allowProjectionOverride =
            !shouldUseIdentityProjectionForDatasetCrs(datasetGeometryCrs) ||
            shouldReprojectDatasetForActiveProjection(
              datasetGeometryCrs,
              hasManualProjectionOverride
            );
          const datasetDefaultProjection = getDatasetDefaultProjection(
            datasetId,
            datasetProjectionMetadata,
            isOrthographicMode,
            projectionFitBbox,
            fitPaddingPx
          );
          fallbackCtx.modelMatrix = matrixToApply;
          fallbackCtx.pageDisplayScale = pageDisplayScaleToApply;
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
              continue;
            }
            const fallbackArrowLayers = createDeckLayers(table, fallbackCtx);
            layers.push(...fallbackArrowLayers);
          }
        }
      }

      // Basemap order-rows from the three render buckets: each row's group +
      // below-thematic flag feeds the canonical default slot (via
      // `computeDefaultLayerOrder` inside `mergeLayerOrder`) for rows the
      // persisted order has never seen, while a user drag overrides it. Mirrors
      // the panel's basemap rows so both sides project onto the same order.
      const basemapOrderRows = new Map<string, LayerOrderRow>();
      const addBasemapOrderRows = (
        bucket: readonly Layer<DeckDataRow>[],
        group: 'foreground' | 'background',
        belowThematic: boolean
      ): void => {
        for (const layer of bucket) {
          const rowId = basemapRowIdByLayerId.get(String(layer.id));
          if (!rowId || basemapOrderRows.has(rowId)) continue;
          basemapOrderRows.set(rowId, {
            id: rowId,
            kind: 'basemap-aux',
            basemapRenderGroup: group,
            basemapRenderBelowThematic: belowThematic
          });
        }
      };
      addBasemapOrderRows(
        [...basemapBackgroundLayers].reverse(),
        'background',
        false
      );
      addBasemapOrderRows(
        basemapForegroundBelowThematicLayers,
        'foreground',
        true
      );
      addBasemapOrderRows(basemapForegroundLayers, 'foreground', false);

      // The flat panel order is the single source of truth: project the live
      // rows onto the persisted drag order (manual drags win, new rows slot in
      // at their default position, stale ids drop out), then draw the reverse —
      // top of the panel = front of the map. Any row can sit above or below any
      // other; there is no bucket clamp.
      const panelLayerOrder = mergeLayerOrder(
        [...thematicOrderRows.values(), ...basemapOrderRows.values()],
        layerOrderStore.order,
        activeVisualizations.map((viz) => viz.id)
      );
      const rowIdForLayer = (layer: Layer): string | null =>
        thematicRowIdByLayerId.get(String(layer.id)) ??
        basemapRowIdByLayerId.get(String(layer.id)) ??
        null;
      const orderedLayers = applyPanelRenderOrder(
        [
          ...basemapBackgroundLayers,
          ...basemapForegroundBelowThematicLayers,
          ...basemapForegroundLayers,
          ...layers
        ],
        panelLayerOrder,
        rowIdForLayer
      );
      // The projected-sphere ocean mask should appear for any non-identity
      // projection driving the render — both manual overrides and a basemap's
      // own default projection (e.g. Equal Earth on the World map). Gating it
      // on manual override alone left the default-projected basemap without
      // its sphere until the user re-picked a projection.
      const basemapProjectionType = currentMetadata?.proj_to?.type;
      const isCompositeBasemapProjection =
        basemapProjectionType === 'composite';
      const hasDefaultBasemapProjection =
        basemapProjectionType === 'simple' || isCompositeBasemapProjection;
      const sphereProjectionInput =
        isOrthographicMode &&
        (hasManualProjectionOverride || hasDefaultBasemapProjection)
          ? (activeBasemapProjection ??
            getProjectionForSphereMask?.() ??
            projectionOverride)
          : undefined;
      const mersConfig = basemapLayersStore.layers.find((l) => l.id === 'mers');
      const mersAuxVisible =
        currentMetadata && mersConfig
          ? basemapAuxLayersStore.isVisible(
              currentMetadata.file,
              SYNTHETIC_AUX_LAYER_KEY.MERS,
              true
            )
          : true;
      const mersEffectiveVisible =
        (mersConfig?.visible ?? false) && mersAuxVisible;
      const mersFillColor: [number, number, number, number] | undefined =
        mersConfig && mersEffectiveVisible
          ? (() => {
              const [r, g, b] = hexToRgb(mersConfig.color);
              const alpha = Math.round(
                ((mersConfig.opacity ?? 100) / 100) * 255
              );
              return [r, g, b, alpha];
            })()
          : undefined;
      const projectionSphereMaskLayer =
        sphereProjectionInput && mersFillColor
          ? createProjectionSphereMaskLayer({
              projection: sphereProjectionInput,
              modelMatrix: matrixToApply,
              fillColor: mersFillColor
            })
          : null;
      const sphereConfig = basemapLayersStore.layers.find(
        (l) => l.id === 'sphere'
      );
      const sphereAuxVisible =
        currentMetadata && sphereConfig
          ? basemapAuxLayersStore.isVisible(
              currentMetadata.file,
              SYNTHETIC_AUX_LAYER_KEY.SPHERE,
              true
            )
          : true;
      const sphereVisible = (sphereConfig?.visible ?? true) && sphereAuxVisible;
      const sphereOutlineOptions = sphereConfig
        ? (() => {
            const [r, g, b] = hexToRgb(sphereConfig.color);
            const alpha = Math.round(
              ((sphereConfig.opacity ?? 100) / 100) * 255
            );
            return {
              color: [r, g, b, alpha] as [number, number, number, number],
              width: sphereConfig.thickness
            };
          })()
        : undefined;
      // A default simple projection stays unframed. A composite projection is
      // different: its sphere represents the boundary of every sub-projection
      // frame, so it must remain visible without a manual override (#195).
      const projectionSphereOutlineLayer =
        sphereProjectionInput &&
        sphereVisible &&
        (hasManualProjectionOverride || isCompositeBasemapProjection)
          ? createProjectionSphereOutlineLayer({
              projection: sphereProjectionInput,
              modelMatrix: matrixToApply,
              ...(sphereOutlineOptions ?? {})
            })
          : null;
      const maskedOrderedLayers = applyProjectionSphereMask(
        orderedLayers,
        projectionSphereMaskLayer,
        projectionSphereOutlineLayer
      );
      layers.length = 0;
      layers.push(...maskedOrderedLayers);

      const hasExpectedActiveViz = activeVisualizations.some(
        visualizationHasEnabledPrimitive
      );
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
        !hasEmptyFilteredVisualization &&
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
    updateLayers,
    syncInterleavedLayerOrder
  };
}
