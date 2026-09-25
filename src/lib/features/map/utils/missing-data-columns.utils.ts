import type { MissingValueColumn } from '$lib/features/duckdb';
import {
  FillMode,
  StrokeMode,
  SymbolMode,
  ThicknessMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  getLinePrimitive,
  getPolygonPrimitive,
  getPrimitiveCategoryColumn,
  getPrimitiveSizeColumn,
  getPrimitiveValueColumn,
  getSymbolFillCategoryColumn,
  getSymbolFillValueColumn,
  getSymbolPrimitive,
  getTextPrimitive,
  PrimitiveFilterType,
  type PrimitiveFilter,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import {
  shouldApplyCategorical,
  shouldApplyChoropleth,
  shouldApplyProportionalSymbols
} from './data-styling.utils';

function numeric(column: string | undefined): MissingValueColumn[] {
  return column ? [{ column, numeric: true }] : [];
}

function textual(column: string | undefined): MissingValueColumn[] {
  return column ? [{ column, numeric: false }] : [];
}

function getPolygonMissingDataColumns(
  viz: VisualizationConfig
): MissingValueColumn[] {
  const polygon = getPolygonPrimitive(viz);
  if (!polygon) {
    return [];
  }

  const fillColumns =
    polygon.fillMode === FillMode.DENSITY
      ? numeric(viz.density?.valueColumn)
      : shouldApplyChoropleth(viz, PrimitiveFilterType.POLYGON)
        ? numeric(polygon.valueColumn)
        : shouldApplyCategorical(viz, PrimitiveFilterType.POLYGON)
          ? textual(polygon.categoryColumn)
          : [];
  const strokeColumns =
    polygon.strokeMode === StrokeMode.CLASSES
      ? numeric(polygon.strokeValueColumn)
      : polygon.strokeMode === StrokeMode.CATEGORIES
        ? textual(polygon.strokeCategoryColumn)
        : [];

  return [...fillColumns, ...strokeColumns];
}

function getPointMissingDataColumns(
  viz: VisualizationConfig
): MissingValueColumn[] {
  const symbol = getSymbolPrimitive(viz);
  if (!symbol) {
    return [];
  }

  if (symbol.mode === SymbolMode.CLASSES) {
    return numeric(getPrimitiveValueColumn(viz, PrimitiveFilterType.POINT));
  }
  if (shouldApplyChoropleth(viz, PrimitiveFilterType.POINT)) {
    return numeric(getSymbolFillValueColumn(viz));
  }
  if (shouldApplyProportionalSymbols(viz)) {
    return numeric(getPrimitiveSizeColumn(viz, PrimitiveFilterType.POINT));
  }
  if (shouldApplyCategorical(viz, PrimitiveFilterType.POINT)) {
    return textual(
      symbol.mode === SymbolMode.CATEGORIES
        ? getPrimitiveCategoryColumn(viz, PrimitiveFilterType.POINT)
        : getSymbolFillCategoryColumn(viz)
    );
  }
  return [];
}

function getLineMissingDataColumns(
  viz: VisualizationConfig
): MissingValueColumn[] {
  const line = getLinePrimitive(viz);
  if (!line) {
    return [];
  }

  const colorColumns = shouldApplyChoropleth(viz, PrimitiveFilterType.LINE)
    ? numeric(line.valueColumn)
    : shouldApplyCategorical(viz, PrimitiveFilterType.LINE)
      ? textual(line.categoryColumn)
      : [];
  const widthColumns =
    line.thicknessMode === ThicknessMode.PROPORTIONAL
      ? numeric(line.sizeColumn)
      : line.thicknessMode === ThicknessMode.CLASSES
        ? numeric(line.valueColumn)
        : [];

  return [...colorColumns, ...widthColumns];
}

export function getPrimitiveMissingDataColumns(
  viz: VisualizationConfig,
  primitive: PrimitiveFilter
): MissingValueColumn[] {
  switch (primitive) {
    case PrimitiveFilterType.POLYGON:
      return getPolygonMissingDataColumns(viz);
    case PrimitiveFilterType.POINT:
      return getPointMissingDataColumns(viz);
    case PrimitiveFilterType.LINE:
      return getLineMissingDataColumns(viz);
    case PrimitiveFilterType.TEXT:
      return textual(getTextPrimitive(viz)?.labelColumn);
  }
}
