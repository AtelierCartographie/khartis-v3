import type { Deck, Layer } from '@deck.gl/core';
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
import {
  createBasemapLayers,
  createDeckLayers,
  createGeoJsonLayers
} from '../layers';
import type { DeckDataRow, LayerContext } from '../types';

export interface UseMapLayersProps {
  getDeckOverlay: () => MapboxOverlay | null;
  getDeckInstance: () => Deck | null;
  getMap: () => MapLibreMap | null;
  getIsMapLoaded: () => boolean;
  getWorldBaseTable: () => ArrowTable | null;
  getActiveVisualizations: () => VisualizationConfig[];
  buildLayerContextForViz: (viz: VisualizationConfig) => LayerContext;
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
    buildLayerContextForViz
  } = props;

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

  function setLayers(layers: Layer<DeckDataRow>[]): void {
    const deckOverlay = getDeckOverlay();
    const deckInstance = getDeckInstance();

    if (deckOverlay) {
      deckOverlay.setProps({ layers });
    } else if (deckInstance) {
      deckInstance.setProps({ layers });
    }
  }

  let updateCount = 0;

  function updateLayers(
    tables: Map<string, ArrowTable>,
    geoJSONs: Map<string, FeatureCollection>
  ): void {
    updateCount++;
    const startTime = performance.now();
    console.log(`[LAYERS] updateLayers called #${updateCount}`, {
      tablesSize: tables.size,
      geoJSONsSize: geoJSONs.size
    });

    const deckOverlay = getDeckOverlay();
    const deckInstance = getDeckInstance();
    const map = getMap();

    if ((!deckOverlay && !deckInstance) || !getIsMapLoaded()) {
      console.log('[LAYERS] Early return - no deck context or map not loaded');
      return;
    }

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
    }

    for (const viz of activeVisualizations) {
      const datasetId = viz.datasetId;
      const table = tables.get(datasetId);
      const geojson = geoJSONs.get(datasetId);

      const ctx = buildLayerContextForViz(viz);
      ctx.modelMatrix = matrixToApply;
      ctx.projectionSuffix = projectionSuffix;
      ctx.beforeId = beforeId;

      if (geojson) {
        layers.push(...createGeoJsonLayers(geojson, ctx));
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
        layers.push(...createDeckLayers(table, ctx));
      }
    }

    setLayers(layers);
    const elapsed = performance.now() - startTime;
    console.log(`[LAYERS] updateLayers completed #${updateCount} in ${elapsed.toFixed(1)}ms`, {
      layerCount: layers.length,
      isOSMActive
    });
    logger.success('Deck.gl layers applied', LogCategory.MAP, {
      layerCount: layers.length,
      isOSMActive
    });
  }

  return {
    updateLayers
  };
}
