import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import { DeckLayerId } from '$lib/features/map/constants/map.constants';
import type { Layer } from '@deck.gl/core';

export function getVisualizationRenderOrder(
  visualizations: readonly VisualizationConfig[]
): VisualizationConfig[] {
  return [...visualizations].reverse();
}

export function getThematicLayerRenderOrder(layers: readonly Layer[]): Layer[] {
  return [...layers];
}

function isThematicPolygonLayer(layer: Layer): boolean {
  return String(layer.id).startsWith(DeckLayerId.POLYGON_LAYER);
}

export function getMapLayerRenderOrder({
  basemapBackgroundLayers,
  basemapForegroundBelowThematicLayers = [],
  thematicLayers,
  basemapForegroundLayers
}: {
  basemapBackgroundLayers: readonly Layer[];
  basemapForegroundBelowThematicLayers?: readonly Layer[];
  thematicLayers: readonly Layer[];
  basemapForegroundLayers: readonly Layer[];
}): Layer[] {
  const orderedThematic = getThematicLayerRenderOrder(thematicLayers);
  const firstMarkerIndex = orderedThematic.findIndex(
    (layer) => !isThematicPolygonLayer(layer)
  );
  const insertAt =
    firstMarkerIndex < 0 ? orderedThematic.length : firstMarkerIndex;

  return [
    ...basemapBackgroundLayers,
    ...orderedThematic.slice(0, insertAt),
    ...basemapForegroundBelowThematicLayers,
    ...orderedThematic.slice(insertAt),
    ...basemapForegroundLayers
  ];
}
