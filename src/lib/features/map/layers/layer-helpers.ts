import type { Color } from '@deck.gl/core';
import type { DeckDataRow, RGBColor } from '../types';
import { getSizeForValue, getColorForValue } from '../utils/data-styling.utils';
import { BasemapDottedPattern } from '$lib/features/main-toolbar/constants';
import { ScaleType } from '$lib/features/commons/store/visualization.store.svelte';

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
