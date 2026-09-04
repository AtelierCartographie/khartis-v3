import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import { osmBasemapStore, projectionStore } from '$lib/features/map';
import type { ScaleDistanceContext } from './geo-indications.utils';

function renderedCanvasSize(): { width: number; height: number } {
  const { canvasSize, renderScale } = projectionStore;
  const scale =
    Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1;
  return {
    width: canvasSize.width * scale,
    height: canvasSize.height * scale
  };
}

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
    // The bar is drawn unscaled, so its ground distance is measured per
    // rendered pixel — the page zoom does change how much ground one pixel
    // covers, unlike the framing the bounds describe.
    canvasSize: renderedCanvasSize(),
    isProjectedCoordinates: projectionStore.isProjectedCoordinates,
    projection: projectionStore.renderProjection
  };
}
