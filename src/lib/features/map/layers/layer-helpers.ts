import type { Color } from '@deck.gl/core';
import type { DeckDataRow, RGBColor } from '../types';
import {
  getClassedSizeForValue,
  getColorForValue,
  getAbsoluteDomainMax,
  getProportionalSymbolSizeForValue,
  getSizeForValue
} from '../utils/data-styling.utils';
import { BasemapDottedPattern } from '$lib/features/commons/constants/visualization.constants';
import { ScaleType } from '$lib/features/commons/stores/visualization.store.svelte';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';

export const HIGHLIGHT_FILL_COLOR: RGBColor = [180, 180, 180];

export function resolveMissingDataRenderProps(
  viz: { missingData?: { show?: boolean; color?: string } } | undefined | null,
  fallbackColor: RGBColor = HIGHLIGHT_FILL_COLOR
): { color: RGBColor; show: boolean } {
  const show = viz?.missingData?.show ?? true;
  const rawColor = viz?.missingData?.color;
  if (!rawColor) return { color: fallbackColor, show };

  const clean = rawColor.replace('#', '');
  const bigint = parseInt(clean, 16);
  if (Number.isNaN(bigint)) return { color: fallbackColor, show };
  return {
    color: [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255],
    show
  };
}

export function withOpacity(color: number[], opacity = 1): Color {
  const normalized = Math.min(Math.max(opacity, 0), 1);
  const alpha = Math.round(normalized * 255);
  return [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, alpha];
}

export function withOpacityPreservingAlpha(
  color: number[],
  opacity = 1
): Color {
  const normalized = Math.min(Math.max(opacity, 0), 1);
  const sourceAlpha = color[3] ?? 255;
  const alpha = Math.round(normalized * sourceAlpha);
  return [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, alpha];
}

export function sortBySizeDescending<T>(
  items: readonly T[],
  sizeFn: (item: T) => number
): T[] {
  return items
    .map((item, index) => ({ item, size: sizeFn(item), index }))
    .sort((a, b) => {
      if (b.size !== a.size) return b.size - a.size;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

export function createCategoricalColorAccessor(
  categoryColumn: string,
  colorMap: Map<string, RGBColor> | null,
  missingColor: RGBColor = HIGHLIGHT_FILL_COLOR,
  showMissing = true,
  disabledLabels: string[] = []
) {
  const missingAlpha = showMissing ? 255 : 0;
  const hiddenTuple: [number, number, number, number] = [0, 0, 0, 0];
  const disabled = new Set(disabledLabels.map(String));
  return (object: DeckDataRow): [number, number, number, number] => {
    const category = object[categoryColumn];
    if (disabled.has(String(category))) {
      return hiddenTuple;
    }
    const mapped = colorMap?.get(String(category));
    if (mapped) return [mapped[0], mapped[1], mapped[2], 255];
    return [missingColor[0], missingColor[1], missingColor[2], missingAlpha];
  };
}

export function createProportionalSizeAccessor(
  sizeColumn: string,
  minValue: number,
  maxValue: number,
  minSize: number,
  maxSize: number,
  sizeScale: ScaleType
) {
  return (object: DeckDataRow): number => {
    const rawValue = object[sizeColumn];
    const numericValue =
      typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      return minSize;
    }
    return getSizeForValue(
      numericValue,
      minValue,
      maxValue,
      minSize,
      maxSize,
      sizeScale
    );
  };
}

export function createProportionalSymbolSizeAccessor(
  sizeColumn: string,
  maxValue: number,
  maxSize: number,
  sizeScale: ScaleType,
  minValue = 0
) {
  const domainMax = getAbsoluteDomainMax(minValue, maxValue);

  return (object: DeckDataRow): number => {
    const rawValue = object[sizeColumn];
    const numericValue =
      typeof rawValue === 'number' ? rawValue : Number(rawValue);
    return getProportionalSymbolSizeForValue(
      numericValue,
      domainMax,
      maxSize,
      sizeScale
    );
  };
}

export function createClassedSizeAccessor(
  valueColumn: string,
  breaks: number[],
  minSize: number,
  maxSize: number,
  classCountHint?: number
) {
  return (object: DeckDataRow): number => {
    const rawValue = object[valueColumn];
    const numericValue =
      typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      return minSize;
    }

    return getClassedSizeForValue(
      numericValue,
      breaks,
      minSize,
      maxSize,
      classCountHint
    );
  };
}

export function createChoroplethColorAccessor(
  valueColumn: string,
  breaks: number[],
  colors: string[],
  missingColor: RGBColor = HIGHLIGHT_FILL_COLOR,
  showMissing = true
) {
  const missingAlpha = showMissing ? 255 : 0;
  const missingTuple: [number, number, number, number] = [
    missingColor[0],
    missingColor[1],
    missingColor[2],
    missingAlpha
  ];
  return (object: DeckDataRow): [number, number, number, number] => {
    const rawValue = object[valueColumn];
    if (rawValue === null || rawValue === undefined) return missingTuple;
    const numericValue =
      typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(numericValue)) return missingTuple;
    const rgb = getColorForValue(numericValue, breaks, colors);
    return [rgb[0], rgb[1], rgb[2], 255];
  };
}

interface StrokeClassificationAccessorOptions {
  strokeMode: 'classes' | 'categories' | string;
  strokeClassification?: {
    colors?: string[];
    breaks?: number[];
    labels?: string[];
    disabledLabels?: string[];
  } | null;
  valueColumn?: string | null;
  categoryColumn?: string | null;
  fallbackLabels?: string[];
  fallbackBreaks?: number[];
  missingColor: RGBColor;
  showMissing: boolean;
  hexToRgb: (hex: string) => RGBColor;
}

export function createStrokeClassificationAccessor(
  options: StrokeClassificationAccessorOptions
): ((row: DeckDataRow) => [number, number, number, number]) | null {
  const {
    strokeMode,
    strokeClassification,
    valueColumn,
    categoryColumn,
    fallbackLabels,
    fallbackBreaks,
    missingColor,
    showMissing,
    hexToRgb
  } = options;
  const colors = strokeClassification?.colors;
  if (!colors || colors.length === 0) return null;

  if (strokeMode === 'classes' && valueColumn) {
    const breaks = strokeClassification?.breaks ?? fallbackBreaks;
    if (!breaks || breaks.length < 2) return null;
    return createChoroplethColorAccessor(
      valueColumn,
      breaks,
      colors,
      missingColor,
      showMissing
    );
  }

  if (strokeMode === 'categories' && categoryColumn) {
    const labels = strokeClassification?.labels ?? fallbackLabels ?? [];
    if (labels.length === 0) return null;
    const colorMap = new Map<string, RGBColor>();
    labels.forEach((label, i) => {
      const hex = colors[i] ?? colors[colors.length - 1]!;
      colorMap.set(String(label), hexToRgb(hex));
    });
    return createCategoricalColorAccessor(
      categoryColumn,
      colorMap,
      missingColor,
      showMissing,
      strokeClassification?.disabledLabels ?? []
    );
  }

  return null;
}

export function createGeoJsonCategoricalColorAccessor(
  categoryColumn: string,
  colorMap: Map<string, RGBColor> | null,
  defaultColor: RGBColor,
  missingColor: RGBColor = defaultColor,
  showMissing = true,
  disabledLabels: string[] = []
) {
  const missingAlpha = showMissing ? 255 : 0;
  const hiddenTuple: [number, number, number, number] = [0, 0, 0, 0];
  const disabled = new Set(disabledLabels.map(String));
  return (feature: {
    properties?: Record<string, unknown> | null;
  }): [number, number, number, number] => {
    const value = feature.properties?.[categoryColumn];
    if (disabled.has(String(value))) {
      return hiddenTuple;
    }
    if (value === null || value === undefined) {
      return [missingColor[0], missingColor[1], missingColor[2], missingAlpha];
    }
    const colorVal = colorMap?.get(String(value));
    if (colorVal) return [colorVal[0], colorVal[1], colorVal[2], 255];
    return [missingColor[0], missingColor[1], missingColor[2], missingAlpha];
  };
}

export function createGeoJsonProportionalSizeAccessor(
  sizeColumn: string,
  minValue: number,
  maxValue: number,
  minSize: number,
  maxSize: number,
  sizeScale: ScaleType,
  defaultSize = 5
) {
  return (feature: { properties?: Record<string, unknown> | null }) => {
    const value = feature.properties?.[sizeColumn];
    if (value === null || value === undefined) return defaultSize;
    const numValue =
      typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(numValue)) return defaultSize;
    return getSizeForValue(
      numValue,
      minValue,
      maxValue,
      minSize,
      maxSize,
      sizeScale
    );
  };
}

export function createGeoJsonProportionalSymbolSizeAccessor(
  sizeColumn: string,
  maxValue: number,
  maxSize: number,
  sizeScale: ScaleType,
  minValue = 0
) {
  const domainMax = getAbsoluteDomainMax(minValue, maxValue);

  return (feature: { properties?: Record<string, unknown> | null }) => {
    const value = feature.properties?.[sizeColumn];
    const numericValue =
      typeof value === 'number' ? value : parseFloat(String(value));
    return getProportionalSymbolSizeForValue(
      numericValue,
      domainMax,
      maxSize,
      sizeScale
    );
  };
}

export function createGeoJsonClassedSizeAccessor(
  valueColumn: string,
  breaks: number[],
  minSize: number,
  maxSize: number,
  classCountHint?: number,
  defaultSize = 5
) {
  return (feature: { properties?: Record<string, unknown> | null }) => {
    const value = feature.properties?.[valueColumn];
    if (value === null || value === undefined) return defaultSize;
    const numericValue =
      typeof value === 'number' ? value : parseFloat(String(value));
    if (!Number.isFinite(numericValue)) return defaultSize;

    return getClassedSizeForValue(
      numericValue,
      breaks,
      minSize,
      maxSize,
      classCountHint
    );
  };
}

export function createGeoJsonChoroplethColorAccessor(
  valueColumn: string,
  breaks: number[],
  colors: string[],
  defaultColor: RGBColor,
  missingColor: RGBColor = defaultColor,
  showMissing = true
) {
  const missingAlpha = showMissing ? 255 : 0;
  const missingTuple: [number, number, number, number] = [
    missingColor[0],
    missingColor[1],
    missingColor[2],
    missingAlpha
  ];
  return (feature: {
    properties?: Record<string, unknown>;
  }): [number, number, number, number] => {
    const value = feature.properties?.[valueColumn];
    if (value === null || value === undefined) return missingTuple;
    const numValue =
      typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(numValue)) return missingTuple;
    const rgb = getColorForValue(numValue, breaks, colors);
    return [rgb[0], rgb[1], rgb[2], 255];
  };
}

export function dashArrayToDottedPattern(
  dashArray: [number, number]
): BasemapDottedPattern {
  const [dash] = dashArray;
  if (dash < 4) return BasemapDottedPattern.DOTS;
  if (dash >= 12) return BasemapDottedPattern.LONG_DASH;
  return BasemapDottedPattern.DASHES;
}

export function dottedPatternToDashArray(
  pattern: BasemapDottedPattern
): [number, number] {
  switch (pattern) {
    case BasemapDottedPattern.DOTS:
      return [2, 4];
    case BasemapDottedPattern.DASHES:
      return [8, 4];
    case BasemapDottedPattern.DASH_DOT:
      return [8, 2];
    case BasemapDottedPattern.LONG_DASH:
      return [16, 4];
    default:
      return [2, 4];
  }
}

export function withRowHighlight(
  color: RGBColor | Color,
  opacity: number,
  dimmingFactor: number,
  highlightedRowIds: Set<number>
): (row: DeckDataRow) => [number, number, number, number] {
  const fullAlpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255);
  const dimAlpha = Math.round(
    Math.min(Math.max(opacity * dimmingFactor, 0), 1) * 255
  );
  const r = (color as number[])[0] ?? 0;
  const g = (color as number[])[1] ?? 0;
  const b = (color as number[])[2] ?? 0;
  return (row: DeckDataRow): [number, number, number, number] => {
    const rowId = row[INTERNAL_COLUMN.ID] as number;
    const alpha = highlightedRowIds.has(rowId) ? fullAlpha : dimAlpha;
    return [r, g, b, alpha];
  };
}

export function withRowHighlightAccessor(
  accessor: (row: DeckDataRow) => [number, number, number, number],
  opacity: number,
  dimmingFactor: number,
  highlightedRowIds: Set<number>
): (row: DeckDataRow) => [number, number, number, number] {
  const fullAlpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255);
  const dimAlpha = Math.round(
    Math.min(Math.max(opacity * dimmingFactor, 0), 1) * 255
  );
  return (row: DeckDataRow): [number, number, number, number] => {
    const [r, g, b, sourceAlpha = 255] = accessor(row);
    const rowId = row[INTERNAL_COLUMN.ID] as number;
    const targetAlpha = highlightedRowIds.has(rowId) ? fullAlpha : dimAlpha;
    const alpha = Math.round(targetAlpha * (sourceAlpha / 255));
    return [r, g, b, alpha];
  };
}

export function withGeoJsonRowHighlight(
  color: RGBColor | Color,
  opacity: number,
  dimmingFactor: number,
  highlightedRowIds: Set<number>
): (feature: {
  properties?: Record<string, unknown>;
}) => [number, number, number, number] {
  const fullAlpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255);
  const dimAlpha = Math.round(
    Math.min(Math.max(opacity * dimmingFactor, 0), 1) * 255
  );
  const r = (color as number[])[0] ?? 0;
  const g = (color as number[])[1] ?? 0;
  const b = (color as number[])[2] ?? 0;
  return (feature: {
    properties?: Record<string, unknown>;
  }): [number, number, number, number] => {
    const rowId = feature.properties?.[INTERNAL_COLUMN.ID] as number;
    const alpha = highlightedRowIds.has(rowId) ? fullAlpha : dimAlpha;
    return [r, g, b, alpha];
  };
}

export function withGeoJsonRowHighlightAccessor(
  accessor: (feature: {
    properties?: Record<string, unknown>;
  }) => [number, number, number, number],
  opacity: number,
  dimmingFactor: number,
  highlightedRowIds: Set<number>
): (feature: {
  properties?: Record<string, unknown>;
}) => [number, number, number, number] {
  const fullAlpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255);
  const dimAlpha = Math.round(
    Math.min(Math.max(opacity * dimmingFactor, 0), 1) * 255
  );
  return (feature: {
    properties?: Record<string, unknown>;
  }): [number, number, number, number] => {
    const [r, g, b, sourceAlpha = 255] = accessor(feature);
    const rowId = feature.properties?.[INTERNAL_COLUMN.ID] as number;
    const targetAlpha = highlightedRowIds.has(rowId) ? fullAlpha : dimAlpha;
    const alpha = Math.round(targetAlpha * (sourceAlpha / 255));
    return [r, g, b, alpha];
  };
}
