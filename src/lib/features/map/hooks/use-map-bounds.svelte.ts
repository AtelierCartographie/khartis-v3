import type { LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { FeatureCollection } from 'geojson';
import {
  calculateBoundsFromGeoArrow,
  calculateBoundsFromGeoJSON
} from '../core';
import { MAP_TIMING } from '../constants/timing.constants';
import { debounce } from '$lib/features/commons/utils/debounce.utils';
import {
  mapInstanceStore,
  type ViewportFitReason
} from '$lib/features/commons/stores/map-instance.store.svelte';

export interface UseMapBoundsProps {
  getMap: () => MapLibreMap | null;
  getIsMapLoaded: () => boolean;
  getDatasetId: () => string | undefined;
  getFitPaddingPx: () => number;
  onBoundsUpdated: (zoom: number) => void;
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
  resetFitState: () => void;
}

export function useMapBounds(props: UseMapBoundsProps): UseMapBoundsReturn {
  const {
    getMap,
    getIsMapLoaded,
    getDatasetId,
    getFitPaddingPx,
    onBoundsUpdated,
    onFitComplete
  } = props;

  let lastFitDatasetId: string | null = null;
  let lastFitGeoJSON: FeatureCollection | null = null;

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

    const bounds = calculateBoundsFromGeoArrow(jsTable);
    if (bounds) {
      executeFitBounds(bounds, {
        reason: options.reason ?? 'dataset',
        animate: options.animate
      });
      if (currentDatasetId) {
        lastFitDatasetId = currentDatasetId;
      }
    } else {
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

    const bounds = calculateBoundsFromGeoJSON(geojson);
    if (bounds) {
      handleBoundsUpdate(bounds, {
        reason: options.reason ?? 'dataset',
        animate: options.animate
      });
      lastFitGeoJSON = geojson;
    } else {
      onFitComplete?.();
    }
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
    executeFitBounds(bounds, {
      reason: options.reason ?? 'dataset',
      animate: options.animate
    });
  }

  return {
    fitToArrowBounds,
    fitToGeoJSONBounds,
    fitToBounds,
    resetFitState
  };
}
