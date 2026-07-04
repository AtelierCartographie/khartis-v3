import { motifAtlas } from '@ateliercartographie/motif.js';
import type {
  AtlasResult,
  PatternOptions
} from '@ateliercartographie/motif.js';
import type { PatternParams } from '$lib/features/commons/constants/pattern.constants';

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
const customAtlasCache = new Map<string, AtlasResult>();

export const CUSTOM_PATTERN_ATLAS_CACHE_LIMIT = 32;

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

function getCachedCustomPatternAtlas(cacheKey: string): AtlasResult | null {
  const cached = customAtlasCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  customAtlasCache.delete(cacheKey);
  customAtlasCache.set(cacheKey, cached);
  return cached;
}

function cacheCustomPatternAtlas(cacheKey: string, result: AtlasResult): void {
  if (customAtlasCache.has(cacheKey)) {
    customAtlasCache.delete(cacheKey);
  }
  customAtlasCache.set(cacheKey, result);

  while (customAtlasCache.size > CUSTOM_PATTERN_ATLAS_CACHE_LIMIT) {
    const oldestKey = customAtlasCache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    customAtlasCache.delete(oldestKey);
  }
}

/**
 * motif.js consumes `size` as a fill percentage of the tile. Our size/scale
 * sliders map to (size / scale) * 100, which can exceed 100% when size > scale
 * (e.g. size 10 / scale 4 → 250%). Above 100% motif.js' patchSize inversion
 * produces a negative shape area, i.e. a degenerate / invisible tile. Clamp to
 * an always-visible 1–99% range so every slider combination renders a motif.
 */
export function resolveMotifFillPercent(size: number, scale: number): number {
  const safeSize = Math.max(1, size);
  const safeScale = Math.max(1, scale);
  return Math.min(99, Math.max(1, Math.round((safeSize / safeScale) * 100)));
}

function createParameterizedPatternOptions(
  patternId: PatternName,
  params: PatternParams
): PatternOptions {
  const config = PATTERN_CONFIGS[patternId];
  const scale = Math.max(1, params.scale ?? 8);
  const size = Math.max(1, params.size ?? 4);

  return {
    ...config,
    angle: params.angle ?? config.angle,
    size: resolveMotifFillPercent(size, scale),
    scale: scale / 10,
    background: 'transparent'
  };
}

export function getPatternAtlasForPattern(
  patternId: PatternName,
  params?: PatternParams
): {
  atlas: HTMLCanvasElement;
  mapping: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >;
} {
  if (!params) {
    return getPatternAtlas();
  }

  const cacheKey = JSON.stringify({
    patternId,
    angle: params.angle,
    size: params.size,
    scale: params.scale
  });
  const cachedCustomResult = getCachedCustomPatternAtlas(cacheKey);
  if (cachedCustomResult) {
    return {
      atlas: cachedCustomResult.canvas,
      mapping: cachedCustomResult.mapping
    };
  }

  const result = motifAtlas({
    [patternId]: createParameterizedPatternOptions(patternId, params)
  });
  cacheCustomPatternAtlas(cacheKey, result);

  return { atlas: result.canvas, mapping: result.mapping };
}

export function isValidPatternId(
  patternId: string | undefined
): patternId is PatternName {
  if (!patternId) return false;
  return (PATTERN_NAMES as readonly string[]).includes(patternId);
}
