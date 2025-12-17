import type { Layer } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { osmBasemapStore } from '../stores/osm-basemap.store.svelte';
import {
  createDeckLayers,
  createGeoJsonLayers,
  createWorldBaseLayer
} from '../layers';
import type { DeckDataRow, LayerContext } from '../types';

export interface UseMapLayersProps {
  getDeckOverlay: () => MapboxOverlay | null;
  getIsMapLoaded: () => boolean;
  getWorldBaseTable: () => ArrowTable | null;
  getDatasetId: () => string | undefined;
  buildLayerContext: () => LayerContext;
}

export interface UseMapLayersReturn {
  updateLayers: (
    jsTable: ArrowTable | null,
    geojson: FeatureCollection | null
  ) => void;
  readonly lastPendingGeoTable: string | null;
}

export function useMapLayers(props: UseMapLayersProps): UseMapLayersReturn {
  const {
    getDeckOverlay,
    getIsMapLoaded,
    getWorldBaseTable,
    getDatasetId,
    buildLayerContext
  } = props;

  let lastPendingGeoTable = $state<string | null>(null);

  function updateLayers(
    jsTable: ArrowTable | null,
    geojson: FeatureCollection | null
  ): void {
    const deckOverlay = getDeckOverlay();
    if (!deckOverlay || !getIsMapLoaded()) return;

    const isOSMActive = Boolean(osmBasemapStore.activeOSMBasemap);
    const ctx = buildLayerContext();
    const worldBaseTable = getWorldBaseTable();
    const datasetId = getDatasetId();

    logger.debug('Updating Deck.gl layers', LogCategory.MAP, {
      hasArrowTable: Boolean(jsTable),
      hasGeoJSON: Boolean(geojson),
      hasWorldBase: Boolean(worldBaseTable),
      isOSMActive
    });

    const layers: Layer<DeckDataRow>[] = [];

    if (worldBaseTable && !isOSMActive) {
      const baseLayer = createWorldBaseLayer(worldBaseTable);
      if (baseLayer) layers.push(baseLayer);
    }

    if (geojson) {
      layers.push(...createGeoJsonLayers(geojson, ctx));
    } else if (jsTable) {
      const hasGeoMetadata = !!jsTable.schema.metadata?.get('geo');
      if (!hasGeoMetadata) {
        if (lastPendingGeoTable !== datasetId) {
          lastPendingGeoTable = datasetId ?? null;
          logger.warn(
            'Arrow table missing GeoArrow metadata',
            LogCategory.MAP,
            {
              datasetId,
              note: 'Waiting for metadata-prefetch'
            }
          );
        }
        deckOverlay.setProps({ layers });
        return;
      }
      lastPendingGeoTable = null;
      layers.push(...createDeckLayers(jsTable, ctx));
    }

    deckOverlay.setProps({ layers });
    logger.success('Deck.gl layers applied', LogCategory.MAP, {
      layerCount: layers.length,
      isOSMActive
    });
  }

  return {
    updateLayers,
    get lastPendingGeoTable() {
      return lastPendingGeoTable;
    }
  };
}
