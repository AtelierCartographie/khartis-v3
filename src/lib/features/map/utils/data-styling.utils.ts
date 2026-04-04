import type { VisualizationConfig } from '../../commons/store/visualization.store.svelte';
import {
  VisualizationType,
  ScaleType
} from '../../commons/store/visualization.store.svelte';
import { FillMode, SymbolMode } from '../../main-toolbar/constants';
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

  const normalized = (value - min) / (max - min);

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

export function shouldApplyChoropleth(viz: VisualizationConfig): boolean {
  return (
    viz.modes?.fill === FillMode.CLASSES &&
    !!viz.mapping.valueColumn &&
    !!viz.classification?.breaks &&
    !!viz.classification?.colors &&
    viz.classification.breaks.length >= 2
  );
}

export function shouldApplyProportionalSymbols(
  viz: VisualizationConfig
): boolean {
  const symbolMode = viz.modes?.symbol;
  const isSymbolSizingMode =
    symbolMode !== undefined
      ? symbolMode === SymbolMode.PROPORTIONAL ||
        symbolMode === SymbolMode.CLASSES
      : viz.type === VisualizationType.PROPORTIONAL ||
        viz.type === VisualizationType.BIVARIATE;

  return isSymbolSizingMode && !!viz.mapping.sizeColumn && !!viz.symbols;
}

export function shouldApplyCategorical(viz: VisualizationConfig): boolean {
  return (
    viz.modes?.fill === FillMode.CATEGORIES &&
    !!viz.mapping.categoryColumn &&
    !!viz.classification?.colors &&
    viz.classification.colors.length > 0
  );
}
