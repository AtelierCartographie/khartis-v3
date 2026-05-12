import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import {
  getLinePrimitive,
  getPolygonPrimitive,
  getPrimitiveCategoryColumn,
  getPrimitiveClassification,
  getPrimitiveSizeColumn,
  getPrimitiveValueColumn,
  getSymbolFillCategoryColumn,
  getSymbolFillClassification,
  getSymbolPrimitive,
  PrimitiveFilterType,
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { hexToRgb } from '$lib/features/commons/utils/color-utils';
import {
  ProportionalType,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';
import { HIGHLIGHT_FILL_COLOR } from '../layers';
import { mapHighlightStore } from '../stores/map-highlight.store.svelte';
import { getCategoricalColorMap, shouldApplyCategorical } from '../styling';
import type { LayerContext, RGBColor } from '../types';

const BASE_STROKE_COLOR: RGBColor = [255, 255, 255];

function resolveColorToRgb(
  color: string | string[] | undefined,
  fallback: RGBColor
): RGBColor {
  if (Array.isArray(color)) {
    return typeof color[0] === 'string' ? hexToRgb(color[0]) : fallback;
  }

  return typeof color === 'string' ? hexToRgb(color) : fallback;
}

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
  symbolFill: RGBColor;
  stroke: RGBColor;
} {
  if (!viz) {
    return {
      fill: HIGHLIGHT_FILL_COLOR,
      symbolFill: HIGHLIGHT_FILL_COLOR,
      stroke: BASE_STROKE_COLOR
    };
  }

  const polygon = getPolygonPrimitive(viz);
  const symbol = getSymbolPrimitive(viz);
  const line = getLinePrimitive(viz);

  const fill = resolveColorToRgb(polygon?.fillColor, HIGHLIGHT_FILL_COLOR);
  const symbolFill = resolveColorToRgb(symbol?.fillColor, HIGHLIGHT_FILL_COLOR);

  return {
    fill,
    symbolFill,
    stroke: resolveColorToRgb(
      polygon?.strokeColor ?? line?.color,
      BASE_STROKE_COLOR
    )
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

function getStatisticsForViz(
  viz: VisualizationConfig,
  columnName: string | undefined
): {
  min: number;
  max: number;
} {
  return getColumnStatisticsForViz(viz, columnName);
}

function getSecondaryStatisticsForViz(
  viz: VisualizationConfig,
  columnName: string | undefined
):
  | {
      min: number;
      max: number;
    }
  | undefined {
  if (!columnName) {
    return undefined;
  }

  return getColumnStatisticsForViz(viz, columnName);
}

function getCategoryColorMapForViz(
  viz: VisualizationConfig,
  primitive: PrimitiveFilterType
): Map<string, RGBColor> | null {
  const pointSymbol =
    primitive === PrimitiveFilterType.POINT
      ? getSymbolPrimitive(viz)
      : undefined;
  const categoryColumn =
    primitive === PrimitiveFilterType.POINT
      ? pointSymbol?.mode === SymbolMode.CATEGORIES
        ? getPrimitiveCategoryColumn(viz, primitive)
        : getSymbolFillCategoryColumn(viz)
      : getPrimitiveCategoryColumn(viz, primitive);
  const classification =
    primitive === PrimitiveFilterType.POINT
      ? pointSymbol?.mode === SymbolMode.CATEGORIES
        ? (getPrimitiveClassification(viz, primitive) ?? viz.classification)
        : (getSymbolFillClassification(viz) ?? viz.classification)
      : (getPrimitiveClassification(viz, primitive) ?? viz.classification);

  if (!categoryColumn || !viz.datasetId) {
    return null;
  }

  const useCategoricalColor = shouldApplyCategorical(viz, primitive);
  if (!useCategoricalColor || !classification?.colors) {
    return null;
  }

  const categories =
    (classification.categoryValues ?? classification.labels)
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

  return getCategoricalColorMap(categories, classification.colors);
}

export function useMapState(options?: UseMapStateOptions): UseMapStateReturn {
  const activeVisualizations = $derived.by(() => {
    void visualizationStore.version;

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
    const pointConfig = getSymbolPrimitive(viz);
    const pointStatistics = getStatisticsForViz(
      viz,
      getPrimitiveSizeColumn(viz, PrimitiveFilterType.POINT)
    );
    const pointSecondaryStatistics =
      pointConfig?.proportionalType === ProportionalType.DOUBLE
        ? getSecondaryStatisticsForViz(viz, pointConfig.valueColumn)
        : undefined;
    const lineStatistics = getStatisticsForViz(
      viz,
      getPrimitiveSizeColumn(viz, PrimitiveFilterType.LINE)
    );
    const textStatistics = getStatisticsForViz(
      viz,
      getPrimitiveValueColumn(viz, PrimitiveFilterType.TEXT)
    );
    const pointCategoryColorMap = getCategoryColorMapForViz(
      viz,
      PrimitiveFilterType.POINT
    );
    const lineCategoryColorMap = getCategoryColorMapForViz(
      viz,
      PrimitiveFilterType.LINE
    );
    const polygonCategoryColorMap = getCategoryColorMapForViz(
      viz,
      PrimitiveFilterType.POLYGON
    );
    const textCategoryColorMap = getCategoryColorMapForViz(
      viz,
      PrimitiveFilterType.TEXT
    );

    return {
      viz,
      datasetId: viz.datasetId,
      fillColor: colors.fill,
      symbolFillColor: colors.symbolFill,
      strokeColor: colors.stroke,
      fillOpacity: viz.style.fillOpacity ?? 1,
      strokeWidth: viz.style.strokeWidth ?? 1,
      strokeOpacity: viz.style.strokeOpacity ?? 1,
      statistics: pointStatistics,
      secondaryStatistics: pointSecondaryStatistics,
      categoryColorMap: pointCategoryColorMap,
      pointStatistics,
      pointSecondaryStatistics,
      pointCategoryColorMap,
      lineStatistics,
      lineCategoryColorMap,
      polygonCategoryColorMap,
      textStatistics,
      textCategoryColorMap,
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
