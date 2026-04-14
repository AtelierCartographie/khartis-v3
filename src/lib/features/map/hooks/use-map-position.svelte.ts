import type { Map as MapLibreMap } from 'maplibre-gl';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { MapStorageKey } from '../constants';
import type { MapPosition } from '../types';

export interface UseMapPositionProps {
  getMap: () => MapLibreMap | null;
  getIsMapLoaded: () => boolean;
  onPositionRestored?: (position: MapPosition) => void;
}

export interface UseMapPositionReturn {
  savePosition: () => void;
  restorePosition: () => boolean;
  getSavedPosition: () => MapPosition | null;
}

export function useMapPosition(
  props: UseMapPositionProps
): UseMapPositionReturn {
  const { getMap, getIsMapLoaded, onPositionRestored } = props;

  function isFiniteCoordinate(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function savePosition(): void {
    const map = getMap();
    if (!map || !getIsMapLoaded()) return;

    const center = map.getCenter();
    const zoom = map.getZoom();

    if (typeof window !== 'undefined') {
      localStorage.setItem(
        MapStorageKey.MAP_CENTER,
        JSON.stringify({ lng: center.lng, lat: center.lat })
      );
      localStorage.setItem(MapStorageKey.MAP_ZOOM, String(zoom));
    }
  }

  function getSavedPosition(): MapPosition | null {
    if (typeof window === 'undefined') return null;

    const savedCenter = localStorage.getItem(MapStorageKey.MAP_CENTER);
    const savedZoom = localStorage.getItem(MapStorageKey.MAP_ZOOM);

    if (!savedCenter || !savedZoom) return null;

    try {
      const center = JSON.parse(savedCenter) as {
        lng?: unknown;
        lat?: unknown;
      };
      const zoom = parseFloat(savedZoom);

      if (
        isFiniteCoordinate(center.lng) &&
        isFiniteCoordinate(center.lat) &&
        Number.isFinite(zoom)
      ) {
        return {
          center: {
            lng: center.lng,
            lat: center.lat
          },
          zoom
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  function restorePosition(): boolean {
    const map = getMap();
    if (!map || !getIsMapLoaded() || typeof window === 'undefined')
      return false;

    const position = getSavedPosition();
    if (!position) return false;

    try {
      map.setCenter([position.center.lng, position.center.lat]);
      map.setZoom(position.zoom);

      onPositionRestored?.(position);
      return true;
    } catch (error) {
      logger.warn('Failed to restore saved map position', LogCategory.MAP, {
        error
      });
      return false;
    }
  }

  return {
    savePosition,
    restorePosition,
    getSavedPosition
  };
}
