import type { LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import { debounce } from '$lib/features/commons/utils/debounce.utils';
import {
  mapInstanceStore,
  type ViewportFitReason
} from '$lib/features/commons/store/map-instance.store.svelte';
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
  getFitPaddingPx: () => number;
  onBoundsUpdated: (zoom: number) => void;
  savePosition: () => void;
  onFitComplete?: () => void;
}

interface FitViewportOptions {
  animate?: boolean;
  reason?: ViewportFitReason;
}

export interface UseMapBoundsReturn {
  fitToArrowBounds: (
    jsTable: ArrowTable | null,
    datasetId?: string,
    options?: FitViewportOptions
  ) => void;
  fitToGeoJSONBounds: (
    geojson: FeatureCollection | null,
    options?: FitViewportOptions
  ) => void;
  fitToBounds: (bounds: LngLatBoundsLike, options?: FitViewportOptions) => void;
  readonly shouldRestorePosition: boolean;
  setShouldRestorePosition: (value: boolean) => void;
  resetFitState: () => void;
}

export function useMapBounds(props: UseMapBoundsProps): UseMapBoundsReturn {
  const {
    getMap,
    getIsMapLoaded,
    getDatasetId,
    getFitPaddingPx,
    onBoundsUpdated,
    savePosition,
    onFitComplete
  } = props;

  let lastFitDatasetId: string | null = null;
  let lastFitGeoJSON: FeatureCollection | null = null;
  let shouldRestorePosition = $state(true);

  function getNormalizedFitPaddingPx(): number {
    const padding = getFitPaddingPx();

    if (!Number.isFinite(padding) || padding < 0) {
      return MAP_TIMING.FITBOUNDS_PADDING_PX;
    }

    return Math.round(padding);
  }

  function executeFitBounds(
    bounds: LngLatBoundsLike,
    { animate = false, reason = 'dataset' }: FitViewportOptions = {}
  ): void {
    const map = getMap();
    if (!map) {
      onFitComplete?.();
      return;
    }

    const padding = getNormalizedFitPaddingPx();
    mapInstanceStore.markViewportAutoFit(reason);
    map.fitBounds(bounds, {
      padding: {
        top: padding,
        right: padding,
        bottom: padding,
        left: padding
      },
      duration: animate ? MAP_TIMING.ZOOM_ANIMATION_MS : 0
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

  function handleBoundsUpdate(
    bounds: LngLatBoundsLike,
    options: FitViewportOptions = {}
  ): void {
    debouncedFitBounds(bounds, options);
  }

  function fitToArrowBounds(
    jsTable: ArrowTable | null,
    datasetId?: string,
    options: FitViewportOptions = {}
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
      executeFitBounds(bounds, {
        reason: options.reason ?? 'dataset',
        animate: options.animate
      });
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

  function fitToGeoJSONBounds(
    geojson: FeatureCollection | null,
    options: FitViewportOptions = {}
  ): void {
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
      handleBoundsUpdate(bounds, {
        reason: options.reason ?? 'dataset',
        animate: options.animate
      });
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

  function fitToBounds(
    bounds: LngLatBoundsLike,
    options: FitViewportOptions = {}
  ): void {
    const map = getMap();
    if (!map || !getIsMapLoaded()) return;
    shouldRestorePosition = false;
    executeFitBounds(bounds, {
      reason: options.reason ?? 'dataset',
      animate: options.animate
    });
  }

  return {
    fitToArrowBounds,
    fitToGeoJSONBounds,
    fitToBounds,
    get shouldRestorePosition() {
      return shouldRestorePosition;
    },
    setShouldRestorePosition,
    resetFitState
  };
}
