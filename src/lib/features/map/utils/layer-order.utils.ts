import type { VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import type { Layer } from '@deck.gl/core';
import { DeckLayerId } from '$lib/features/map/constants/map.constants';

export function getVisualizationRenderOrder(
  visualizations: readonly VisualizationConfig[]
): VisualizationConfig[] {
  // The layers tool lists visualizations from top to bottom, with the top item
  // expected to render above the items below it. Deck.gl renders the last layer
  // in the array on top, so parent visualizations must be composed in reverse UI
  // order before calling setProps({ layers }).
  return [...visualizations].reverse();
}

function hasDeckLayerPrefix(layerId: string, prefix: DeckLayerId): boolean {
  return layerId === prefix || layerId.startsWith(`${prefix}-`);
}

function isTextOverlayLayer(layer: Layer): boolean {
  return (
    typeof layer.id === 'string' &&
    (hasDeckLayerPrefix(layer.id, DeckLayerId.LABEL_LAYER) ||
      hasDeckLayerPrefix(layer.id, DeckLayerId.TEXT_LAYER))
  );
}

export function getThematicLayerRenderOrder(layers: readonly Layer[]): Layer[] {
  const textLayers: Layer[] = [];
  const geometryLayers: Layer[] = [];

  for (const layer of layers) {
    if (isTextOverlayLayer(layer)) {
      textLayers.push(layer);
    } else {
      geometryLayers.push(layer);
    }
  }

  // Deck.gl renders later entries above earlier ones. Keeping text overlays
  // first guarantees they stay below symbols, lines and polygons, even when
  // several visualizations are stacked together.
  return [...textLayers, ...geometryLayers];
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
