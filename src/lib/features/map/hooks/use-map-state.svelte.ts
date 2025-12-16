import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import { visualizationStore, type VisualizationConfig } from '$lib/features/commons/store/visualization.store.svelte';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import { HIGHLIGHT_FILL_COLOR } from '../layers';
import { getCategoricalColorMap, shouldApplyCategorical } from '../styling';
import type { LayerContext, RGBColor } from '../types';

const BASE_STROKE_COLOR: RGBColor = [255, 255, 255];

export interface UseMapStateReturn {
  readonly activeVisualizations: VisualizationConfig[];
  readonly defaultVisualization: VisualizationConfig | undefined;
  readonly datasetId: string | undefined;
  readonly memoizedColors: { fill: RGBColor; stroke: RGBColor };
  readonly memoizedStatistics: { min: number; max: number };
  readonly memoizedCategoryColorMap: Map<string, RGBColor> | null;
  buildLayerContext: () => LayerContext;
}

export function useMapState(): UseMapStateReturn {
  const activeVisualizations = $derived(visualizationStore.activeVisualizations);
  const defaultVisualization = $derived(activeVisualizations[0]);
  const datasetId = $derived(defaultVisualization?.datasetId);

  const memoizedColors = $derived.by(() => {
    const viz = defaultVisualization;
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
  });

  const memoizedStatistics = $derived.by(() => {
    const viz = defaultVisualization;
    if (!viz || !viz.mapping.sizeColumn || !datasetId) {
      return { min: 0, max: 100 };
    }

    const stats = datasetsStore.getColumnStatistics(
      datasetId,
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
  });

  const memoizedCategoryColorMap = $derived.by(() => {
    const viz = defaultVisualization;
    if (!viz || !viz.mapping.categoryColumn || !datasetId) {
      return null;
    }

    const useCategoricalColor = shouldApplyCategorical(viz);
    if (!useCategoricalColor || !viz.classification?.colors) {
      return null;
    }

    const categories = datasetsStore
      .getUniqueValues(datasetId, viz.mapping.categoryColumn)
      .map(String);

    return getCategoricalColorMap(categories, viz.classification.colors);
  });

  function buildLayerContext(): LayerContext {
    const viz = defaultVisualization;
    return {
      viz: viz ?? null,
      datasetId,
      fillColor: memoizedColors.fill,
      strokeColor: memoizedColors.stroke,
      fillOpacity: viz?.style.fillOpacity ?? 0.6,
      strokeWidth: viz?.style.strokeWidth ?? 1,
      strokeOpacity: viz?.style.strokeOpacity ?? 1,
      statistics: memoizedStatistics,
      categoryColorMap: memoizedCategoryColorMap
    };
  }

  return {
    get activeVisualizations() { return activeVisualizations; },
    get defaultVisualization() { return defaultVisualization; },
    get datasetId() { return datasetId; },
    get memoizedColors() { return memoizedColors; },
    get memoizedStatistics() { return memoizedStatistics; },
    get memoizedCategoryColorMap() { return memoizedCategoryColorMap; },
    buildLayerContext
  };
}
