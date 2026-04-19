import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import type { Layer } from '@deck.gl/core';

export function getVisualizationRenderOrder(
  visualizations: readonly VisualizationConfig[]
): VisualizationConfig[] {
  // Deck.gl renders last-in-array on top; UI shows top item first — reverse to match.
  return [...visualizations].reverse();
}

export function getThematicLayerRenderOrder(layers: readonly Layer[]): Layer[] {
  // Re-grouping texts globally would break the per-visualization layer order — keep layers in creation order.
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
