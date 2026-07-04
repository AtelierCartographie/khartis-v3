import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import { osmBasemapStore, projectionStore } from '$lib/features/map';
import type { ScaleDistanceContext } from './geo-indications.utils';

export function getCurrentScaleDistanceContext(): ScaleDistanceContext {
  const usesTiledBasemap =
    basemapStyleStore.requiresMapLibre || osmBasemapStore.isActive;
  const deckBounds = usesTiledBasemap
    ? null
    : mapInstanceStore.getDeckMapBounds();
  const useDeckContext = deckBounds !== null;
  const center = useDeckContext ? null : mapInstanceStore.getMapCenter();

  return {
    map: useDeckContext ? null : mapInstanceStore.map,
    zoom: useDeckContext
      ? mapInstanceStore.deckViewState.zoom
      : mapInstanceStore.currentZoom,
    centerLatitude: center?.lat ?? null,
    bounds: useDeckContext ? deckBounds : mapInstanceStore.getMapBounds(),
    canvasSize: projectionStore.canvasSize,
    isProjectedCoordinates: projectionStore.isProjectedCoordinates,
    projection: projectionStore.renderProjection
  };
}
