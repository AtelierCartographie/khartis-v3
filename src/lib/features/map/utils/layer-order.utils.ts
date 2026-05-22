import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import type { Layer } from '@deck.gl/core';

export function getVisualizationRenderOrder(
  visualizations: readonly VisualizationConfig[]
): VisualizationConfig[] {
  return [...visualizations].reverse();
}

export function getThematicLayerRenderOrder(layers: readonly Layer[]): Layer[] {
  return [...layers];
}

export function getMapLayerRenderOrder({
  basemapBackgroundLayers,
  thematicLayers,
  basemapForegroundLayers
}: {
  basemapBackgroundLayers: readonly Layer[];
  thematicLayers: readonly Layer[];
  basemapForegroundLayers: readonly Layer[];
}): Layer[] {
  return [
    ...basemapBackgroundLayers,
    ...getThematicLayerRenderOrder(thematicLayers),
    ...basemapForegroundLayers
  ];
}
