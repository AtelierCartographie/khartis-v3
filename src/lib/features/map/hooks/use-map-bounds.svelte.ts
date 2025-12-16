import type { LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { globalActions } from '$lib/features/commons/store/global.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { calculateBoundsFromGeoArrow, calculateBoundsFromGeoJSON } from '../core';

export interface UseMapBoundsProps {
  getMap: () => MapLibreMap | null;
  getIsMapLoaded: () => boolean;
  getDatasetId: () => string | undefined;
  onBoundsUpdated: (zoom: number) => void;
  savePosition: () => void;
}

export interface UseMapBoundsReturn {
  fitToArrowBounds: (jsTable: ArrowTable | null) => void;
  fitToGeoJSONBounds: (geojson: FeatureCollection | null) => void;
  readonly shouldRestorePosition: boolean;
  setShouldRestorePosition: (value: boolean) => void;
}

export function useMapBounds(props: UseMapBoundsProps): UseMapBoundsReturn {
  const { getMap, getIsMapLoaded, getDatasetId, onBoundsUpdated, savePosition } = props;

  let lastFitTable = $state<ArrowTable | null>(null);
  let lastFitGeoJSON = $state<FeatureCollection | null>(null);
  let shouldRestorePosition = $state(true);

  function handleBoundsUpdate(bounds: LngLatBoundsLike): void {
    const map = getMap();
    if (!map) return;

    map.fitBounds(bounds, { padding: 50, duration: 300 });

    const onMoveEnd = () => {
      if (map) {
        const zoom = map.getZoom();
        onBoundsUpdated(zoom);
        globalActions.setMapZoom(100);
        savePosition();
        map.off('moveend', onMoveEnd);
      }
    };
    map.once('moveend', onMoveEnd);
  }

  function fitToArrowBounds(jsTable: ArrowTable | null): void {
    const map = getMap();
    if (
      !jsTable ||
      !jsTable.schema.metadata?.get('geo') ||
      !getIsMapLoaded() ||
      !map ||
      lastFitTable === jsTable
    ) {
      return;
    }

    shouldRestorePosition = false;
    const bounds = calculateBoundsFromGeoArrow(jsTable);
    if (bounds) {
      logger.info('Fitting map to Arrow dataset bounds', LogCategory.MAP, {
        datasetId: getDatasetId(),
        bounds
      });
      handleBoundsUpdate(bounds);
      lastFitTable = jsTable;
    }
  }

  function fitToGeoJSONBounds(geojson: FeatureCollection | null): void {
    const map = getMap();
    if (!geojson || !getIsMapLoaded() || !map || lastFitGeoJSON === geojson) {
      return;
    }

    shouldRestorePosition = false;
    const bounds = calculateBoundsFromGeoJSON(geojson);
    if (bounds) {
      logger.info('Fitting map to GeoJSON bounds', LogCategory.MAP, {
        featureCount: geojson.features.length
      });
      handleBoundsUpdate(bounds);
      lastFitGeoJSON = geojson;
    }
  }

  function setShouldRestorePosition(value: boolean): void {
    shouldRestorePosition = value;
  }

  return {
    fitToArrowBounds,
    fitToGeoJSONBounds,
    get shouldRestorePosition() { return shouldRestorePosition; },
    setShouldRestorePosition
  };
}
