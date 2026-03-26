import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import {
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import { HIGHLIGHT_FILL_COLOR } from '../layers';
import { mapHighlightStore } from '../stores/map-highlight.store.svelte';
import { getCategoricalColorMap, shouldApplyCategorical } from '../styling';
import type { LayerContext, RGBColor } from '../types';

const BASE_STROKE_COLOR: RGBColor = [255, 255, 255];

export interface UseMapStateReturn {
  readonly activeVisualizations: VisualizationConfig[];
  buildLayerContextForViz: (viz: VisualizationConfig) => LayerContext;
}

export interface UseMapStateOptions {
  forcedVisualizationIds?: string[];
  getForcedVisualizationIds?: () => string[] | undefined;
}

function getColorsForViz(viz: VisualizationConfig | null): {
  fill: RGBColor;
  stroke: RGBColor;
} {
  if (!viz) {
    return {
      fill: HIGHLIGHT_FILL_COLOR,
      stroke: BASE_STROKE_COLOR
    };
  }

  return {
    fill: viz.style.fillColor
      ? hexToRgb(viz.style.fillColor as string)
      : HIGHLIGHT_FILL_COLOR,
    stroke: viz.style.strokeColor
      ? hexToRgb(viz.style.strokeColor)
      : BASE_STROKE_COLOR
  };
}

function getStatisticsForViz(viz: VisualizationConfig): {
  min: number;
  max: number;
} {
  if (!viz.mapping.sizeColumn || !viz.datasetId) {
    return { min: 0, max: 100 };
  }

  const stats = datasetsStore.getColumnStatistics(
    viz.datasetId,
    viz.mapping.sizeColumn
  );

  if (
    stats &&
    'min' in stats &&
    'max' in stats &&
    typeof stats.min === 'number' &&
    typeof stats.max === 'number'
  ) {
    return { min: stats.min, max: stats.max };
  }

  return { min: 0, max: 100 };
}

function getCategoryColorMapForViz(
  viz: VisualizationConfig
): Map<string, RGBColor> | null {
  if (!viz.mapping.categoryColumn || !viz.datasetId) {
    return null;
  }

  const useCategoricalColor = shouldApplyCategorical(viz);
  if (!useCategoricalColor || !viz.classification?.colors) {
    return null;
  }

  const categories = datasetsStore
    .getUniqueValues(viz.datasetId, viz.mapping.categoryColumn)
    .map(String);

  return getCategoricalColorMap(categories, viz.classification.colors);
}

export function useMapState(options?: UseMapStateOptions): UseMapStateReturn {
  const activeVisualizations = $derived.by(() => {
    const forcedIds =
      options?.getForcedVisualizationIds?.() ?? options?.forcedVisualizationIds;
    if (!forcedIds || forcedIds.length === 0) {
      return visualizationStore.activeVisualizations;
    }

    const forcedSet = new Set(forcedIds);
    return visualizationStore.activeVisualizations.filter((visualization) =>
      forcedSet.has(visualization.id)
    );
  });

  function buildLayerContextForViz(viz: VisualizationConfig): LayerContext {
    const colors = getColorsForViz(viz);
    const statistics = getStatisticsForViz(viz);
    const categoryColorMap = getCategoryColorMapForViz(viz);

    return {
      viz,
      datasetId: viz.datasetId,
      fillColor: colors.fill,
      strokeColor: colors.stroke,
      fillOpacity: viz.style.fillOpacity ?? 1,
      strokeWidth: viz.style.strokeWidth ?? 1,
      strokeOpacity: viz.style.strokeOpacity ?? 1,
      statistics,
      categoryColorMap,
      highlightedRowIds: mapHighlightStore.hasHighlights
        ? mapHighlightStore.highlightedRowIds
        : undefined,
      highlightVersion: mapHighlightStore.version
    };
  }

  return {
    get activeVisualizations() {
      return activeVisualizations;
    },
    buildLayerContextForViz
  };
}
