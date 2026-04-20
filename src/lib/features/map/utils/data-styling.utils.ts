import type { VisualizationConfig } from '../../commons/store/visualization.store.svelte';
import {
  getLinePrimitive,
  getPrimitiveCategoryColumn,
  PrimitiveFilterType,
  getPrimitiveClassification,
  getPrimitiveValueColumn,
  getSymbolPrimitive,
  getTextPrimitive,
  getPolygonPrimitive,
  ScaleType,
  VisualizationType
} from '../../commons/store/visualization.store.svelte';
import { ColorMode, FillMode, SymbolMode } from '../../main-toolbar/constants';
import { hexToRgb } from '../../commons/utils/color-utils';

export function getColorForValue(
  value: number,
  breaks: number[],
  colors: string[]
): [number, number, number] {
  if (colors.length === 0) {
    return [128, 128, 128];
  }

  // Most classification flows store only the internal thresholds while the
  // color scale still has one extra class on each side.
  if (colors.length === breaks.length + 1) {
    if (breaks.length === 0) {
      return hexToRgb(colors[0] ?? '#808080');
    }

    const firstBreak = breaks[0];
    if (firstBreak === undefined) {
      return hexToRgb(colors[0] ?? '#808080');
    }

    if (value < firstBreak) {
      return hexToRgb(colors[0] ?? '#808080');
    }

    for (let i = 1; i < breaks.length; i++) {
      const upperBreak = breaks[i];
      const color = colors[i];
      if (upperBreak !== undefined && color && value < upperBreak) {
        return hexToRgb(color);
      }
    }

    return hexToRgb(colors[colors.length - 1] ?? '#808080');
  }

  // Some legacy paths already store lower bounds for each class.
  if (breaks.length === colors.length) {
    for (let i = breaks.length - 1; i >= 0; i--) {
      const lowerBreak = breaks[i];
      const color = colors[Math.min(i, colors.length - 1)];
      if (lowerBreak !== undefined && color && value >= lowerBreak) {
        return hexToRgb(color);
      }
    }

    return hexToRgb(colors[0] ?? '#808080');
  }

  if (breaks.length < 2) {
    return hexToRgb(colors[colors.length - 1] ?? '#808080');
  }

  for (let i = 0; i < breaks.length - 1; i++) {
    const lowerBreak = breaks[i];
    const upperBreak = breaks[i + 1];
    const color = colors[Math.min(i, colors.length - 1)];
    if (
      lowerBreak !== undefined &&
      upperBreak !== undefined &&
      color &&
      value >= lowerBreak &&
      value < upperBreak
    ) {
      return hexToRgb(color);
    }
  }

  return hexToRgb(colors[colors.length - 1] ?? '#808080');
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
  categoryColorMap: Map<string, [number, number, number]> | null | undefined
): boolean {
  if (!categoryColorMap || categoryColorMap.size !== categories.length) {
    return false;
  }

  return categories.every((category) => categoryColorMap.has(category));
}

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
      return (
        getSymbolPrimitive(viz)?.fillMode === FillMode.CLASSES ||
        viz.modes?.fill === FillMode.CLASSES
      );
    case PrimitiveFilterType.POLYGON:
    default:
      return (
        getPolygonPrimitive(viz)?.fillMode === FillMode.CLASSES ||
        viz.modes?.fill === FillMode.CLASSES
      );
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
        symbol?.fillMode === FillMode.CATEGORIES ||
        viz.modes?.fill === FillMode.CATEGORIES
      );
    }
    case PrimitiveFilterType.POLYGON:
    default:
      return (
        getPolygonPrimitive(viz)?.fillMode === FillMode.CATEGORIES ||
        viz.modes?.fill === FillMode.CATEGORIES
      );
  }
}

export function shouldApplyChoropleth(
  viz: VisualizationConfig,
  primitive: PrimitiveFilterType = PrimitiveFilterType.POLYGON
): boolean {
  const classification = getPrimitiveClassification(viz, primitive);
  const valueColumn = getPrimitiveValueColumn(viz, primitive);

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
  const classification = getPrimitiveClassification(viz, primitive);
  const categoryColumn = getPrimitiveCategoryColumn(viz, primitive);

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
