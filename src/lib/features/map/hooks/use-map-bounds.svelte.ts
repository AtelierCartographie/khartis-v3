import type { LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { debounce } from '$lib/features/commons/utils/debounce.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  calculateBoundsFromGeoArrow,
  calculateBoundsFromGeoJSON
} from '../core';
import { MAP_TIMING } from '../constants/timing.constants';

export interface UseMapBoundsProps {
  getMap: () => MapLibreMap | null;
  getIsMapLoaded: () => boolean;
  getDatasetId: () => string | undefined;
  onBoundsUpdated: (zoom: number) => void;
  savePosition: () => void;
  onFitComplete?: () => void;
}

export interface UseMapBoundsReturn {
  fitToArrowBounds: (jsTable: ArrowTable | null, datasetId?: string) => void;
  fitToGeoJSONBounds: (geojson: FeatureCollection | null) => void;
  readonly shouldRestorePosition: boolean;
  setShouldRestorePosition: (value: boolean) => void;
  resetFitState: () => void;
}

export function useMapBounds(props: UseMapBoundsProps): UseMapBoundsReturn {
  const {
    getMap,
    getIsMapLoaded,
    getDatasetId,
    onBoundsUpdated,
    savePosition,
    onFitComplete
  } = props;

  let lastFitDatasetId = $state<string | null>(null);
  let lastFitGeoJSON = $state<FeatureCollection | null>(null);
  let shouldRestorePosition = $state(true);

  function executeFitBounds(bounds: LngLatBoundsLike): void {
    const map = getMap();
    if (!map) {
      onFitComplete?.();
      return;
    }

    map.fitBounds(bounds, {
      padding: MAP_TIMING.FITBOUNDS_PADDING_PX,
      duration: 0
    });

    const onMoveEnd = () => {
      if (map) {
        const zoomAfter = map.getZoom();
        onBoundsUpdated(zoomAfter);
        savePosition();
        map.off('moveend', onMoveEnd);
        onFitComplete?.();
      }
    };
    map.once('moveend', onMoveEnd);
  }

  const debouncedFitBounds = debounce(
    executeFitBounds,
    MAP_TIMING.FITBOUNDS_DEBOUNCE_MS
  );

  function handleBoundsUpdate(bounds: LngLatBoundsLike): void {
    debouncedFitBounds(bounds);
  }

  function fitToArrowBounds(
    jsTable: ArrowTable | null,
    datasetId?: string
  ): void {
    const currentDatasetId = datasetId ?? getDatasetId();
    const map = getMap();

    if (
      !jsTable ||
      !getIsMapLoaded() ||
      !map ||
      (currentDatasetId && lastFitDatasetId === currentDatasetId)
    ) {
      return;
    }

    shouldRestorePosition = false;
    const bounds = calculateBoundsFromGeoArrow(jsTable);
    if (bounds) {
      logger.info('Fitting map to Arrow dataset bounds', LogCategory.MAP, {
        datasetId: currentDatasetId,
        bounds
      });
      executeFitBounds(bounds);
      if (currentDatasetId) {
        lastFitDatasetId = currentDatasetId;
      }
    } else {
      logger.warn(
        'Could not calculate bounds from Arrow table',
        LogCategory.MAP,
        {
          datasetId: currentDatasetId,
          numRows: jsTable.numRows,
          fields: jsTable.schema.fields.map((f) => f.name)
        }
      );
      onFitComplete?.();
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
    } else {
      onFitComplete?.();
    }
  }

  function setShouldRestorePosition(value: boolean): void {
    shouldRestorePosition = value;
  }

  function resetFitState(): void {
    lastFitDatasetId = null;
    lastFitGeoJSON = null;
  }

  return {
    fitToArrowBounds,
    fitToGeoJSONBounds,
    get shouldRestorePosition() {
      return shouldRestorePosition;
    },
    setShouldRestorePosition,
    resetFitState
  };
}
