import type { Deck, Layer } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
import { projectionStore } from '../stores/projection.store.svelte';
import {
  createDeckLayers,
  createGeoJsonLayers,
  createWorldBaseLayer
} from '../layers';
import type { DeckDataRow, LayerContext } from '../types';

export interface UseMapLayersProps {
  getDeckOverlay: () => MapboxOverlay | null;
  getDeckInstance: () => Deck | null;
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
    getIsMapLoaded,
    getWorldBaseTable,
    getActiveVisualizations,
    buildLayerContextForViz
  } = props;

  function setLayers(layers: Layer<DeckDataRow>[]): void {
    const deckOverlay = getDeckOverlay();
    const deckInstance = getDeckInstance();

    if (deckOverlay) {
      deckOverlay.setProps({ layers });
    } else if (deckInstance) {
      deckInstance.setProps({ layers });
    }
  }

  function updateLayers(
    tables: Map<string, ArrowTable>,
    geoJSONs: Map<string, FeatureCollection>
  ): void {
    const deckOverlay = getDeckOverlay();
    const deckInstance = getDeckInstance();

    if ((!deckOverlay && !deckInstance) || !getIsMapLoaded()) {
      return;
    }

    const isOSMActive = Boolean(osmBasemapStore.activeOSMBasemap);
    const worldBaseTable = getWorldBaseTable();
    const activeVisualizations = getActiveVisualizations();

    logger.debug(
      'Updating Deck.gl layers for multi-dataset view',
      LogCategory.MAP,
      {
        tablesCount: tables.size,
        geoJSONsCount: geoJSONs.size,
        activeVisualizationsCount: activeVisualizations.length,
        hasWorldBase: Boolean(worldBaseTable),
        isOSMActive
      }
    );

    const layers: Layer<DeckDataRow>[] = [];

    if (worldBaseTable && !isOSMActive) {
      const defaultCtx: LayerContext = {
        viz: null,
        datasetId: undefined,
        fillColor: [180, 180, 180],
        strokeColor: [255, 255, 255],
        fillOpacity: 0.3,
        strokeWidth: 1,
        strokeOpacity: 1,
        statistics: { min: 0, max: 100 },
        categoryColorMap: null,
        modelMatrix: projectionStore.modelMatrix
      };
      const baseLayer = createWorldBaseLayer(worldBaseTable, defaultCtx);
      if (baseLayer) layers.push(baseLayer);
    }

    for (const viz of activeVisualizations) {
      const datasetId = viz.datasetId;
      const table = tables.get(datasetId);
      const geojson = geoJSONs.get(datasetId);

      const ctx = buildLayerContextForViz(viz);
      ctx.modelMatrix = projectionStore.modelMatrix;

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
    logger.success('Deck.gl layers applied', LogCategory.MAP, {
      layerCount: layers.length,
      isOSMActive
    });
  }

  return {
    updateLayers
  };
}
