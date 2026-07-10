import type { VisualizationConfig } from '../../commons/stores/visualization.store.svelte';
import {
  getLinePrimitive,
  getPrimitiveCategoryColumn,
  PrimitiveFilterType,
  getPrimitiveClassification,
  getPrimitiveValueColumn,
  getSymbolFillCategoryColumn,
  getSymbolFillClassification,
  getSymbolFillValueColumn,
  getSymbolPrimitive,
  getTextPrimitive,
  getPolygonPrimitive,
  ScaleType,
  VisualizationType
} from '../../commons/stores/visualization.store.svelte';
import {
  ColorMode,
  FillMode,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';
import { hexToRgb } from '../../commons/utils/color-utils';

const MISSING_CLASS_COLOR = '#808080';

export function getClassIndexForValue(
  value: number,
  breaks: readonly number[] | undefined,
  classCount: number
): number | null {
  if (!breaks?.length || classCount <= 0) {
    return null;
  }

  if (classCount === breaks.length + 1) {
    const firstBreak = breaks[0];
    if (firstBreak === undefined) {
      return 0;
    }

    if (value < firstBreak) {
      return 0;
    }

    for (let i = 1; i < breaks.length; i++) {
      const upperBreak = breaks[i];
      if (upperBreak !== undefined && value < upperBreak) {
        return i;
      }
    }

    return classCount - 1;
  }

  if (breaks.length === classCount) {
    for (let i = breaks.length - 1; i >= 0; i--) {
      const lowerBreak = breaks[i];
      if (lowerBreak !== undefined && value >= lowerBreak) {
        return Math.min(i, classCount - 1);
      }
    }

    return 0;
  }

  if (breaks.length < 2) {
    return classCount - 1;
  }

  for (let i = 0; i < breaks.length - 1; i++) {
    const lowerBreak = breaks[i];
    const upperBreak = breaks[i + 1];
    if (
      lowerBreak !== undefined &&
      upperBreak !== undefined &&
      value >= lowerBreak &&
      value < upperBreak
    ) {
      return Math.min(i, classCount - 1);
    }
  }

  return classCount - 1;
}

export function getColorForValue(
  value: number,
  breaks: readonly number[] | undefined,
  colors: readonly string[] | undefined
): [number, number, number] {
  if (!breaks?.length || !colors?.length) {
    return hexToRgb(MISSING_CLASS_COLOR);
  }

  const index = getClassIndexForValue(value, breaks, colors.length);
  if (index === null) {
    return hexToRgb(MISSING_CLASS_COLOR);
  }

  return hexToRgb(colors[index] ?? MISSING_CLASS_COLOR);
}

export function getSizeForValue(
  value: number,
  min: number,
  max: number,
  minSize: number,
  maxSize: number,
  scale: ScaleType = ScaleType.LINEAR
): number {
  if (max === min) return (minSize + maxSize) / 2;

  const normalized = Math.min(1, Math.max(0, (value - min) / (max - min)));

  switch (scale) {
    case ScaleType.SQRT:
      return minSize + Math.sqrt(normalized) * (maxSize - minSize);

    case ScaleType.LOG:
      return (
        minSize + (Math.log1p(normalized) / Math.log1p(1)) * (maxSize - minSize)
      );

    default:
      return minSize + normalized * (maxSize - minSize);
  }
}

export function getProportionalSymbolSizeForValue(
  value: number,
  max: number,
  maxSize: number,
  scale: ScaleType = ScaleType.SQRT
): number {
  const magnitude = Math.abs(value);
  const domainMax = Math.abs(max);

  if (
    !Number.isFinite(magnitude) ||
    !Number.isFinite(domainMax) ||
    !Number.isFinite(maxSize) ||
    magnitude <= 0 ||
    domainMax <= 0 ||
    maxSize <= 0
  ) {
    return 0;
  }

  const normalized = Math.min(1, Math.max(0, magnitude / domainMax));

  switch (scale) {
    case ScaleType.LINEAR:
      return normalized * maxSize;

    case ScaleType.LOG:
      return (Math.log1p(normalized) / Math.log1p(1)) * maxSize;

    case ScaleType.SQRT:
    default:
      return Math.sqrt(normalized) * maxSize;
  }
}

export function getAbsoluteDomainMax(min: number, max: number): number {
  const values = [min, max].filter(Number.isFinite).map(Math.abs);
  return values.length > 0 ? Math.max(...values) : Number.NaN;
}

export function getClassedSizeForValue(
  value: number,
  breaks: number[],
  minSize: number,
  maxSize: number,
  classCountHint?: number
): number {
  if (!Number.isFinite(value) || breaks.length < 2) {
    return minSize;
  }

  if (classCountHint === breaks.length + 1) {
    const firstBreak = breaks[0];
    if (firstBreak === undefined) {
      return minSize;
    }

    let classIndex = 0;
    if (value >= firstBreak) {
      classIndex = breaks.length;
      for (let i = 1; i < breaks.length; i++) {
        const upperBreak = breaks[i];
        if (upperBreak !== undefined && value < upperBreak) {
          classIndex = i;
          break;
        }
      }
    }

    if (classCountHint === 1) {
      return maxSize;
    }

    const step = (maxSize - minSize) / Math.max(1, classCountHint - 1);
    return minSize + classIndex * step;
  }

  const classCount = breaks.length - 1;
  const classIndex = breaks.findIndex((breakValue, index) => {
    if (index >= classCount) return false;
    const upperBound = breaks[index + 1] ?? breakValue;
    const isLastClass = index === classCount - 1;
    return (
      value >= breakValue &&
      (isLastClass ? value <= upperBound : value < upperBound)
    );
  });

  const firstBreak = breaks[0];
  const resolvedIndex =
    classIndex >= 0
      ? classIndex
      : firstBreak !== undefined && value < firstBreak
        ? 0
        : classCount - 1;

  if (classCount === 1) {
    return maxSize;
  }

  const step = (maxSize - minSize) / Math.max(1, classCount - 1);
  return minSize + resolvedIndex * step;
}

export function getCategoricalColorMap(
  categories: string[],
  colors: string[]
): Map<string, [number, number, number]> {
  const colorMap = new Map<string, [number, number, number]>();

  categories.forEach((cat, i) => {
    const colorIndex = i % colors.length;
    colorMap.set(cat, hexToRgb(colors[colorIndex]));
  });

  return colorMap;
}

export function hasCompleteCategoricalColorMap(
  categories: string[],
  categoryColorMap: Map<string, [number, number, number]> | null | undefined,
  colors?: string[]
): boolean {
  if (!categoryColorMap || categoryColorMap.size !== categories.length) {
    return false;
  }

  return categories.every((category, index) => {
    const currentColor = categoryColorMap.get(category);
    if (!currentColor) {
      return false;
    }

    if (!colors?.length) {
      return true;
    }

    const expectedColor = hexToRgb(colors[index % colors.length]);
    return currentColor.every(
      (channel, channelIndex) => channel === expectedColor[channelIndex]
    );
  });
}

// Polygon and point fills are resolved per primitive: getPolygonPrimitive /
// getSymbolPrimitive already fall back to the legacy global `viz.modes.fill`, so
// reading `viz.modes` again for them would re-activate a stale global mode after
// a primitive switched fill mode — letting classes and categories both apply and
// the choropleth silently override the categorical fill. Lines and text keep
// their legacy color/fill fallbacks (older projects drove them via the globals).
function usesClassedColor(
  viz: VisualizationConfig,
  primitive: PrimitiveFilterType
): boolean {
  switch (primitive) {
    case PrimitiveFilterType.LINE:
      return (
        getLinePrimitive(viz)?.colorMode === ColorMode.CLASSES ||
        viz.modes?.color === ColorMode.CLASSES ||
        viz.modes?.fill === FillMode.CLASSES
      );
    case PrimitiveFilterType.TEXT:
      return (
        getTextPrimitive(viz)?.colorMode === ColorMode.CLASSES ||
        viz.modes?.color === ColorMode.CLASSES
      );
    case PrimitiveFilterType.POINT:
      return getSymbolPrimitive(viz)?.fillMode === FillMode.CLASSES;
    case PrimitiveFilterType.POLYGON:
    default:
      return getPolygonPrimitive(viz)?.fillMode === FillMode.CLASSES;
  }
}

function usesCategoricalColor(
  viz: VisualizationConfig,
  primitive: PrimitiveFilterType
): boolean {
  switch (primitive) {
    case PrimitiveFilterType.LINE:
      return (
        getLinePrimitive(viz)?.colorMode === ColorMode.CATEGORIES ||
        viz.modes?.color === ColorMode.CATEGORIES ||
        viz.modes?.fill === FillMode.CATEGORIES
      );
    case PrimitiveFilterType.TEXT:
      return (
        getTextPrimitive(viz)?.colorMode === ColorMode.CATEGORIES ||
        viz.modes?.color === ColorMode.CATEGORIES
      );
    case PrimitiveFilterType.POINT: {
      const symbol = getSymbolPrimitive(viz);
      return (
        symbol?.mode === SymbolMode.CATEGORIES ||
        symbol?.fillMode === FillMode.CATEGORIES
      );
    }
    case PrimitiveFilterType.POLYGON:
    default:
      return getPolygonPrimitive(viz)?.fillMode === FillMode.CATEGORIES;
  }
}

export function shouldApplyChoropleth(
  viz: VisualizationConfig,
  primitive: PrimitiveFilterType = PrimitiveFilterType.POLYGON
): boolean {
  const classification =
    primitive === PrimitiveFilterType.POINT
      ? getSymbolFillClassification(viz)
      : getPrimitiveClassification(viz, primitive);
  const valueColumn =
    primitive === PrimitiveFilterType.POINT
      ? getSymbolFillValueColumn(viz)
      : getPrimitiveValueColumn(viz, primitive);

  return (
    usesClassedColor(viz, primitive) &&
    !!valueColumn &&
    !!classification?.breaks &&
    !!classification?.colors &&
    classification.breaks.length >= 2
  );
}

export function resolveChoroplethColorColumn(
  viz: VisualizationConfig
): string | undefined {
  return viz.mapping.colorColumn ?? viz.mapping.valueColumn;
}

export function shouldApplyProportionalSymbols(
  viz: VisualizationConfig
): boolean {
  const symbol = getSymbolPrimitive(viz);
  const symbolMode = symbol?.mode;
  const isSymbolSizingMode =
    symbolMode !== undefined
      ? symbolMode === SymbolMode.PROPORTIONAL ||
        symbolMode === SymbolMode.CLASSES
      : viz.type === VisualizationType.PROPORTIONAL ||
        viz.type === VisualizationType.BIVARIATE;

  return isSymbolSizingMode && !!symbol?.sizeColumn && !!symbol;
}

export function shouldApplyCategorical(
  viz: VisualizationConfig,
  primitive: PrimitiveFilterType = PrimitiveFilterType.POLYGON
): boolean {
  const pointSymbol =
    primitive === PrimitiveFilterType.POINT
      ? getSymbolPrimitive(viz)
      : undefined;
  const classification =
    primitive === PrimitiveFilterType.POINT
      ? pointSymbol?.mode === SymbolMode.CATEGORIES
        ? getPrimitiveClassification(viz, primitive)
        : getSymbolFillClassification(viz)
      : getPrimitiveClassification(viz, primitive);
  const categoryColumn =
    primitive === PrimitiveFilterType.POINT
      ? pointSymbol?.mode === SymbolMode.CATEGORIES
        ? getPrimitiveCategoryColumn(viz, primitive)
        : getSymbolFillCategoryColumn(viz)
      : getPrimitiveCategoryColumn(viz, primitive);

  return (
    usesCategoricalColor(viz, primitive) &&
    !!categoryColumn &&
    !!classification?.colors &&
    classification.colors.length > 0
  );
}

export function shouldApplyLineCategorical(viz: VisualizationConfig): boolean {
  return shouldApplyCategorical(viz, PrimitiveFilterType.LINE);
}

export function shouldApplyLineChoropleth(viz: VisualizationConfig): boolean {
  return shouldApplyChoropleth(viz, PrimitiveFilterType.LINE);
}

export function shouldHideSymbolFill(
  viz: VisualizationConfig | null | undefined
): boolean {
  if (!viz) return false;
  const symbol = getSymbolPrimitive(viz);
  return symbol?.fillMode === FillMode.NONE;
}
