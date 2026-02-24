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
  createGeoJsonLayers
} from '../layers';
import type { DeckDataRow, LayerContext } from '../types';
import type { DeckInstance } from './use-map-init.svelte';
import {
  filterArrowTableByYear,
  filterArrowTableByDataFilters
} from '../utils/arrow-filter.utils';

export interface UseMapLayersProps {
  getDeckOverlay: () => MapboxOverlay | null;
  getDeckInstance: () => DeckInstance | null;
  getMap: () => MapLibreMap | null;
  getIsMapLoaded: () => boolean;
  getWorldBaseTable: () => ArrowTable | null;
  getActiveVisualizations: () => VisualizationConfig[];
  buildLayerContextForViz: (viz: VisualizationConfig) => LayerContext;
  getShouldRenderDatasetFallbacks?: () => boolean;
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
    getShouldRenderDatasetFallbacks
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

  let updateCount = 0;
  let lastAppliedLayers: Layer<DeckDataRow>[] = [];

  function updateLayers(
    tables: Map<string, ArrowTable>,
    geoJSONs: Map<string, FeatureCollection>
  ): void {
    updateCount++;
    const totalStart = performance.now();
    logger.debug(`updateLayers #${updateCount} started`, LogCategory.MAP, {
      tablesSize: tables.size,
      geoJSONsSize: geoJSONs.size
    });

    const deckOverlay = getDeckOverlay();
    const deckInstance = getDeckInstance();
    const map = getMap();

    if ((!deckOverlay && !deckInstance) || !getIsMapLoaded()) {
      logger.debug('Early return - no deck context', LogCategory.MAP);
      return;
    }

    // In MapLibre mode, avoid pushing layers while style is being swapped/reloaded.
    if (deckOverlay && map && !map.isStyleLoaded()) {
      logger.debug(
        'Skipping layer update while MapLibre style is loading',
        LogCategory.MAP
      );
      return;
    }

    try {
      const isOSMActive = Boolean(osmBasemapStore.activeOSMBasemap);
      const worldBaseTable = getWorldBaseTable();
      const activeVisualizations = getActiveVisualizations();

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

      // In MapLibre interleaved mode, find the first symbol layer to render data layers below text
      const beforeId =
        map && deckOverlay ? findFirstSymbolLayerId(map) : undefined;

      logger.debug(
        'Updating Deck.gl layers for multi-dataset view',
        LogCategory.MAP,
        {
          tablesCount: tables.size,
          geoJSONsCount: geoJSONs.size,
          activeVisualizationsCount: activeVisualizations.length,
          hasWorldBase: Boolean(worldBaseTable),
          isOSMActive,
          isOrthographicMode,
          beforeId
        }
      );

      const layers: Layer<DeckDataRow>[] = [];

      // Only show basemap layers in orthographic mode (Deck.gl standalone)
      // In MapLibre mode, the tiled basemap provides the background (OSM, Carte Facile, etc.)
      const shouldShowBasemapLayers = !isOSMActive && isOrthographicMode;

      if (shouldShowBasemapLayers) {
        try {
          const basemapStart = performance.now();
          const basemapCtx = {
            modelMatrix: matrixToApply ?? undefined,
            projectionSuffix
          };
          const additionalData = {
            lakesData: basemapService.lakesData ?? undefined,
            riversData: basemapService.riversData ?? undefined,
            citiesData: basemapService.citiesData ?? undefined
          };
          const basemapLayers = createBasemapLayers(
            worldBaseTable,
            basemapCtx,
            additionalData
          );
          layers.push(...basemapLayers);
          logger.debug(
            `Basemap layers created in ${(performance.now() - basemapStart).toFixed(1)}ms (${basemapLayers.length} layers)`,
            LogCategory.MAP
          );
        } catch (error) {
          logger.error(
            'Basemap layer creation failed; rendering thematic layers only',
            LogCategory.MAP,
            error
          );
        }
      }

      logger.debug(
        `Processing ${activeVisualizations.length} visualizations`,
        LogCategory.MAP
      );

      // Pre-filter Arrow tables by (datasetId, yearFilter) to avoid
      // redundant filtering when multiple visualizations share the same table + filter.
      const yearFilteredTableCache = new Map<string, ArrowTable>();

      function getFilteredTable(
        table: ArrowTable,
        datasetId: string,
        yearFilter: (typeof activeVisualizations)[0]['yearFilter']
      ): ArrowTable {
        const cacheKey = yearFilter
          ? `${datasetId}:${yearFilter.column}:${yearFilter.value}`
          : datasetId;
        const cached = yearFilteredTableCache.get(cacheKey);
        if (cached) return cached;
        const result = filterArrowTableByYear(table, yearFilter);
        yearFilteredTableCache.set(cacheKey, result);
        return result;
      }

      const renderedDatasetIds = new Set<string>();
      for (const viz of activeVisualizations) {
        const vizStart = performance.now();
        try {
          const datasetId = viz.datasetId;
          const table = tables.get(datasetId);
          const geojson = geoJSONs.get(datasetId);

          const ctx = buildLayerContextForViz(viz);
          ctx.modelMatrix = matrixToApply;
          ctx.projectionSuffix = projectionSuffix;
          ctx.beforeId = beforeId;

          if (geojson) {
            const geojsonStart = performance.now();
            const geojsonLayers = createGeoJsonLayers(geojson, ctx);
            layers.push(...geojsonLayers);
            if (geojsonLayers.length > 0) {
              renderedDatasetIds.add(datasetId);
            }
            logger.debug(
              `GeoJSON layers for ${datasetId} created in ${(performance.now() - geojsonStart).toFixed(1)}ms (${geojsonLayers.length} layers, ${geojson.features?.length || 0} features)`,
              LogCategory.MAP
            );
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
            const arrowStart = performance.now();
            const yearFiltered = getFilteredTable(
              table,
              datasetId,
              viz.yearFilter
            );
            const filteredTable = filterArrowTableByDataFilters(
              yearFiltered,
              viz.dataFilters
            );
            const arrowLayers = createDeckLayers(filteredTable, ctx);
            layers.push(...arrowLayers);
            if (arrowLayers.length > 0) {
              renderedDatasetIds.add(datasetId);
            }
            logger.debug(
              `Arrow layers for ${datasetId} created in ${(performance.now() - arrowStart).toFixed(1)}ms (${arrowLayers.length} layers, ${table.numRows} rows)`,
              LogCategory.MAP
            );
          }
          logger.debug(
            `Viz ${viz.id} processed in ${(performance.now() - vizStart).toFixed(1)}ms`,
            LogCategory.MAP
          );
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

      const setStart = performance.now();
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
      logger.debug(
        `setLayers took ${(performance.now() - setStart).toFixed(1)}ms`,
        LogCategory.MAP
      );
      logger.debug(
        `updateLayers #${updateCount} TOTAL: ${(performance.now() - totalStart).toFixed(1)}ms (${layers.length} layers)`,
        LogCategory.MAP
      );

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
