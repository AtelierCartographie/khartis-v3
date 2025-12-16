import type { Map as MapLibreMap } from 'maplibre-gl';
import { globalActions, globalState } from '$lib/features/commons/store/global.svelte';

export interface UseMapZoomProps {
  getMap: () => MapLibreMap | null;
  getIsMapLoaded: () => boolean;
  getBaseZoomLevel: () => number;
  setBaseZoomLevel: (zoom: number) => void;
}

export interface UseMapZoomReturn {
  syncZoomToMap: () => void;
  handleMapZoom: () => void;
  readonly isZoomSyncing: boolean;
}

export function useMapZoom(props: UseMapZoomProps): UseMapZoomReturn {
  const { getMap, getIsMapLoaded, getBaseZoomLevel, setBaseZoomLevel } = props;

  let isZoomSyncing = $state(false);

  function syncZoomToMap(): void {
    const map = getMap();
    if (!map || !getIsMapLoaded() || isZoomSyncing) return;

    isZoomSyncing = true;
    const zoomPercent = globalState.zoom.mapZoomLevel;
    const baseZoom = getBaseZoomLevel();
    const mapLibreZoom = baseZoom + Math.log2(zoomPercent / 100) * 2;
    map.setZoom(mapLibreZoom);

    setTimeout(() => {
      isZoomSyncing = false;
    }, 100);
  }

  function handleMapZoom(): void {
    const map = getMap();
    if (!map || isZoomSyncing) return;

    const mapLibreZoom = map.getZoom();
    const baseZoom = getBaseZoomLevel();
    const zoomPercent = 100 * Math.pow(2, (mapLibreZoom - baseZoom) / 2);
    globalActions.setMapZoom(Math.round(zoomPercent));
  }

  function updateBaseZoomFromMap(): void {
    const map = getMap();
    if (map) {
      setBaseZoomLevel(map.getZoom());
      globalActions.setMapZoom(100);
    }
  }

  return {
    syncZoomToMap,
    handleMapZoom,
    get isZoomSyncing() { return isZoomSyncing; }
  };
}
