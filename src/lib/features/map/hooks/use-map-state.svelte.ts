import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';
import {
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import { ProportionalType } from '$lib/features/main-toolbar/constants';
import { HIGHLIGHT_FILL_COLOR } from '../layers';
import { mapHighlightStore } from '../stores/map-highlight.store.svelte';
import { getCategoricalColorMap, shouldApplyCategorical } from '../styling';
import type { LayerContext, RGBColor } from '../types';

const BASE_STROKE_COLOR: RGBColor = [255, 255, 255];

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  return null;
}

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

function getColumnStatisticsForViz(
  viz: VisualizationConfig,
  columnName: string | undefined
): {
  min: number;
  max: number;
} {
  if (!columnName || !viz.datasetId) {
    return { min: 0, max: 100 };
  }

  const stats = datasetsStore.getColumnStatistics(viz.datasetId, columnName);
  const minValue = stats && 'min' in stats ? toFiniteNumber(stats.min) : null;
  const maxValue = stats && 'max' in stats ? toFiniteNumber(stats.max) : null;

  if (minValue !== null && maxValue !== null) {
    return { min: minValue, max: maxValue };
  }

  return { min: 0, max: 100 };
}

function getStatisticsForViz(viz: VisualizationConfig): {
  min: number;
  max: number;
} {
  return getColumnStatisticsForViz(viz, viz.mapping.sizeColumn);
}

function getSecondaryStatisticsForViz(viz: VisualizationConfig):
  | {
      min: number;
      max: number;
    }
  | undefined {
  const isDoubleProportional =
    viz.modes?.proportionalType === ProportionalType.DOUBLE &&
    !!viz.mapping.valueColumn;

  if (!isDoubleProportional) {
    return undefined;
  }

  return getColumnStatisticsForViz(viz, viz.mapping.valueColumn);
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

  const categories =
    viz.classification.labels
      ?.map((label) => {
        if (label === null || label === undefined) {
          return null;
        }

        const normalized = String(label);
        return normalized.length > 0 ? normalized : null;
      })
      .filter((label): label is string => label !== null) ?? [];

  if (categories.length === 0) {
    return null;
  }

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
    const secondaryStatistics = getSecondaryStatisticsForViz(viz);
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
      secondaryStatistics,
      categoryColorMap,
      highlightedRowIds: mapHighlightStore.hasHighlights
        ? mapHighlightStore.highlightedRowIds
        : undefined,
      highlightVersion: mapHighlightStore.version,
      primitiveOrder: viz.primitiveOrder
    };
  }

  return {
    get activeVisualizations() {
      return activeVisualizations;
    },
    buildLayerContextForViz
  };
}
