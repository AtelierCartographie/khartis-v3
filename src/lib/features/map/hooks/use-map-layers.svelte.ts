import type { Layer } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck } from '$lib/features/duckdb';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { mapProjectionStore } from '../stores/map-projection.store.svelte';
import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
import { projectionStore } from '../stores/projection.store.svelte';
import { basemapService } from '../services/basemap.service.svelte';
import { basemapLayersStore } from '../stores/basemap-layers.store.svelte';
import {
  createBasemapLayers,
  createDeckLayers,
  createGeoJsonLayers,
  type MetadataLayerEntry
} from '../layers';
import { extractGeometryInfo } from '../io';
import { buildProjectionForBasemap } from '../utils/geoarrow-stream-bridge';
import { GeometryType } from '../constants';
import { PrimitiveFilterType } from '$lib/features/commons/store/visualization.store.svelte';
import type { PrimitiveFilter } from '$lib/features/commons/store/visualization.store.svelte';
import type { BBox, DeckDataRow, LayerContext } from '../types';
import type { DeckInstance } from './use-map-init.svelte';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import {
  filterArrowTableByYear,
  filterArrowTableByDataFilters,
  filterArrowTableByTableFilters
} from '../utils/arrow-filter.utils';
import {
  getMapLayerRenderOrder,
  getVisualizationRenderOrder
} from '../utils/layer-order.utils';
import type { DataTableFilter } from '$lib/features/duckdb/types';
import { getProjectionState } from '$lib/features/step-toolbar/tools/projections/projection.store.svelte';
import { proj4d3 } from '../utils/proj4d3';
import type { ProjectionLike } from 'geoarrow-deck-stream';
import {
  fitProjectionToBbox,
  getProjectionById
} from '$lib/features/commons/utils/projection.utils';
import type { BasemapMetadata } from '../types/basemap.types';
import { shouldUseIdentityProjectionForDatasetCrs } from '../utils/dataset-crs';
import { resolveProjectionForRender } from '../utils/projection-priority';
import { getRepresentativePointArrowTable } from '$lib/features/duckdb/orchestrator/arrow-ops';

const GEOMETRY_TO_PRIMITIVE: Partial<Record<GeometryType, PrimitiveFilter>> = {
  [GeometryType.POINT]: PrimitiveFilterType.POINT,
  [GeometryType.MULTIPOINT]: PrimitiveFilterType.POINT,
  [GeometryType.LINESTRING]: PrimitiveFilterType.LINE,
  [GeometryType.MULTILINESTRING]: PrimitiveFilterType.LINE,
  [GeometryType.POLYGON]: PrimitiveFilterType.POLYGON,
  [GeometryType.MULTIPOLYGON]: PrimitiveFilterType.POLYGON
};

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
  getShouldRenderDatasetFallbacks?: () => boolean;
  getTableFilters?: (datasetId: string) => DataTableFilter[] | undefined;
  onBasemapLayersLoaded?: () => void;
  onRepresentativePointTablesLoaded?: () => void;
}

export interface UseMapLayersReturn {
  updateLayers: (
    tables: Map<string, ArrowTable>,
    geoJSONs: Map<string, FeatureCollection>
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
      strokeColor: DATA_PREVIEW_STROKE_COLOR,
      fillOpacity: DATA_PREVIEW_FILL_OPACITY,
      strokeWidth: DATA_PREVIEW_STROKE_WIDTH,
      strokeOpacity: DATA_PREVIEW_STROKE_OPACITY,
      statistics: { min: 0, max: 100 },
      categoryColorMap: null
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

  const basemapProjectionCache = new WeakMap<
    NonNullable<BasemapMetadata>,
    ProjectionLike
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
  let cachedProjectionOverrideKey: string | null = null;
  let cachedProjectionOverrideRef: ProjectionLike | undefined;

  function getProjectionFromMetadata(
    metadata: BasemapMetadata | null | undefined,
    isOrthographicMode: boolean
  ): ProjectionLike | undefined {
    if (!isOrthographicMode || !metadata || metadata.isCustom) {
      return undefined;
    }

    const cached = basemapProjectionCache.get(metadata);
    if (cached) {
      return cached;
    }

    const projection = buildProjectionForBasemap(
      metadata,
      960,
      600,
      basemapService.projectionPresets
    );
    basemapProjectionCache.set(metadata, projection);
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
    if (!projState.overrideActive) {
      return undefined;
    }

    if (!fitBbox) {
      return undefined;
    }

    const overrideKey = [
      projState.customCode
        ? `custom:${projState.customCode}`
        : `preset:${projState.selected}`,
      `bbox:${fitBbox.join(',')}`,
      `center:${(projState.center ?? [projState.longitude, projState.latitude]).join(',')}`,
      `rotation:${projState.rotation}`
    ].join('|');

    if (overrideKey === cachedProjectionOverrideKey) {
      return cachedProjectionOverrideRef;
    }

    let projectionOverride: ProjectionLike | undefined;

    if (projState.customCode) {
      try {
        projectionOverride = proj4d3(projState.customCode);
      } catch (error) {
        logger.error(
          'Custom CRS code failed for thematic layers, using default basemap projection',
          LogCategory.MAP,
          { customCode: projState.customCode, error }
        );
      }
    } else {
      const projectionInfo = getProjectionById(projState.selected);
      projectionOverride = projectionInfo?.projection();
    }

    if (projectionOverride) {
      const center = projState.center ?? [
        projState.longitude,
        projState.latitude
      ];

      if ('center' in projectionOverride) {
        projectionOverride.center(center);
      }
      if ('rotate' in projectionOverride) {
        projectionOverride.rotate([projState.rotation, 0, 0]);
      }

      fitProjectionToBbox(projectionOverride, fitBbox, 960, 600);
    }

    // Downstream GeoArrow/projection caches key by ProjectionLike reference.
    // Recreating the same override projection on every layer refresh defeats
    // those caches and forces needless reprojection work.
    cachedProjectionOverrideKey = overrideKey;
    cachedProjectionOverrideRef = projectionOverride;

    return projectionOverride;
  }

  function getDatasetGeometryCrs(datasetId: string): string | null | undefined {
    return datasetsStore.datasets.find((dataset) => dataset.id === datasetId)
      ?.geometry?.crs;
  }

  function getDatasetTableName(datasetId: string): string | null {
    return (
      datasetsStore.datasets.find((dataset) => dataset.id === datasetId)
        ?.tableName ?? null
    );
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

  function getRepresentativePointTable(
    datasetId: string,
    sourceTable: ArrowTable,
    geometryInfo: NonNullable<LayerContext['geometryInfo']>
  ): ArrowTable | null {
    if (!supportsRepresentativePointTable(geometryInfo.type)) {
      return null;
    }

    const cachedTable = representativePointTableCache.get(sourceTable);
    if (cachedTable) {
      return cachedTable;
    }

    if (
      representativePointLoadPromises.has(sourceTable) ||
      representativePointLoadFailures.has(sourceTable)
    ) {
      return null;
    }

    const tableName = getDatasetTableName(datasetId);
    if (!tableName) {
      return null;
    }

    const loadPromise = getRepresentativePointArrowTable(
      tableName,
      geometryInfo.type,
      Duck
    )
      .then((representativePointTable) => {
        representativePointTableCache.set(
          sourceTable,
          representativePointTable
        );
        getCachedRepresentativeGeometryInfo(representativePointTable);
        onRepresentativePointTablesLoaded?.();
      })
      .catch((error) => {
        representativePointLoadFailures.add(sourceTable);
        logger.warn(
          'Deferred representative point table loading failed',
          LogCategory.MAP,
          { datasetId, tableName, geometryType: geometryInfo.type, error }
        );
      })
      .finally(() => {
        representativePointLoadPromises.delete(sourceTable);
      });

    representativePointLoadPromises.set(sourceTable, loadPromise);
    return null;
  }

  function getDatasetDefaultProjection(
    datasetId: string,
    metadata: BasemapMetadata | null | undefined,
    isOrthographicMode: boolean
  ): ProjectionLike | undefined {
    const datasetGeometryCrs = getDatasetGeometryCrs(datasetId);

    if (shouldUseIdentityProjectionForDatasetCrs(datasetGeometryCrs)) {
      return undefined;
    }

    return getProjectionFromMetadata(metadata, isOrthographicMode);
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
        case 'meridiens':
          requestedTypes.add(BasemapLayerType.GRATICULE);
          break;
        case 'equateur':
          requestedTypes.add(BasemapLayerType.GEOGRAPHIC_LINES);
          break;
      }
    }

    return [...requestedTypes];
  }

  function updateLayers(
    tables: Map<string, ArrowTable>,
    geoJSONs: Map<string, FeatureCollection>
  ): void {
    const deckOverlay = getDeckOverlay();
    const deckInstance = getDeckInstance();
    const map = getMap();

    if ((!deckOverlay && !deckInstance) || !getIsMapLoaded()) {
      return;
    }

    // In MapLibre mode, avoid pushing layers while style is being swapped/reloaded.
    if (deckOverlay && map && !map.isStyleLoaded()) {
      return;
    }

    try {
      const isOSMActive = Boolean(osmBasemapStore.activeOSMBasemap);
      const worldBaseTable = getWorldBaseTable();
      const activeVisualizations = getActiveVisualizations();
      const visualizationsToRender =
        getVisualizationRenderOrder(activeVisualizations);

      // Only apply modelMatrix in orthographic mode (Deck.gl standalone)
      // In MapLibre mode (deckOverlay), the map handles projection including globe
      const isOrthographicMode = !deckOverlay && Boolean(deckInstance);
      const matrixToApply = isOrthographicMode
        ? projectionStore.modelMatrix
        : null;

      // In MapLibre mode, use projection suffix to force layer re-creation when projection changes
      // This is a workaround for deck.gl issue #9466 where layers don't sync with globe projection
      const projectionSuffix = deckOverlay
        ? mapProjectionStore.projection
        : undefined;

      // Build basemap projection from metadata (composite/simple/identity).
      // Only applies in orthographic mode — in MapLibre mode, the map handles
      // projection natively (WebMercator/globe) and thematic data must stay in
      // WGS84 lat/lng. Applying a d3-geo projection here would convert coordinates
      // to metres, causing deck.gl "invalid latitude" errors.
      //
      // Memoized: buildProjectionForBasemap() creates a new object each call,
      // defeating downstream WeakMap caches. We keep the same reference until
      // the basemap metadata actually changes.
      const currentMetadata = basemapService.currentMetadata;
      const basemapProjection = getProjectionFromMetadata(
        currentMetadata,
        isOrthographicMode
      );
      const projectionState = getProjectionState();
      const projectionFitBbox = getProjectionFitBbox?.() ?? null;
      const projectionOverride = getProjectionOverride(
        isOrthographicMode,
        projectionFitBbox
      );
      // Catalog basemap metadata remains the default. An explicit user choice
      // in the Projection tool must still override it immediately.
      const activeBasemapProjection = resolveProjectionForRender(
        basemapProjection,
        projectionOverride,
        projectionState.overrideSource
      );

      // In MapLibre interleaved mode, find the first symbol layer to render data layers below text
      const beforeId =
        map && deckOverlay ? findFirstSymbolLayerId(map) : undefined;

      const layers: Layer<DeckDataRow>[] = [];

      // Only show basemap layers in orthographic mode (Deck.gl standalone)
      // In MapLibre mode, the tiled basemap provides the background (OSM, Carte Facile, etc.)
      const shouldShowBasemapLayers = !isOSMActive && isOrthographicMode;

      // Basemap layers are split into background (terre, mers, lacs, relief)
      // and foreground (frontières, rivières, graticules, villes).
      // Foreground layers render ABOVE data so basemap borders remain visible
      // even when polygon data covers the basemap fill.
      let basemapBackgroundLayers: Layer<DeckDataRow>[] = [];
      let basemapForegroundLayers: Layer<DeckDataRow>[] = [];

      if (shouldShowBasemapLayers) {
        try {
          const basemapCtx = {
            modelMatrix: matrixToApply ?? undefined,
            projectionSuffix,
            projection: activeBasemapProjection
          };

          const metadataLayers: MetadataLayerEntry[] = [];
          if (currentMetadata && !currentMetadata.isCustom) {
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
              if (!layer.file) continue;
              const table = basemapService.currentLayers.get(layer.file);
              if (!table) continue;
              metadataLayers.push({
                table,
                style: layer.style ?? null,
                type: layer.type,
                file: layer.file
              });
            }
          }

          const additionalData = {
            frontieresTable:
              basemapService.getLayerTableByType(BasemapLayerType.LIMIT) ??
              undefined,
            availableMetadataLayerTypes: currentMetadata?.layers.map(
              (layer) => layer.type
            ),
            metadataLayers,
            stylePresets: basemapService.stylePresets
          };
          const basemapGroups = createBasemapLayers(
            worldBaseTable,
            basemapCtx,
            additionalData
          );
          basemapBackgroundLayers = basemapGroups.background;
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
          const table = tables.get(datasetId);
          const geojson = geoJSONs.get(datasetId);

          const ctx = buildLayerContextForViz(viz);
          const datasetProjectionMetadata =
            getProjectionMetadataForDataset?.(datasetId) ?? currentMetadata;
          const datasetGeometryCrs = getDatasetGeometryCrs(datasetId);
          const allowProjectionOverride =
            !shouldUseIdentityProjectionForDatasetCrs(datasetGeometryCrs);
          const datasetDefaultProjection = getDatasetDefaultProjection(
            datasetId,
            datasetProjectionMetadata,
            isOrthographicMode
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
            const representativePointBaseTable = geoInfo
              ? getRepresentativePointTable(datasetId, table, geoInfo)
              : null;

            if (representativePointBaseTable) {
              const representativeVizFiltered = filterArrowTableByDataFilters(
                representativePointBaseTable,
                viz.dataFilters,
                tablePrimitiveType
              );
              const representativeTableFiltered =
                filterArrowTableByTableFilters(
                  representativeVizFiltered,
                  tableFilters
                );
              const filteredRepresentativePointTable = viz.yearFilter
                ? filterArrowTableByYear(
                    representativeTableFiltered,
                    viz.yearFilter
                  )
                : representativeTableFiltered;
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
          const datasetProjectionMetadata =
            getProjectionMetadataForDataset?.(datasetId) ?? currentMetadata;
          const datasetGeometryCrs = getDatasetGeometryCrs(datasetId);
          const allowProjectionOverride =
            !shouldUseIdentityProjectionForDatasetCrs(datasetGeometryCrs);
          const datasetDefaultProjection = getDatasetDefaultProjection(
            datasetId,
            datasetProjectionMetadata,
            isOrthographicMode
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
        shouldShowBasemapLayers && basemapLayersStore.visibleLayers.length > 0;
      const hasExpectedVisibleLayers =
        hasExpectedActiveViz ||
        hasExpectedDatasetFallbacks ||
        hasVisibleBasemapConfig;
      const shouldPreservePreviousLayers =
        layers.length === 0 &&
        lastAppliedLayers.length > 0 &&
        hasExpectedVisibleLayers;

      if (shouldPreservePreviousLayers) {
        const applied = setLayers(lastAppliedLayers);
        if (!applied) {
          return;
        }
      } else {
        const applied = setLayers(layers);
        if (!applied) {
          return;
        }
        if (layers.length > 0) {
          lastAppliedLayers = layers;
        } else if (!hasExpectedVisibleLayers) {
          // When emptiness is expected, drop fallback layers to avoid stale restores.
          lastAppliedLayers = [];
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
