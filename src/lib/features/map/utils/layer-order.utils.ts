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

const THEMATIC_TEXT_LAYER_ID_PREFIXES = [
  `${DeckLayerId.TEXT_LAYER}-`,
  `${DeckLayerId.LABEL_LAYER}-`
] as const;

function isThematicTextLayer(layer: Layer): boolean {
  return THEMATIC_TEXT_LAYER_ID_PREFIXES.some((prefix) =>
    layer.id.startsWith(prefix)
  );
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
  const ordered = getThematicLayerRenderOrder(thematicLayers);
  const nonText: Layer[] = [];
  const text: Layer[] = [];
  for (const layer of ordered) {
    (isThematicTextLayer(layer) ? text : nonText).push(layer);
  }
  return [
    ...basemapBackgroundLayers,
    ...nonText,
    ...basemapForegroundLayers,
    ...text
  ];
}
