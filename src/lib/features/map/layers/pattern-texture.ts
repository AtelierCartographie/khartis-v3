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
import type { PatternParams } from '$lib/features/commons/stores/visualization.store.svelte';
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
    size: Math.round((size / scale) * 100),
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
  const cachedCustomResult = customAtlasCache.get(cacheKey);
  if (cachedCustomResult) {
    return {
      atlas: cachedCustomResult.canvas,
      mapping: cachedCustomResult.mapping
    };
  }

  const result = motifAtlas({
    [patternId]: createParameterizedPatternOptions(patternId, params)
  });
  customAtlasCache.set(cacheKey, result);

  return { atlas: result.canvas, mapping: result.mapping };
}

export function isValidPatternId(
  patternId: string | undefined
): patternId is PatternName {
  if (!patternId) return false;
  return (PATTERN_NAMES as readonly string[]).includes(patternId);
}

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
