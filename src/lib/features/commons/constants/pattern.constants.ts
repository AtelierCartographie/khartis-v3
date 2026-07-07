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
}
