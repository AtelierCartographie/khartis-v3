import { facetsStore, SCALE_MODE } from '../facets';
import {
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  getEnabledLegendPrimitives,
  getLegendComponents,
  type LegendComponent,
  type LegendSubtitlePrimitive
} from '$lib/features/commons/utils/legend-subtitle.utils';
import { LEGEND_ID_PREFIXES } from './legend.constants';
import type {
  LegendClassBarOrientation,
  LegendItem
} from '../../types/legend.types';

/** One legend a visualization owns: a primitive, or one channel of it. */
export interface LegendItemSlot {
  id: string;
  primitive: LegendSubtitlePrimitive;
  /** The channel this legend covers, when the primitive encodes one. */
  component?: LegendComponent;
  /** The primitive encodes several channels, each with a legend of its own. */
  split: boolean;
}

export function getLegendItemSlots(
  visualization: VisualizationConfig
): LegendItemSlot[] {
  return getEnabledLegendPrimitives(visualization).flatMap(
    (primitive): LegendItemSlot[] => {
      const baseId = `${LEGEND_ID_PREFIXES.VIZ}${visualization.id}--${primitive}`;
      const components = getLegendComponents(visualization, primitive);

      if (components.length < 2) {
        return [
          { id: baseId, primitive, component: components[0], split: false }
        ];
      }

      return components.map((component) => ({
        id: `${baseId}--${component}`,
        primitive,
        component,
        split: true
      }));
    }
  );
}

function getActiveLegendItemIds(
  visualizations: VisualizationConfig[]
): Set<string> {
  return new Set(
    visualizations.flatMap((visualization) =>
      getLegendItemSlots(visualization).map((slot) => slot.id)
    )
  );
}

export interface ResolvedLegendItemLayout {
  proportionalClasses: boolean;
  classBarOrientation: LegendClassBarOrientation;
  lowAtBottom: boolean;
  /** Share of the default gap, from 0 to 1. */
  entrySpacing: number;
}

// A saved project is untrusted JSON: anything unexpected falls back to the
// default drawing.
export function resolveLegendItemLayout(
  item: Pick<LegendItem, 'layout'>
): ResolvedLegendItemLayout {
  const layout = item.layout;
  const spacing = layout?.entrySpacing;

  return {
    proportionalClasses: layout?.proportionalClasses === true,
    classBarOrientation:
      layout?.classBarOrientation === 'vertical' ? 'vertical' : 'horizontal',
    lowAtBottom: layout?.lowAtBottom !== false,
    entrySpacing:
      typeof spacing === 'number' && Number.isFinite(spacing)
        ? Math.max(0, Math.min(100, spacing)) / 100
        : 1
  };
}

export function resolveLegendEntryLabel(
  item: Pick<LegendItem, 'entryLabel'>
): string | null {
  return typeof item.entryLabel === 'string' && item.entryLabel.trim()
    ? item.entryLabel
    : null;
}

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
  // A legend whose primitive or channel is switched off is kept, not drawn.
  const visualizations = visualizationStore.visualizations;
  const visualizationIds = new Set(visualizations.map((viz) => viz.id));
  const activeIds = getActiveLegendItemIds(visualizations);
  const drawnItems = items.filter(
    (item) =>
      !item.variableId ||
      !visualizationIds.has(item.variableId) ||
      activeIds.has(item.id)
  );

  if (scopeVizId) {
    return drawnItems.filter((item) => item.variableId === scopeVizId);
  }

  if (!facetsStore.enabled) {
    return drawnItems;
  }

  // In a map collection the base visualization is hidden, so its legend must
  // not appear; only the generated facets get a legend. With a shared scale
  // every facet shares the same breaks, so a single legend stands for all.
  const generatedIds = new Set(facetsStore.generatedVisualizationIds);
  const facetItems = drawnItems.filter(
    (item) => item.variableId != null && generatedIds.has(item.variableId)
  );

  if (facetsStore.scaleMode === SCALE_MODE.SHARED) {
    return facetItems.slice(0, 1);
  }

  return facetItems;
}
