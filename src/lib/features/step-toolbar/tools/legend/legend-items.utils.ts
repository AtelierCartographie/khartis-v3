import { facetsStore, SCALE_MODE } from '../facets';
import type { LegendItem } from '../../types/legend.types';

/**
 * Returns the legend items that are actually rendered on the map for the
 * current facet configuration. The legend editor and the map overlay must
 * agree on this set, otherwise the editor exposes a phantom entry (e.g. the
 * base visualization in a collection) that maps to no on-screen legend.
 */
export function selectRenderedLegendItems(
  items: LegendItem[],
  options?: { scopeVizId?: string | null }
): LegendItem[] {
  const scopeVizId = options?.scopeVizId ?? null;

  if (scopeVizId) {
    return items.filter((item) => item.variableId === scopeVizId);
  }

  if (!facetsStore.enabled) {
    return items;
  }

  // In a map collection the base visualization is hidden, so its legend must
  // not appear; only the generated facets get a legend. With a shared scale
  // every facet shares the same breaks, so a single legend stands for all.
  const generatedIds = new Set(facetsStore.generatedVisualizationIds);
  const facetItems = items.filter(
    (item) => item.variableId != null && generatedIds.has(item.variableId)
  );

  if (facetsStore.scaleMode === SCALE_MODE.SHARED) {
    return facetItems.slice(0, 1);
  }

  return facetItems;
}
