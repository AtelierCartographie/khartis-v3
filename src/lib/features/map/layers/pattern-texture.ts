/**
 * Pattern texture atlas powered by motif.js + ok-palette.
 * Generates sprite sheets for Deck.gl FillStyleExtension / RotatableFillStyleExtension.
 *
 * Static atlas: 5 predefined patterns (backward compat).
 * Dynamic atlas: generated from ok-palette's categoricalPatterns() / sequentialPatterns().
 */

import { motifAtlas } from '@ateliercartographie/motif.js';
import type {
  PatternOptions,
  AtlasResult
} from '@ateliercartographie/motif.js';
import {
  categoricalPatterns,
  sequentialPatterns
} from '@ateliercartographie/ok-palette';
import type { PatternParams as OkPatternParams } from '@ateliercartographie/ok-palette';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

const PATTERN_NAMES = [
  'diagonal',
  'diagonal-reverse',
  'horizontal',
  'vertical',
  'dots',
  'cross',
  'triangle',
  'square',
  'diamond',
  'plus'
] as const;

export type PatternName = (typeof PATTERN_NAMES)[number];

/** Shared pattern type + angle mapping — used by legend, SVG export, and palette preview */
export const PATTERN_TYPE_MAP: Record<
  PatternName,
  Pick<PatternOptions, 'type' | 'angle'>
> = {
  diagonal: { type: 'line', angle: 45 },
  'diagonal-reverse': { type: 'line', angle: 315 },
  horizontal: { type: 'line', angle: 0 },
  vertical: { type: 'line', angle: 90 },
  dots: { type: 'circle' },
  cross: { type: 'plaid' },
  triangle: { type: 'triangle' },
  square: { type: 'square' },
  diamond: { type: 'diamond' },
  plus: { type: 'plus' }
};

/** Full motif.js options for atlas generation.
 *  background must be 'transparent' so Deck.gl fillPatternMask works
 *  (mask uses alpha channel — opaque white background = no visible effect). */
const PATTERN_CONFIGS: Record<PatternName, PatternOptions> = {
  diagonal: {
    type: 'line',
    angle: 45,
    fill: '#000000',
    background: 'transparent',
    patchSize: true
  },
  'diagonal-reverse': {
    type: 'line',
    angle: 315,
    fill: '#000000',
    background: 'transparent',
    patchSize: true
  },
  horizontal: {
    type: 'line',
    angle: 0,
    fill: '#000000',
    background: 'transparent',
    patchSize: true
  },
  vertical: {
    type: 'line',
    angle: 90,
    fill: '#000000',
    background: 'transparent',
    patchSize: true
  },
  dots: {
    type: 'circle',
    fill: '#000000',
    background: 'transparent',
    patchSize: true
  },
  cross: {
    type: 'plaid',
    fill: '#000000',
    background: 'transparent',
    patchSize: true
  },
  triangle: {
    type: 'triangle',
    fill: '#000000',
    background: 'transparent',
    patchSize: true
  },
  square: {
    type: 'square',
    fill: '#000000',
    background: 'transparent',
    patchSize: true
  },
  diamond: {
    type: 'diamond',
    fill: '#000000',
    background: 'transparent',
    patchSize: true
  },
  plus: {
    type: 'plus',
    fill: '#000000',
    background: 'transparent',
    patchSize: true
  }
};

let cachedResult: AtlasResult | null = null;

/**
 * Builds the static pattern texture atlas and mapping via motif.js.
 * Results are cached — subsequent calls return the same references.
 */
export function getPatternAtlas(): {
  atlas: HTMLCanvasElement;
  mapping: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >;
} {
  if (cachedResult) {
    return { atlas: cachedResult.canvas, mapping: cachedResult.mapping };
  }

  cachedResult = motifAtlas(PATTERN_CONFIGS);

  return { atlas: cachedResult.canvas, mapping: cachedResult.mapping };
}

/**
 * Checks whether a given pattern ID is a valid known pattern.
 */
export function isValidPatternId(
  patternId: string | undefined
): patternId is PatternName {
  if (!patternId) return false;
  return (PATTERN_NAMES as readonly string[]).includes(patternId);
}

/**
 * Converts ok-palette PatternParams to motif.js PatternOptions.
 */
function toMotifOptions(params: OkPatternParams): PatternOptions {
  return {
    type: params.type as PatternOptions['type'],
    angle: params.angle,
    scale: params.scale,
    size: params.size,
    fill: params.fill,
    background: params.background,
    patchSize: params.patchSize
  };
}

/**
 * Generates a dynamic pattern atlas from ok-palette's pattern generators + motif.js.
 * Each class gets its own distinct pattern in the sprite sheet.
 *
 * @param count Number of patterns to generate (one per class)
 * @param mode 'categorical' for varied shapes/angles, 'sequential' for monotonic size increase
 * @returns Atlas canvas + mapping with keys 'class-0', 'class-1', etc.
 */
export function generatePatternAtlas(
  count: number,
  mode: 'categorical' | 'sequential' = 'categorical'
): {
  atlas: HTMLCanvasElement;
  mapping: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >;
} {
  const patternParams: OkPatternParams[] =
    mode === 'sequential'
      ? sequentialPatterns(count)
      : categoricalPatterns(count);

  const configs: Record<string, PatternOptions> = {};
  patternParams.forEach((p, i) => {
    configs[`class-${i}`] = toMotifOptions(p);
  });

  const result = motifAtlas(configs);

  logger.info(
    `Dynamic pattern atlas generated (${mode}, ${count} classes)`,
    LogCategory.MAP,
    {
      mode,
      count,
      patterns: Object.keys(result.mapping).length
    }
  );

  return { atlas: result.canvas, mapping: result.mapping };
}
