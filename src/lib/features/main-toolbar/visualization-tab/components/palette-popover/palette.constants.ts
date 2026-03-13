import * as m from '$lib/paraglide/messages';
import {
  sequential,
  divergent,
  categorical,
  resolvePalette,
  categoricalPatterns,
  sequentialPatterns,
  presets,
  temperature
} from '@ateliercartographie/ok-palette';
import type { WebGLColor } from '@ateliercartographie/ok-palette';
import { motif } from '@ateliercartographie/motif.js';
import type { PatternOptions } from '@ateliercartographie/motif.js';
import type { PatternParams } from '$lib/features/commons/store/visualization.store.svelte';
import { webglToHex } from '$lib/features/commons/utils/color-utils';

export type { PatternParams };
export { presets, temperature, categoricalPatterns, sequentialPatterns };

export const PALETTE_TYPE = {
  SEQUENTIAL: 'sequential',
  DIVERGING: 'diverging',
  QUALITATIVE: 'qualitative',
  PATTERN: 'pattern'
} as const;

export type PaletteType = (typeof PALETTE_TYPE)[keyof typeof PALETTE_TYPE];
export type PatternId =
  | 'diagonal'
  | 'diagonal-reverse'
  | 'horizontal'
  | 'vertical'
  | 'dots'
  | 'cross';

export interface Palette {
  id: string;
  name: string;
  colors: string[];
  type: PaletteType;
  colorBlindSafe?: boolean;
  patternId?: PatternId;
}

export const sequentialPalettes: Palette[] = [
  {
    id: 'blues',
    name: 'Blues',
    colors: ['#f7fbff', '#6baed6', '#08519c'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'greens',
    name: 'Greens',
    colors: ['#f7fcf5', '#74c476', '#006d2c'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'oranges',
    name: 'Oranges',
    colors: ['#fff5eb', '#fd8d3c', '#a63603'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'purples',
    name: 'Purples',
    colors: ['#fcfbfd', '#9e9ac8', '#54278f'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'reds',
    name: 'Reds',
    colors: ['#fff5f0', '#fc9272', '#a50f15'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'grays',
    name: 'Grays',
    colors: ['#ffffff', '#969696', '#252525'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  }
];

export const divergingPalettes: Palette[] = [
  {
    id: 'rdbu',
    name: 'Red-Blue',
    colors: ['#b2182b', '#f7f7f7', '#2166ac'],
    type: PALETTE_TYPE.DIVERGING,
    colorBlindSafe: true
  },
  {
    id: 'rdylgn',
    name: 'Red-Yellow-Green',
    colors: ['#d73027', '#ffffbf', '#1a9850'],
    type: PALETTE_TYPE.DIVERGING,
    colorBlindSafe: false
  },
  {
    id: 'brbg',
    name: 'Brown-BlueGreen',
    colors: ['#8c510a', '#f5f5f5', '#01665e'],
    type: PALETTE_TYPE.DIVERGING,
    colorBlindSafe: true
  },
  {
    id: 'piyg',
    name: 'Pink-YellowGreen',
    colors: ['#c51b7d', '#f7f7f7', '#4d9221'],
    type: PALETTE_TYPE.DIVERGING,
    colorBlindSafe: false
  },
  {
    id: 'prgn',
    name: 'Purple-Green',
    colors: ['#7b3294', '#f7f7f7', '#008837'],
    type: PALETTE_TYPE.DIVERGING,
    colorBlindSafe: true
  }
];

export const qualitativePalettes: Palette[] = [
  {
    id: 'set1',
    name: 'Set 1',
    colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00'],
    type: PALETTE_TYPE.QUALITATIVE,
    colorBlindSafe: false
  },
  {
    id: 'set2',
    name: 'Set 2',
    colors: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854'],
    type: PALETTE_TYPE.QUALITATIVE,
    colorBlindSafe: true
  },
  {
    id: 'pastel',
    name: 'Pastel',
    colors: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6'],
    type: PALETTE_TYPE.QUALITATIVE,
    colorBlindSafe: true
  },
  {
    id: 'dark',
    name: 'Dark',
    colors: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e'],
    type: PALETTE_TYPE.QUALITATIVE,
    colorBlindSafe: true
  }
];

export function getPatternPalettes(): Palette[] {
  return [
    {
      id: 'pattern-diagonal',
      name: m.pattern_diagonal(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'diagonal'
    },
    {
      id: 'pattern-diagonal-reverse',
      name: m.pattern_diagonal_reverse(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'diagonal-reverse'
    },
    {
      id: 'pattern-horizontal',
      name: m.pattern_horizontal(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'horizontal'
    },
    {
      id: 'pattern-vertical',
      name: m.pattern_vertical(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'vertical'
    },
    {
      id: 'pattern-dots',
      name: m.pattern_dots(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'dots'
    },
    {
      id: 'pattern-cross',
      name: m.pattern_cross(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'cross'
    }
  ];
}

/**
 * Generates palette colors using ok-palette's perceptual Oklch generators.
 * Dispatches to the appropriate generator based on palette type.
 */
export function generatePaletteColors(
  palette: Palette,
  count: number
): string[] {
  if (count <= 0) return [];
  if (count === 1) return [palette.colors[0]];

  switch (palette.type) {
    case PALETTE_TYPE.SEQUENTIAL: {
      const colorStart = palette.colors[0];
      const colorEnd = palette.colors[palette.colors.length - 1];
      const cssColors = sequential({ colorStart, colorEnd, steps: count });
      return (
        resolvePalette(cssColors, { format: 'webgl' }) as WebGLColor[]
      ).map(webglToHex);
    }
    case PALETTE_TYPE.DIVERGING: {
      const colorA = palette.colors[0];
      const colorB = palette.colors[palette.colors.length - 1];
      const hasCenterClass = count % 2 === 1;
      const halfSteps = Math.floor(count / 2);
      const cssColors = divergent({
        colorA,
        colorB,
        steps: [halfSteps, halfSteps],
        hasCenterClass
      });
      return (
        resolvePalette(cssColors, { format: 'webgl' }) as WebGLColor[]
      ).map(webglToHex);
    }
    case PALETTE_TYPE.QUALITATIVE: {
      if (count <= palette.colors.length) {
        return palette.colors.slice(0, count);
      }
      const cssColors = categorical(count, presets.vif);
      return (
        resolvePalette(cssColors, { format: 'webgl' }) as WebGLColor[]
      ).map(webglToHex);
    }
    case PALETTE_TYPE.PATTERN:
      return palette.colors;
    default:
      return palette.colors.slice(0, count);
  }
}

/**
 * Generates sequential colors from one color (monochrome ramp) via ok-palette.
 */
export function generateSequentialFromColor(
  color: string,
  count: number
): string[] {
  if (count <= 0) return [];
  const cssColors = sequential({ colorStart: color, steps: count });
  return (resolvePalette(cssColors, { format: 'webgl' }) as WebGLColor[]).map(
    webglToHex
  );
}

/**
 * Generates sequential colors from two colors (bi-tone ramp) via ok-palette.
 */
export function generateSequentialFromColors(
  colorStart: string,
  colorEnd: string,
  count: number
): string[] {
  if (count <= 0) return [];
  const cssColors = sequential({ colorStart, colorEnd, steps: count });
  return (resolvePalette(cssColors, { format: 'webgl' }) as WebGLColor[]).map(
    webglToHex
  );
}

/** Maps Khartis PatternId to motif.js PatternOptions */
const PATTERN_TO_MOTIF: Record<
  PatternId,
  Pick<PatternOptions, 'type' | 'angle'>
> = {
  diagonal: { type: 'line', angle: 45 },
  'diagonal-reverse': { type: 'line', angle: 315 },
  horizontal: { type: 'line', angle: 0 },
  vertical: { type: 'line', angle: 90 },
  dots: { type: 'circle' },
  cross: { type: 'plaid' }
};

/**
 * Builds a CSS background for pattern preview using motif.js.
 * Returns a `url(data:...)` from the motif tile canvas.
 */
export function buildPatternBackground(
  palette: Palette,
  params?: PatternParams
): string {
  const accent = palette.colors[0] ?? '#3d3d3d';
  const base = palette.colors[1] ?? '#f4f4f4';
  const sizePx = params?.size ?? 4;
  const scalePx = params?.scale ?? 8;

  let effectivePatternId: PatternId = palette.patternId ?? 'diagonal';
  if (params?.angle !== undefined) {
    if (params.angle === 0) effectivePatternId = 'horizontal';
    else if (params.angle === 45) effectivePatternId = 'diagonal';
    else if (params.angle === 315) effectivePatternId = 'diagonal-reverse';
  }

  const motifConfig = PATTERN_TO_MOTIF[effectivePatternId];
  const tile = motif({
    type: motifConfig.type,
    angle: motifConfig.angle,
    fill: accent,
    background: base,
    size: Math.round((sizePx / scalePx) * 100),
    scale: scalePx / 10
  }).tile();

  return `url(${tile.toDataURL()})`;
}

export function getPalettesForType(
  type: PaletteType,
  colorBlindFilter: boolean
): Palette[] {
  let palettes: Palette[];
  switch (type) {
    case PALETTE_TYPE.SEQUENTIAL:
      palettes = sequentialPalettes;
      break;
    case PALETTE_TYPE.DIVERGING:
      palettes = divergingPalettes;
      break;
    case PALETTE_TYPE.QUALITATIVE:
      palettes = qualitativePalettes;
      break;
    case PALETTE_TYPE.PATTERN:
      palettes = getPatternPalettes();
      break;
    default:
      palettes = sequentialPalettes;
  }
  if (colorBlindFilter) {
    return palettes.filter((p) => p.colorBlindSafe);
  }
  return palettes;
}

export function findPaletteById(id: string): Palette | undefined {
  const all = [
    ...sequentialPalettes,
    ...divergingPalettes,
    ...qualitativePalettes,
    ...getPatternPalettes()
  ];
  return all.find((p) => p.id === id);
}
