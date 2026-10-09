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
}

// Polygons without data are hatched in grey so that they stay distinct from
// every class color, whatever the palette.
export const DEFAULT_MISSING_DATA_PATTERN_CONFIG: PatternPaletteConfig = {
  shape: 'line',
  angle: 45,
  scale: 0.7,
  color: NEUTRAL_CARTOGRAPHY_COLORS.missingDataHatch
};
