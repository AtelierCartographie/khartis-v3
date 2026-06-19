import type { VisualizationConfig } from '$lib/features/commons/stores/visualization.store.svelte';
import type { Layer } from '@deck.gl/core';

export function getVisualizationRenderOrder(
  visualizations: readonly VisualizationConfig[]
): VisualizationConfig[] {
  return [...visualizations].reverse();
}

/**
 * Orders the full deck layer pool to match the flat layer panel: the GPU array
 * is the reverse of the panel (top of the panel = front of the map = drawn
 * last). Every layer resolves to a panel row id via `rowIdForLayer`; layers
 * that belong to the same row (e.g. a polygon fill and its stroke, or a city
 * symbol and its labels) keep their incoming emission order so sub-stacks stay
 * intact. A layer with no panel row (rare fallbacks) carries the previous
 * layer's rank forward, staying glued to its neighbour in the incoming bucket
 * order instead of jumping to an extreme.
 */
export function applyPanelRenderOrder(
  deckLayers: readonly Layer[],
  panelOrderTopToBottom: readonly string[],
  rowIdForLayer: (layer: Layer) => string | null
): Layer[] {
  const panelRank = new Map<string, number>();
  panelOrderTopToBottom.forEach((id, index) => panelRank.set(id, index));

  let carriedRank = panelOrderTopToBottom.length;
  const decorated = deckLayers.map((layer, originalIndex) => {
    const rowId = rowIdForLayer(layer);
    const resolved = rowId !== null ? panelRank.get(rowId) : undefined;
    if (resolved !== undefined) {
      carriedRank = resolved;
    }
    return { layer, originalIndex, rank: resolved ?? carriedRank };
  });

  // Higher panel rank (nearer the bottom = back) is drawn first; ties keep
  // emission order.
  decorated.sort((a, b) =>
    a.rank !== b.rank ? b.rank - a.rank : a.originalIndex - b.originalIndex
  );

  return decorated.map((entry) => entry.layer);
}
