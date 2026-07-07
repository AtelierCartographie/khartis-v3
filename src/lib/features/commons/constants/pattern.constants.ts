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
