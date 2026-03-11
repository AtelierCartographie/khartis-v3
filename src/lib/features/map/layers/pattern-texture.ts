/**
 * Pattern texture atlas powered by motif.js.
 * Generates a sprite sheet for Deck.gl FillStyleExtension / RotatableFillStyleExtension.
 */

import { motifAtlas } from '@ateliercartographie/motif.js';
import type {
  PatternOptions,
  AtlasResult
} from '@ateliercartographie/motif.js';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';

const PATTERN_NAMES = [
  'diagonal',
  'horizontal',
  'vertical',
  'dots',
  'cross'
] as const;

type PatternName = (typeof PATTERN_NAMES)[number];

/** Maps Khartis pattern IDs to motif.js pattern options */
const PATTERN_CONFIGS: Record<PatternName, PatternOptions> = {
  diagonal: { type: 'line', angle: 45, fill: '#000000' },
  horizontal: { type: 'line', angle: 0, fill: '#000000' },
  vertical: { type: 'line', angle: 90, fill: '#000000' },
  dots: { type: 'circle', fill: '#000000' },
  cross: { type: 'plaid', fill: '#000000' }
};

let cachedResult: AtlasResult | null = null;

/**
 * Builds the pattern texture atlas and mapping via motif.js.
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

  logger.info('Pattern atlas generated via motif.js', LogCategory.MAP, {
    patterns: Object.keys(cachedResult.mapping).length
  });

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
