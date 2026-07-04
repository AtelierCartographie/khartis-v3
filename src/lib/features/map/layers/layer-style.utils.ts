import { PathStyleExtension } from '@deck.gl/extensions';

import { BasemapDottedPattern } from '$lib/features/commons/constants/visualization.constants';

import type { LayerContext, RGBColor } from '../types';

export const SYMBOL_PATTERN_TYPE = {
  DOTS: 1,
  LINES: 2,
  CROSSHATCH: 3,
  DASHES: 4
} as const;

export const DASH_EXTENSION = new PathStyleExtension({ dash: true });

const DEFAULT_DASH_ARRAY: [number, number] = [3, 2];

/**
 * Page-zoom factor applied to pixel-sized marks (symbol radius, line width,
 * label size) so they scale together with the canvas and the SVG legend.
 *
 * The render `modelMatrix` already scales geometry positions by this same
 * factor (orthographic mode only); marks use `*Units: 'pixels'`, an orthogonal
 * shader path the matrix never touches, so they must be multiplied explicitly.
 * `ctx.pageDisplayScale` is left at 1 in MapLibre interleaved mode (no render
 * matrix), keeping mark size consistent with position handling in both engines.
 */
export function resolvePageDisplayScale(
  ctx: Pick<LayerContext, 'pageDisplayScale'>
): number {
  const scale = ctx.pageDisplayScale;
  return typeof scale === 'number' && Number.isFinite(scale) && scale > 0
    ? scale
    : 1;
}

export function normalizeOpacity(
  opacity: number | undefined,
  fallback = 1
): number {
  if (typeof opacity !== 'number') return fallback;
  const normalized = opacity > 1 ? opacity / 100 : opacity;
  return Math.min(Math.max(normalized, 0), 1);
}

export function resolveThematicStrokeDashArray(
  pattern: BasemapDottedPattern | undefined
): [number, number] {
  switch (pattern) {
    case BasemapDottedPattern.DOTS:
      return [1, 3];
    case BasemapDottedPattern.DASHES:
      return [6, 4];
    case BasemapDottedPattern.DASH_DOT:
      return [2, 2];
    case BasemapDottedPattern.LONG_DASH:
      return [12, 4];
    default:
      return DEFAULT_DASH_ARRAY;
  }
}

export function resolveThematicStrokeCapRounded(
  pattern: BasemapDottedPattern | undefined
): boolean {
  return (
    pattern === BasemapDottedPattern.DOTS ||
    pattern === BasemapDottedPattern.DASH_DOT
  );
}

export interface SymbolDashSpec {
  // Shader (MultiShapeLayer) representation, in stroke-width multiples.
  // `dot` > 0 renders a real round dot (diameter ~= stroke width) after the gap.
  shader: { dash: number; gap: number; dot: number; dotGap: number };
}

export function resolveSymbolDashSpec(
  pattern: BasemapDottedPattern | undefined
): SymbolDashSpec {
  switch (pattern) {
    case BasemapDottedPattern.DOTS:
      return {
        shader: { dash: 0, gap: 0, dot: 1, dotGap: 2.5 }
      };
    case BasemapDottedPattern.DASHES:
      return {
        shader: { dash: 3, gap: 2.5, dot: 0, dotGap: 0 }
      };
    case BasemapDottedPattern.DASH_DOT:
      return {
        shader: { dash: 3, gap: 2.5, dot: 1, dotGap: 2.5 }
      };
    case BasemapDottedPattern.LONG_DASH:
      return {
        shader: { dash: 6, gap: 3, dot: 0, dotGap: 0 }
      };
    default:
      return {
        shader: { dash: 3, gap: 2, dot: 0, dotGap: 0 }
      };
  }
}

export function isMissingLineNumericValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') {
    return true;
  }
  const numericValue = typeof value === 'number' ? value : Number(value);
  return !Number.isFinite(numericValue);
}

export function isMissingLineCategoryValue(
  value: unknown,
  colorMap: Map<string, RGBColor> | null
): boolean {
  if (value === null || value === undefined || value === '') {
    return true;
  }
  return !colorMap?.has(String(value));
}
