import {
  categoricalPatterns,
  resolvePalette,
  sequentialPatterns
} from '@ateliercartographie/ok-palette';
import type { ContrastMode, WebGLColor } from '@ateliercartographie/ok-palette';

import type {
  PatternParams as LegacyPatternParams,
  PatternPaletteConfig,
  PatternShape
} from '../constants/pattern.constants';
import { webglToHex } from '../utils/color-utils';

export interface ClassPattern {
  type: string;
  angle: number;
  scale: number;
  size: number;
  fill: string;
}

const CATEGORICAL_SCALE_RANGE: [number, number] = [1, 2.5];
const DEFAULT_PATTERN_COLOR = '#000000';
const DEFAULT_SEQUENTIAL_ANGLE = 45;
const DEFAULT_SEQUENTIAL_SCALE = 1;

function toHexFill(fill: string): string {
  return fill.startsWith('#')
    ? fill
    : webglToHex(resolvePalette([fill], { format: 'webgl' })[0] as WebGLColor);
}

export function resolveClassPatterns(
  count: number,
  cfg: PatternPaletteConfig,
  mode: 'sequential' | 'categorical',
  contrast?: ContrastMode,
  inverted = false
): ClassPattern[] {
  const patterns =
    mode === 'sequential'
      ? sequentialPatterns(count, {
          shape: cfg.shape,
          angle: cfg.angle ?? DEFAULT_SEQUENTIAL_ANGLE,
          scale: cfg.scale ?? DEFAULT_SEQUENTIAL_SCALE,
          contrast,
          fill: cfg.color ?? DEFAULT_PATTERN_COLOR,
          background: 'transparent'
        })
      : categoricalPatterns(count, {
          scaleRange: CATEGORICAL_SCALE_RANGE,
          fill: cfg.color ?? DEFAULT_PATTERN_COLOR,
          background: 'transparent',
          colorize: cfg.colorize ?? false
        });

  const resolved = patterns.map((pattern) => ({
    type: pattern.type,
    angle: pattern.angle,
    scale: pattern.scale,
    size: pattern.size,
    fill: toHexFill(pattern.fill)
  }));

  const reordered = inverted ? resolved.reverse() : resolved;

  if (mode === 'categorical' && cfg.categoryShapes) {
    return reordered.map((pattern, i) =>
      cfg.categoryShapes?.[i]
        ? { ...pattern, type: cfg.categoryShapes[i] }
        : pattern
    );
  }

  return reordered;
}

const LEGACY_SHAPE_BY_PATTERN_ID: Record<
  string,
  { shape: PatternShape; angle?: number }
> = {
  diagonal: { shape: 'line', angle: 45 },
  'diagonal-reverse': { shape: 'line', angle: 135 },
  horizontal: { shape: 'line', angle: 0 },
  vertical: { shape: 'line', angle: 90 },
  dots: { shape: 'circle' },
  cross: { shape: 'plaid' },
  triangle: { shape: 'triangle' },
  square: { shape: 'square' },
  diamond: { shape: 'diamond' },
  plus: { shape: 'plus' }
};

export function patternPaletteFromLegacy(
  patternId: string,
  params?: LegacyPatternParams
): PatternPaletteConfig | undefined {
  const legacyShape = LEGACY_SHAPE_BY_PATTERN_ID[patternId];
  if (!legacyShape) {
    return undefined;
  }

  return {
    shape: legacyShape.shape,
    angle: params?.angle ?? legacyShape.angle ?? DEFAULT_SEQUENTIAL_ANGLE,
    scale: params?.scale
      ? Math.max(0.1, params.scale / 10)
      : DEFAULT_SEQUENTIAL_SCALE
  };
}
