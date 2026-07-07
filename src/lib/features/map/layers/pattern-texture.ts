import { motifAtlas } from '@ateliercartographie/motif.js';
import type {
  AtlasResult,
  PatternOptions
} from '@ateliercartographie/motif.js';
import type { PatternParams } from '$lib/features/commons/constants/pattern.constants';
import type { ClassPattern } from '$lib/features/commons/services/pattern-palette.service';

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

const customAtlasCache = new Map<string, AtlasResult>();

export const CUSTOM_PATTERN_ATLAS_CACHE_LIMIT = 32;

export const PATTERN_DEFAULT_SIZE = 4;
export const PATTERN_DEFAULT_SCALE = 8;

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
function resolveMotifFillPercent(size: number, scale: number): number {
  const safeSize = Math.max(1, size);
  const safeScale = Math.max(1, scale);
  return Math.min(99, Math.max(1, Math.round((safeSize / safeScale) * 100)));
}

/**
 * motif.js builds tiles of 10 design px × its `scale` option; Khartis maps the
 * user's Échelle slider to `scale / 10`, so the design tile edge equals the
 * slider value. The atlas canvas itself is devicePixelRatio-scaled — never
 * feed atlas frame widths to the shader, which expects CSS pixels.
 */
export function resolvePatternTilePx(params?: PatternParams): number {
  return Math.max(1, params?.scale ?? PATTERN_DEFAULT_SCALE);
}

export function resolveMotifOptions(
  patternId: PatternName,
  params?: PatternParams
): PatternOptions {
  const config = PATTERN_CONFIGS[patternId];
  const scale = Math.max(1, params?.scale ?? PATTERN_DEFAULT_SCALE);
  const size = Math.max(1, params?.size ?? PATTERN_DEFAULT_SIZE);

  return {
    ...config,
    angle: params?.angle ?? config.angle,
    size: resolveMotifFillPercent(size, scale),
    scale: scale / 10,
    background: 'transparent'
  };
}

export function stripSvgDefsWrapper(defsHtml: string): string {
  return defsHtml.replace(/^\s*<defs[^>]*>/i, '').replace(/<\/defs>\s*$/i, '');
}

export function getPatternOverlayColorHex(
  fillColor: string | undefined
): string {
  if (!fillColor?.startsWith('#') || fillColor.length !== 7) {
    return '#000000';
  }

  const r = parseInt(fillColor.slice(1, 3), 16);
  const g = parseInt(fillColor.slice(3, 5), 16);
  const b = parseInt(fillColor.slice(5, 7), 16);
  return getPatternOverlayColorRgb([r, g, b]);
}

export function getPatternOverlayColorRgb(
  rgb: readonly [number, number, number]
): string {
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return luminance < 0.45 ? '#ffffff' : '#000000';
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
  const cacheKey = JSON.stringify({
    patternId,
    angle: params?.angle,
    size: params?.size,
    scale: params?.scale
  });
  const cachedCustomResult = getCachedCustomPatternAtlas(cacheKey);
  if (cachedCustomResult) {
    return {
      atlas: cachedCustomResult.canvas,
      mapping: cachedCustomResult.mapping
    };
  }

  const result = motifAtlas({
    [patternId]: resolveMotifOptions(patternId, params)
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

export function getPatternPaletteAtlas(patterns: ClassPattern[]): {
  atlas: HTMLCanvasElement;
  mapping: Record<
    string,
    { x: number; y: number; width: number; height: number }
  >;
} {
  const cacheKey = JSON.stringify(patterns);
  const cachedResult = getCachedCustomPatternAtlas(cacheKey);
  if (cachedResult) {
    return { atlas: cachedResult.canvas, mapping: cachedResult.mapping };
  }

  const result = motifAtlas(
    Object.fromEntries(
      patterns.map((pattern, index) => [
        `c${index}`,
        {
          type: pattern.type as PatternOptions['type'],
          angle: pattern.angle,
          scale: pattern.scale,
          size: pattern.size,
          fill: '#000000',
          background: 'transparent',
          patchSize: true
        }
      ])
    )
  );
  cacheCustomPatternAtlas(cacheKey, result);

  return { atlas: result.canvas, mapping: result.mapping };
}
