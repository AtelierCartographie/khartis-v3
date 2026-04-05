import type { Color } from '@deck.gl/core';
import type { DeckDataRow, RGBColor } from '../types';
import {
  getClassedSizeForValue,
  getColorForValue,
  getSizeForValue
} from '../utils/data-styling.utils';
import { BasemapDottedPattern } from '$lib/features/main-toolbar/constants';
import { ScaleType } from '$lib/features/commons/store/visualization.store.svelte';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';

export const HIGHLIGHT_FILL_COLOR: RGBColor = [180, 180, 180];

export function withOpacity(color: number[], opacity = 1): Color {
  const normalized = Math.min(Math.max(opacity, 0), 1);
  const alpha = Math.round(normalized * 255);
  return [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, alpha];
}

export function createCategoricalColorAccessor(
  categoryColumn: string,
  colorMap: Map<string, RGBColor> | null
) {
  return (object: DeckDataRow): [number, number, number, number] => {
    const category = object[categoryColumn];
    const rgb = colorMap?.get(String(category)) ?? HIGHLIGHT_FILL_COLOR;
    return [rgb[0], rgb[1], rgb[2], 255];
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
  colors: string[]
) {
  return (object: DeckDataRow): [number, number, number, number] => {
    const rawValue = object[valueColumn];
    if (rawValue === null || rawValue === undefined) {
      return [
        HIGHLIGHT_FILL_COLOR[0],
        HIGHLIGHT_FILL_COLOR[1],
        HIGHLIGHT_FILL_COLOR[2],
        255
      ];
    }
    const numericValue =
      typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      return [
        HIGHLIGHT_FILL_COLOR[0],
        HIGHLIGHT_FILL_COLOR[1],
        HIGHLIGHT_FILL_COLOR[2],
        255
      ];
    }
    const rgb = getColorForValue(numericValue, breaks, colors);
    return [rgb[0], rgb[1], rgb[2], 255];
  };
}

export function createGeoJsonCategoricalColorAccessor(
  categoryColumn: string,
  colorMap: Map<string, RGBColor> | null,
  defaultColor: RGBColor
) {
  return (feature: {
    properties?: Record<string, unknown>;
  }): [number, number, number, number] => {
    const value = feature.properties?.[categoryColumn];
    if (value === null || value === undefined) {
      return [defaultColor[0], defaultColor[1], defaultColor[2], 255];
    }
    const colorVal = colorMap?.get(String(value));
    const rgb = colorVal ?? defaultColor;
    return [rgb[0], rgb[1], rgb[2], 255];
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
  return (feature: { properties?: Record<string, unknown> }) => {
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

export function createGeoJsonClassedSizeAccessor(
  valueColumn: string,
  breaks: number[],
  minSize: number,
  maxSize: number,
  classCountHint?: number,
  defaultSize = 5
) {
  return (feature: { properties?: Record<string, unknown> }) => {
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
  defaultColor: RGBColor
) {
  return (feature: {
    properties?: Record<string, unknown>;
  }): [number, number, number, number] => {
    const value = feature.properties?.[valueColumn];
    if (value === null || value === undefined) {
      return [defaultColor[0], defaultColor[1], defaultColor[2], 255];
    }
    const numValue =
      typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(numValue)) {
      return [defaultColor[0], defaultColor[1], defaultColor[2], 255];
    }
    const rgb = getColorForValue(numValue, breaks, colors);
    return [rgb[0], rgb[1], rgb[2], 255];
  };
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

/**
 * Wraps a static color with per-row highlight dimming for GeoArrow layers.
 * Highlighted rows keep full opacity; non-highlighted rows are dimmed.
 */
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

/**
 * Wraps a per-row color accessor with highlight dimming for GeoArrow layers.
 * Highlighted rows keep full opacity; non-highlighted rows are dimmed.
 */
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
    const [r, g, b] = accessor(row);
    const rowId = row[INTERNAL_COLUMN.ID] as number;
    const alpha = highlightedRowIds.has(rowId) ? fullAlpha : dimAlpha;
    return [r, g, b, alpha];
  };
}

/**
 * Wraps a static color with per-feature highlight dimming for GeoJSON layers.
 * Highlighted features keep full opacity; non-highlighted features are dimmed.
 */
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

/**
 * Wraps a per-feature color accessor with highlight dimming for GeoJSON layers.
 * Highlighted features keep full opacity; non-highlighted features are dimmed.
 */
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
    const [r, g, b] = accessor(feature);
    const rowId = feature.properties?.[INTERNAL_COLUMN.ID] as number;
    const alpha = highlightedRowIds.has(rowId) ? fullAlpha : dimAlpha;
    return [r, g, b, alpha];
  };
}
