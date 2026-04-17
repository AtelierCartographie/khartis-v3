import * as m from '$lib/paraglide/messages';
import {
  sequential,
  divergentSequential,
  categorical,
  resolvePalette,
  presets
} from '@ateliercartographie/ok-palette';
import type {
  WebGLColor,
  ContrastMode,
  CategoricalColorOptions
} from '@ateliercartographie/ok-palette';
import { motif } from '@ateliercartographie/motif.js';
import type { PatternParams } from '$lib/features/commons/store/visualization.store.svelte';
import { webglToHex } from '$lib/features/commons/utils/color-utils';
import { PATTERN_TYPE_MAP } from '$lib/features/map/layers/pattern-texture';

export type { PatternParams };
export { presets };
export type { ContrastMode, CategoricalColorOptions };

/** Default 4-color sequential preview (Blues ramp) — shared across all config components */
export const DEFAULT_SEQUENTIAL_PREVIEW = [
  '#c8ddf0',
  '#78a9cf',
  '#2171b5',
  '#084594'
];

/** Default 4-color qualitative preview — shared across all config components */
export const DEFAULT_QUALITATIVE_PREVIEW = [
  '#009d9a',
  '#f1c21b',
  '#ff832b',
  '#a56eff'
];

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
  | 'cross'
  | 'triangle'
  | 'square'
  | 'diamond'
  | 'plus';

export interface Palette {
  id: string;
  name: string;
  colors: string[];
  type: PaletteType;
  colorBlindSafe?: boolean;
  patternId?: PatternId;
}

export type SuggestionPreset = 'monochrome' | 'bicolor' | 'sepia';

export type QualitativePreset = 'vif' | 'pastel' | 'sepia';

/** Exact hex values from Figma node 893:153398 — "Color - Unique" Vif preset */
export const VIF_MIXTE_COLORS = [
  '#f287ac',
  '#00ad92',
  '#c39800',
  '#90a8ff',
  '#da5e04'
] as const;

export const VIF_CHAUD_COLORS = [
  '#bb98ff',
  '#dd5642',
  '#db6fb5',
  '#e2a333',
  '#b75dce'
] as const;

export const VIF_FROID_COLORS = [
  '#aabf4c',
  '#00a5cc',
  '#2dbd86',
  '#77b1ff',
  '#51a738'
] as const;

/** Pastel preset — desaturated lighter variants derived from Vif seeds via ok-palette */
export const PASTEL_MIXTE_COLORS = [
  '#fbd0dd',
  '#a9e8dd',
  '#ecd79e',
  '#cdd6ff',
  '#f6c7a8'
] as const;

export const PASTEL_CHAUD_COLORS = [
  '#dfcefe',
  '#f3bfb2',
  '#f3c6e1',
  '#f3dab1',
  '#e7c3f0'
] as const;

export const PASTEL_FROID_COLORS = [
  '#dde5b0',
  '#a9dfed',
  '#bfe7d4',
  '#c8def9',
  '#c5e2b9'
] as const;

/** Sépia preset — warm desaturated earth tones */
export const SEPIA_MIXTE_COLORS = [
  '#b08c7a',
  '#9f8a6a',
  '#bf9c55',
  '#a79279',
  '#b58268'
] as const;

export const SEPIA_CHAUD_COLORS = [
  '#9e8d81',
  '#c7856e',
  '#b08575',
  '#c29a6d',
  '#a38273'
] as const;

export const SEPIA_FROID_COLORS = [
  '#a89874',
  '#87918c',
  '#94957e',
  '#8a8e7c',
  '#9c9478'
] as const;

export interface QualitativeColorGroups {
  mixte: string[];
  chaud: string[];
  froid: string[];
}

/** Colorblind-safe subset indices (per theme row) derived from Figma Daltonisme filter */
const COLORBLIND_SAFE_INDICES: Record<
  QualitativePreset,
  {
    mixte: number[];
    chaud: number[];
    froid: number[];
  }
> = {
  vif: {
    mixte: [0, 1, 2, 3],
    chaud: [0, 1, 3],
    froid: [1, 3]
  },
  pastel: {
    mixte: [0, 1, 2, 3],
    chaud: [0, 1, 3],
    froid: [1, 3]
  },
  sepia: {
    mixte: [0, 1, 2, 3, 4],
    chaud: [0, 1, 2, 3, 4],
    froid: [0, 1, 2, 3, 4]
  }
};

/** Monochrome palettes — single seed color, ok-palette generates the light→dark ramp */
export const monochromePalettes: Palette[] = [
  {
    id: 'mono-pink',
    name: 'Rose',
    colors: ['#c2185b'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'mono-teal',
    name: 'Turquoise',
    colors: ['#00897b'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'mono-gold',
    name: 'Or',
    colors: ['#f9a825'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'mono-indigo',
    name: 'Indigo',
    colors: ['#1565c0'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'mono-vermilion',
    name: 'Vermillon',
    colors: ['#d84315'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  }
];

/** Bicolor palettes — two seed colors, ok-palette interpolates between them */
export const bicolorPalettes: Palette[] = [
  {
    id: 'blues',
    name: 'Blues',
    colors: ['#f7fbff', '#08519c'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'greens',
    name: 'Greens',
    colors: ['#f7fcf5', '#006d2c'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'oranges',
    name: 'Oranges',
    colors: ['#fff5eb', '#a63603'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'purples',
    name: 'Purples',
    colors: ['#fcfbfd', '#54278f'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'reds',
    name: 'Reds',
    colors: ['#fff5f0', '#a50f15'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  }
];

/** Sepia palettes — warm desaturated tones (hue 30°–90° oklch) */
export const sepiaPalettes: Palette[] = [
  {
    id: 'sepia-sand',
    name: 'Sable',
    colors: ['#d7ccc8'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'sepia-terre',
    name: 'Terre',
    colors: ['#8d6e63'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'sepia-ochre',
    name: 'Ocre',
    colors: ['#bf8f00'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'sepia-brique',
    name: 'Brique',
    colors: ['#a1887f'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'sepia-olive',
    name: 'Olive',
    colors: ['#827717'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  }
];

/** Standard sequential palettes — used by dropdown and getPalettesForType */
export const sequentialPalettes: Palette[] = bicolorPalettes;

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
    },
    {
      id: 'pattern-triangle',
      name: m.pattern_triangle(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'triangle'
    },
    {
      id: 'pattern-square',
      name: m.pattern_square(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'square'
    },
    {
      id: 'pattern-diamond',
      name: m.pattern_diamond(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'diamond'
    },
    {
      id: 'pattern-plus',
      name: m.pattern_plus(),
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'plus'
    }
  ];
}

/**
 * Generates palette colors using ok-palette's perceptual Oklch generators.
 * Dispatches to the appropriate generator based on palette type.
 *
 * @param contrast Controls lightness range — 'high' improves accessibility (colorblind)
 * @param categoricalOptions Override categorical generation (presets, temperature)
 */
export function generatePaletteColors(
  palette: Palette,
  count: number,
  contrast?: ContrastMode,
  categoricalOptions?: CategoricalColorOptions
): string[] {
  if (count <= 0) return [];
  if (count === 1) return [palette.colors[0]];

  switch (palette.type) {
    case PALETTE_TYPE.SEQUENTIAL: {
      const colorStart = palette.colors[0];
      const isMonochrome = palette.colors.length === 1;
      const cssColors = isMonochrome
        ? sequential({ colorStart, steps: count, contrast })
        : sequential({
            colorStart,
            colorEnd: palette.colors[palette.colors.length - 1],
            steps: count,
            contrast
          });
      return (
        resolvePalette(cssColors, { format: 'webgl' }) as WebGLColor[]
      ).map(webglToHex);
    }
    case PALETTE_TYPE.DIVERGING: {
      const colorA = palette.colors[0];
      const colorB = palette.colors[palette.colors.length - 1];
      const hasCenterClass = count % 2 === 1;
      const halfSteps = Math.floor(count / 2);
      const cssColors = divergentSequential({
        colorA,
        colorB,
        steps: [halfSteps, halfSteps],
        hasCenterClass,
        contrast
      });
      return (
        resolvePalette(cssColors, { format: 'webgl' }) as WebGLColor[]
      ).map(webglToHex);
    }
    case PALETTE_TYPE.QUALITATIVE: {
      if (count <= palette.colors.length) {
        return palette.colors.slice(0, count);
      }
      const cssColors = categorical(count, categoricalOptions ?? presets.vif);
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
  count: number,
  contrast?: ContrastMode
): string[] {
  if (count <= 0) return [];
  const cssColors = sequential({ colorStart: color, steps: count, contrast });
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
  count: number,
  contrast?: ContrastMode
): string[] {
  if (count <= 0) return [];
  const cssColors = sequential({
    colorStart,
    colorEnd,
    steps: count,
    contrast
  });
  return (resolvePalette(cssColors, { format: 'webgl' }) as WebGLColor[]).map(
    webglToHex
  );
}

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

  const motifConfig = PATTERN_TYPE_MAP[effectivePatternId];
  const tile = motif({
    type: motifConfig.type,
    angle: motifConfig.angle,
    fill: accent,
    background: base,
    size: Math.round((sizePx / scalePx) * 100),
    scale: scalePx / 10,
    patchSize: true
  }).tile();

  return `url(${tile.toDataURL()})`;
}

/**
 * Generates 7 intensity shades of a single color via ok-palette sequential ramp.
 * Produces a dark-to-light gradient centered on the seed color (CDC [VIZ-02c]).
 */
export function generateIntensityShades(seedColor: string): string[] {
  const ramp = sequential({
    colorStart: seedColor,
    steps: 7,
    contrast: 'high'
  });
  return (resolvePalette(ramp, { format: 'webgl' }) as WebGLColor[]).map(
    webglToHex
  );
}

export function getSuggestionPalettes(
  preset: SuggestionPreset,
  colorBlindFilter: boolean
): Palette[] {
  let palettes: Palette[];
  switch (preset) {
    case 'monochrome':
      palettes = monochromePalettes;
      break;
    case 'bicolor':
      palettes = bicolorPalettes;
      break;
    case 'sepia':
      palettes = sepiaPalettes;
      break;
    default:
      palettes = monochromePalettes;
  }
  if (colorBlindFilter) {
    return palettes.filter((p) => p.colorBlindSafe);
  }
  return palettes;
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
    ...monochromePalettes,
    ...bicolorPalettes,
    ...sepiaPalettes,
    ...divergingPalettes,
    ...qualitativePalettes,
    ...getPatternPalettes()
  ];
  return all.find((p) => p.id === id);
}

function filterByIndices<T>(source: readonly T[], indices: number[]): T[] {
  return indices.map((i) => source[i]).filter((v): v is T => v !== undefined);
}

export function getQualitativeColorGroups(
  preset: QualitativePreset,
  colorBlindFilter: boolean
): QualitativeColorGroups {
  const mixte =
    preset === 'vif'
      ? [...VIF_MIXTE_COLORS]
      : preset === 'pastel'
        ? [...PASTEL_MIXTE_COLORS]
        : [...SEPIA_MIXTE_COLORS];
  const chaud =
    preset === 'vif'
      ? [...VIF_CHAUD_COLORS]
      : preset === 'pastel'
        ? [...PASTEL_CHAUD_COLORS]
        : [...SEPIA_CHAUD_COLORS];
  const froid =
    preset === 'vif'
      ? [...VIF_FROID_COLORS]
      : preset === 'pastel'
        ? [...PASTEL_FROID_COLORS]
        : [...SEPIA_FROID_COLORS];

  if (!colorBlindFilter) {
    return { mixte, chaud, froid };
  }

  const safe = COLORBLIND_SAFE_INDICES[preset];
  return {
    mixte: filterByIndices(mixte, safe.mixte),
    chaud: filterByIndices(chaud, safe.chaud),
    froid: filterByIndices(froid, safe.froid)
  };
}

/** Alias for generateIntensityShades — 7 shades of a single color for the Intensité row */
export function generateIntensityShadesForColor(seedHex: string): string[] {
  return generateIntensityShades(seedHex);
}

/** Generate N categorical colors aligned with a seed color's hue within a preset's ranges */
export function generateCategoricalColorsFromSeed(
  seedHex: string,
  count: number,
  preset: QualitativePreset = 'vif'
): string[] {
  if (count <= 0) return [];
  if (count === 1) return [seedHex];
  const presetOption =
    preset === 'vif'
      ? presets.vif
      : preset === 'pastel'
        ? presets.pastel
        : presets.sepia;
  const seedHue = extractHueFromHex(seedHex);
  const cssColors = categorical(count, {
    ...presetOption,
    hueOffset: seedHue
  });
  return (resolvePalette(cssColors, { format: 'webgl' }) as WebGLColor[]).map(
    webglToHex
  );
}

function extractHueFromHex(hex: string): number {
  const clean = hex.replace(/^#/, '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = h * 60;
  if (h < 0) h += 360;
  return Math.round(h);
}
