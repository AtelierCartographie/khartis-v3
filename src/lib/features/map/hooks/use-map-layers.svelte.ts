import type { Layer } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
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
import type { DeckDataRow, LayerContext } from '../types';
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
  getShouldRenderDatasetFallbacks?: () => boolean;
  getTableFilters?: (datasetId: string) => DataTableFilter[] | undefined;
  onBasemapLayersLoaded?: () => void;
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
    getShouldRenderDatasetFallbacks,
    getTableFilters,
    onBasemapLayersLoaded
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

  // Memoize basemap projection — buildProjectionForBasemap() is expensive and
  // creates a new object reference each call, defeating downstream WeakMap caches.
  // The projection only changes when the basemap metadata changes (user switches basemap).
  let lastBasemapMetadataRef: unknown = undefined;
  let lastBasemapProjectionRef: ProjectionLike | undefined = undefined;

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
      const isOrthographicMode = !deckOverlay && deckInstance;
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
      let basemapProjection: ProjectionLike | undefined;
      if (isOrthographicMode && currentMetadata && !currentMetadata.isCustom) {
        if (currentMetadata !== lastBasemapMetadataRef) {
          lastBasemapProjectionRef = buildProjectionForBasemap(
            currentMetadata,
            960,
            600,
            basemapService.projectionPresets
          );
          lastBasemapMetadataRef = currentMetadata;
        }
        basemapProjection = lastBasemapProjectionRef;
      } else {
        basemapProjection = undefined;
        lastBasemapMetadataRef = null;
      }

      // Basemap projection takes priority to keep data and basemap aligned.
      // Custom CRS from projection tool (proj4d3, in metres) only applies
      // when no basemap projection exists (identity basemaps, custom imports).
      let customProjection: ProjectionLike | undefined = basemapProjection;
      if (!customProjection && isOrthographicMode) {
        const projState = getProjectionState();
        if (projState.customCode) {
          try {
            customProjection = proj4d3(projState.customCode);
          } catch (error) {
            logger.error(
              'Custom CRS code failed for thematic layers, using identity',
              LogCategory.MAP,
              { customCode: projState.customCode, error }
            );
          }
        }
      }

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
            projection: basemapProjection
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
          ctx.modelMatrix = matrixToApply;
          ctx.projectionSuffix = projectionSuffix;
          ctx.beforeId = beforeId;
          ctx.customProjection = customProjection;

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
          fallbackCtx.modelMatrix = matrixToApply;
          fallbackCtx.projectionSuffix = projectionSuffix;
          fallbackCtx.beforeId = beforeId;
          fallbackCtx.customProjection = customProjection;

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
        logger.warn(
          'Computed empty layer stack unexpectedly; preserving last valid layers',
          LogCategory.MAP,
          {
            activeVisualizationsCount: activeVisualizations.length,
            tablesCount: tables.size,
            geoJSONsCount: geoJSONs.size,
            hasVisibleBasemapConfig
          }
        );
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
