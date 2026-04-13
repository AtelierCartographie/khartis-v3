import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import type { Layer } from '@deck.gl/core';

export function getVisualizationRenderOrder(
  visualizations: readonly VisualizationConfig[]
): VisualizationConfig[] {
  // The layers tool lists visualizations from top to bottom, with the top item
  // expected to render above the items below it. Deck.gl renders the last layer
  // in the array on top, so parent visualizations must be composed in reverse UI
  // order before calling setProps({ layers }).
  return [...visualizations].reverse();
}

export function getThematicLayerRenderOrder(layers: readonly Layer[]): Layer[] {
  // `createDeckLayers()` already builds each visualization in the intended
  // order (geometry first, text overlays above that geometry), and
  // `getVisualizationRenderOrder()` already reverses parent visualizations so
  // the top item in `Calques` is rendered last. Re-grouping texts globally
  // breaks that contract by forcing labels/texts under lower visualizations.
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
