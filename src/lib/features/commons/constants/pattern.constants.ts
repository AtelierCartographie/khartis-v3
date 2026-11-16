import type { ContrastMode } from '@ateliercartographie/ok-palette';
import { NEUTRAL_CARTOGRAPHY_COLORS } from './colors.constants';

export enum PatternType {
  DOTS = 'dots',
  LINES = 'lines',
  CROSSHATCH = 'crosshatch',
  DASHES = 'dashes'
}

export interface PatternParams {
  angle?: 0 | 45 | 315;
  size?: number;
  scale?: number;
}

export const PATTERN_OVERLAY_OPACITY = 0.6;

export const PATTERN_SHAPES = [
  'line',
  'circle',
  'plaid',
  'triangle',
  'square',
  'diamond',
  'plus',
  'cross'
] as const;

export type PatternShape = (typeof PATTERN_SHAPES)[number];

export interface PatternPaletteConfig {
  shape: PatternShape;
  angle?: number;
  scale?: number;
  color?: string;
  colorize?: boolean;
  categoryShapes?: (PatternShape | undefined)[];
  contrast?: ContrastMode;
  /** Color painted under the motif; absent, the polygon is left unpainted. */
  background?: string;
  /**
   * Motif colors below and above the breakpoint of a diverging classification.
   * Absent, the default diverging hues apply.
   */
  divergingColors?: [string, string];
}

/**
 * Shapes offered with a diverging classification. Each one keeps the two sides
 * apart whatever the user's angle: lines at α + 90° / α, plaid / line,
 * triangles at α + 180° / α, plus at α + 45° (a cross) / α.
 */
export const DIVERGING_PATTERN_SHAPES = [
  'line',
  'plaid',
  'triangle',
  'plus'
] as const satisfies readonly PatternShape[];

export type DivergingPatternShape = (typeof DIVERGING_PATTERN_SHAPES)[number];

export const DIVERGING_PATTERN_DEFAULT_ANGLE: Record<
  DivergingPatternShape,
  number
> = {
  line: 45,
  plaid: 45,
  triangle: 0,
  plus: 0
};

/**
 * Highest motif size (percent of the tile) on a diverging ramp. Past it a
 * triangle or a plus touches its neighbours, so the painted share of the tile
 * no longer equals the size and the ramp loses its order. Lines and plaid
 * never overlap.
 */
export const DIVERGING_PATTERN_MAX_SIZE: Record<DivergingPatternShape, number> =
  {
    line: 90,
    plaid: 90,
    triangle: 43,
    plus: 43
  };

// Before schema 3.17.0 a pattern fill was always painted over white.
export const LEGACY_PATTERN_BACKGROUND = '#ffffff';

// Polygons without data are hatched in grey so that they stay distinct from
// every class color, whatever the palette.
export const DEFAULT_MISSING_DATA_PATTERN_CONFIG: PatternPaletteConfig = {
  shape: 'line',
  angle: 45,
  scale: 0.7,
  color: NEUTRAL_CARTOGRAPHY_COLORS.missingDataHatch,
  background: NEUTRAL_CARTOGRAPHY_COLORS.missingData
};
