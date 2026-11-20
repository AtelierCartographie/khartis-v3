import type {
  ContrastMode,
  PatternParams as MotifPatternParams,
  WebGLColor
} from '@ateliercartographie/ok-palette';
import {
  categoricalPatterns,
  resolvePalette,
  sequentialPatterns
} from '@ateliercartographie/ok-palette';

import {
  DIVERGING_PATTERN_DEFAULT_ANGLE,
  DIVERGING_PATTERN_MAX_SIZE,
  DIVERGING_PATTERN_SHAPES,
  type DivergingPatternShape,
  LEGACY_PATTERN_BACKGROUND,
  type PatternPaletteConfig,
  type PatternParams as LegacyPatternParams,
  type PatternShape
} from '../constants/pattern.constants';
import { DEFAULT_DIVERGING_COLORS } from '../constants/colors.constants';
import { webglToHex } from '../utils/color-utils';
import type { DivergingSplit } from './classification.service';

export interface ClassPattern {
  type: string;
  angle: number;
  scale: number;
  size: number;
  fill: string;
  patchSize: boolean;
  /** Color painted under the motif; absent, the polygon stays unpainted. */
  background?: string;
}

const CATEGORICAL_SCALE_RANGE: [number, number] = [1, 2.5];
const DEFAULT_PATTERN_COLOR = '#000000';
const DEFAULT_SEQUENTIAL_ANGLE = 45;
const DEFAULT_SEQUENTIAL_SCALE = 0.7;

function toHexFill(fill: string): string {
  return fill.startsWith('#')
    ? fill
    : webglToHex(resolvePalette([fill], { format: 'webgl' })[0] as WebGLColor);
}

function isDivergingPatternShape(
  shape: PatternShape
): shape is DivergingPatternShape {
  return (DIVERGING_PATTERN_SHAPES as readonly PatternShape[]).includes(shape);
}

/**
 * The shape and angle a diverging ramp is drawn with. A cross is a plus turned
 * by 45°, and a shape that cannot keep the two sides apart falls back to lines.
 */
export function resolveDivergingPatternShape(cfg: PatternPaletteConfig): {
  shape: DivergingPatternShape;
  angle: number;
} {
  if (cfg.shape === 'cross') {
    return { shape: 'plus', angle: (cfg.angle ?? 0) + 45 };
  }
  const shape = isDivergingPatternShape(cfg.shape) ? cfg.shape : 'line';
  return {
    shape,
    angle:
      shape === cfg.shape && cfg.angle != null
        ? cfg.angle
        : DIVERGING_PATTERN_DEFAULT_ANGLE[shape]
  };
}

/**
 * Below the breakpoint each shape is set apart by the widest rotation its
 * symmetry allows (180° / order), or by a second shape for plaid.
 */
function divergingSideShapes(
  shape: DivergingPatternShape,
  angle: number
): {
  lower: [DivergingPatternShape, number];
  upper: [DivergingPatternShape, number];
} {
  switch (shape) {
    case 'line':
      return { lower: ['line', angle + 90], upper: ['line', angle] };
    case 'plaid':
      return { lower: ['plaid', angle], upper: ['line', angle] };
    case 'triangle':
      return { lower: ['triangle', angle + 180], upper: ['triangle', angle] };
    case 'plus':
      return { lower: ['plus', angle + 45], upper: ['plus', angle] };
  }
}

/**
 * One ramp per side, growing away from the breakpoint. The size carries the
 * order and the color only the side, so contrast never changes the colors.
 */
function divergingPatterns(
  split: DivergingSplit,
  cfg: PatternPaletteConfig,
  contrast?: ContrastMode
): MotifPatternParams[] {
  const { shape, angle } = resolveDivergingPatternShape(cfg);
  const sides = divergingSideShapes(shape, angle);
  const [lowerColor, upperColor] =
    cfg.divergingColors ?? DEFAULT_DIVERGING_COLORS;
  const sideRamp = (
    count: number,
    [sideShape, sideAngle]: [DivergingPatternShape, number],
    fill: string
  ) =>
    count > 0
      ? sequentialPatterns(count, {
          shape: sideShape,
          angle: sideAngle,
          scale: cfg.scale ?? DEFAULT_SEQUENTIAL_SCALE,
          sizeRange: [10, DIVERGING_PATTERN_MAX_SIZE[sideShape]],
          contrast,
          fill,
          background: 'transparent',
          patchSize: false
        })
      : [];

  return [
    ...sideRamp(split.lowerCount, sides.lower, lowerColor).reverse(),
    ...sideRamp(split.upperCount, sides.upper, upperColor)
  ];
}

export function resolveClassPatterns(
  count: number,
  cfg: PatternPaletteConfig,
  mode: 'sequential' | 'categorical',
  contrast?: ContrastMode,
  inverted = false,
  divergingSplit?: DivergingSplit
): ClassPattern[] {
  const categoricalScale = cfg.scale ?? 1;
  const isDiverging =
    mode === 'sequential' &&
    divergingSplit !== undefined &&
    divergingSplit.lowerCount + divergingSplit.upperCount === count;
  const patterns = isDiverging
    ? divergingPatterns(divergingSplit, cfg, contrast)
    : mode === 'sequential'
      ? sequentialPatterns(count, {
          shape: cfg.shape,
          angle: cfg.angle ?? DEFAULT_SEQUENTIAL_ANGLE,
          scale: cfg.scale ?? DEFAULT_SEQUENTIAL_SCALE,
          contrast,
          fill: cfg.color ?? DEFAULT_PATTERN_COLOR,
          background: 'transparent',
          patchSize: false
        })
      : categoricalPatterns(count, {
          scaleRange: [
            CATEGORICAL_SCALE_RANGE[0] * categoricalScale,
            CATEGORICAL_SCALE_RANGE[1] * categoricalScale
          ],
          fill: cfg.color ?? DEFAULT_PATTERN_COLOR,
          background: 'transparent',
          colorize: cfg.colorize ?? false,
          patchSize: false
        });

  const resolved = patterns.map((pattern) => ({
    type: pattern.type,
    angle: pattern.angle,
    scale: pattern.scale,
    size: pattern.size,
    fill: toHexFill(pattern.fill),
    patchSize: pattern.patchSize,
    ...(cfg.background ? { background: cfg.background } : {})
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

export function resolveClassificationPatternConfig(
  classification?: {
    pattern?: PatternPaletteConfig;
    patternId?: string;
    patternParams?: LegacyPatternParams;
  } | null
): PatternPaletteConfig | undefined {
  return (
    classification?.pattern ??
    (classification?.patternId
      ? patternPaletteFromLegacy(
          classification.patternId,
          classification.patternParams,
          LEGACY_PATTERN_BACKGROUND
        )
      : undefined)
  );
}

export function patternPaletteFromLegacy(
  patternId: string,
  params?: LegacyPatternParams,
  background?: string
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
      : DEFAULT_SEQUENTIAL_SCALE,
    ...(background ? { background } : {})
  };
}
