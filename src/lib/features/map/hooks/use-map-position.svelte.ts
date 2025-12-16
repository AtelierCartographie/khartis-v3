import type { Map as MapLibreMap } from 'maplibre-gl';
import { globalActions } from '$lib/features/commons/store/global.svelte';
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
  restorePosition: () => void;
  getSavedPosition: () => MapPosition | null;
}

export function useMapPosition(props: UseMapPositionProps): UseMapPositionReturn {
  const { getMap, getIsMapLoaded, onPositionRestored } = props;

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
      const center = JSON.parse(savedCenter);
      const zoom = parseFloat(savedZoom);

      if (center.lng && center.lat && !isNaN(zoom)) {
        return { center, zoom };
      }
    } catch {
      return null;
    }

    return null;
  }

  function restorePosition(): void {
    const map = getMap();
    if (!map || !getIsMapLoaded() || typeof window === 'undefined') return;

    const position = getSavedPosition();
    if (!position) return;

    try {
      map.setCenter([position.center.lng, position.center.lat]);
      map.setZoom(position.zoom);
      globalActions.setMapZoom(100);

      onPositionRestored?.(position);
    } catch (error) {
      logger.warn('Failed to restore saved map position', LogCategory.MAP, {
        error
      });
    }
  }

  return {
    savePosition,
    restorePosition,
    getSavedPosition
  };
}
