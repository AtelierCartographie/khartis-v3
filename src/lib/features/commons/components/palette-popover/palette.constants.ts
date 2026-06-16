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
import type { PatternParams } from '$lib/features/commons/stores/visualization.store.svelte';
import { webglToHex } from '$lib/features/commons/utils/color-utils';
import {
  PATTERN_TYPE_MAP,
  resolveMotifFillPercent
} from '$lib/features/map/layers/pattern-texture';
import { PatternType } from './categories-aspect-popover.types';
import {
  DEFAULT_QUALITATIVE_PRESET,
  GRAYSCALE_COLORS,
  PASTEL_ALL_COLORS,
  PASTEL_CHAUD_COLORS,
  PASTEL_FROID_COLORS,
  PASTEL_MIXTE_COLORS,
  SEPIA_ALL_COLORS,
  SEPIA_CHAUD_COLORS,
  SEPIA_FROID_COLORS,
  SEPIA_MIXTE_COLORS,
  VIF_ALL_COLORS,
  VIF_CHAUD_COLORS,
  VIF_FROID_COLORS,
  VIF_MIXTE_COLORS
} from '$lib/features/commons/constants/qualitative-palette.constants';

export type { PatternParams };
export { presets };
export type { ContrastMode, CategoricalColorOptions };
export {
  DEFAULT_QUALITATIVE_PRESET,
  GRAYSCALE_COLORS,
  PASTEL_CHAUD_COLORS,
  PASTEL_FROID_COLORS,
  PASTEL_MIXTE_COLORS,
  SEPIA_CHAUD_COLORS,
  SEPIA_FROID_COLORS,
  SEPIA_MIXTE_COLORS,
  VIF_CHAUD_COLORS,
  VIF_FROID_COLORS,
  VIF_MIXTE_COLORS
} from '$lib/features/commons/constants/qualitative-palette.constants';

export const DEFAULT_SEQUENTIAL_PREVIEW = [
  '#c8ddf0',
  '#78a9cf',
  '#2171b5',
  '#084594'
];

export const DEFAULT_QUALITATIVE_PREVIEW = [...VIF_MIXTE_COLORS.slice(0, 4)];

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

export const PATTERN_TYPE_TO_PATTERN_ID: Record<PatternType, PatternId> = {
  [PatternType.DOTS]: 'dots',
  [PatternType.LINES]: 'horizontal',
  [PatternType.CROSSHATCH]: 'cross',
  [PatternType.DASHES]: 'diagonal'
};

export function mapPatternTypeToPatternId(
  patternType: PatternType | undefined,
  fallback: PatternId = 'diagonal'
): PatternId {
  if (patternType === undefined) return fallback;
  return PATTERN_TYPE_TO_PATTERN_ID[patternType] ?? fallback;
}

export interface Palette {
  id: string;
  colors: string[];
  type: PaletteType;
  colorBlindSafe?: boolean;
  patternId?: PatternId;
  qualitativePreset?: QualitativePreset;
}

export interface DivergingPaletteSplit {
  lowerCount: number;
  upperCount: number;
  hasCenterClass: boolean;
}

export type SuggestionPreset = 'monochrome' | 'bicolor' | 'sepia';

export type QualitativePreset = 'vif' | 'pastel' | 'sepia' | 'grayscale';

export interface QualitativeColorGroups {
  mixte: string[];
  chaud: string[];
  froid: string[];
}

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
  },
  grayscale: {
    mixte: [0, 1, 2, 3, 4],
    chaud: [0, 1, 2, 3, 4],
    froid: [0, 1, 2, 3, 4]
  }
};

export const monochromePalettes: Palette[] = [
  {
    id: 'mono-pink',
    colors: ['#c2185b'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'mono-teal',
    colors: ['#00897b'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'mono-gold',
    colors: ['#f9a825'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'mono-indigo',
    colors: ['#1565c0'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'mono-vermilion',
    colors: ['#d84315'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  }
];

export const bicolorPalettes: Palette[] = [
  {
    id: 'blues',
    colors: ['#f7fbff', '#08519c'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'greens',
    colors: ['#f7fcf5', '#006d2c'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'oranges',
    colors: ['#fff5eb', '#a63603'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'purples',
    colors: ['#fcfbfd', '#54278f'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'reds',
    colors: ['#fff5f0', '#a50f15'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  }
];

export const sepiaPalettes: Palette[] = [
  {
    id: 'sepia-sand',
    colors: ['#d7ccc8'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'sepia-terre',
    colors: ['#8d6e63'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'sepia-ochre',
    colors: ['#bf8f00'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'sepia-brique',
    colors: ['#a1887f'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  },
  {
    id: 'sepia-olive',
    colors: ['#827717'],
    type: PALETTE_TYPE.SEQUENTIAL,
    colorBlindSafe: true
  }
];

export const sequentialPalettes: Palette[] = bicolorPalettes;

export const divergingPalettes: Palette[] = [
  {
    id: 'rdbu',
    colors: ['#b2182b', '#f7f7f7', '#2166ac'],
    type: PALETTE_TYPE.DIVERGING,
    colorBlindSafe: true
  },
  {
    id: 'rdylgn',
    colors: ['#d73027', '#ffffbf', '#1a9850'],
    type: PALETTE_TYPE.DIVERGING,
    colorBlindSafe: false
  },
  {
    id: 'brbg',
    colors: ['#8c510a', '#f5f5f5', '#01665e'],
    type: PALETTE_TYPE.DIVERGING,
    colorBlindSafe: true
  },
  {
    id: 'piyg',
    colors: ['#c51b7d', '#f7f7f7', '#4d9221'],
    type: PALETTE_TYPE.DIVERGING,
    colorBlindSafe: false
  },
  {
    id: 'prgn',
    colors: ['#7b3294', '#f7f7f7', '#008837'],
    type: PALETTE_TYPE.DIVERGING,
    colorBlindSafe: true
  }
];

export const qualitativePalettes: Palette[] = [
  {
    id: 'vif',
    colors: [...VIF_ALL_COLORS],
    type: PALETTE_TYPE.QUALITATIVE,
    colorBlindSafe: true,
    qualitativePreset: 'vif'
  },
  {
    id: 'pastel',
    colors: [...PASTEL_ALL_COLORS],
    type: PALETTE_TYPE.QUALITATIVE,
    colorBlindSafe: true,
    qualitativePreset: 'pastel'
  },
  {
    id: 'sepia',
    colors: [...SEPIA_ALL_COLORS],
    type: PALETTE_TYPE.QUALITATIVE,
    colorBlindSafe: true,
    qualitativePreset: 'sepia'
  },
  {
    id: 'grayscale',
    colors: [...GRAYSCALE_COLORS],
    type: PALETTE_TYPE.QUALITATIVE,
    colorBlindSafe: true,
    qualitativePreset: 'grayscale'
  }
];

const LEGACY_PALETTE_ID_ALIASES: Record<string, string> = {
  'categorical-set1': 'vif',
  'categorical-set2': 'pastel',
  'categorical-dark': 'sepia',
  'categorical-vif': 'vif',
  'categorical-pastel': 'pastel',
  'categorical-sepia': 'sepia',
  'categorical-grayscale': 'grayscale',
  set1: 'vif',
  set2: 'pastel',
  dark: 'sepia'
};

export function getPatternPalettes(): Palette[] {
  return [
    {
      id: 'pattern-diagonal',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'diagonal'
    },
    {
      id: 'pattern-diagonal-reverse',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'diagonal-reverse'
    },
    {
      id: 'pattern-horizontal',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'horizontal'
    },
    {
      id: 'pattern-vertical',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'vertical'
    },
    {
      id: 'pattern-dots',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'dots'
    },
    {
      id: 'pattern-cross',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'cross'
    },
    {
      id: 'pattern-triangle',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'triangle'
    },
    {
      id: 'pattern-square',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'square'
    },
    {
      id: 'pattern-diamond',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'diamond'
    },
    {
      id: 'pattern-plus',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      colorBlindSafe: true,
      patternId: 'plus'
    }
  ];
}

export function generatePaletteColors(
  palette: Palette,
  count: number,
  contrast?: ContrastMode,
  categoricalOptions?: CategoricalColorOptions,
  divergingSplit?: DivergingPaletteSplit
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
      const colorB =
        palette.colors.length > 1
          ? palette.colors[palette.colors.length - 1]
          : undefined;
      const split = divergingSplit ?? {
        lowerCount: Math.floor(count / 2),
        upperCount: Math.floor(count / 2),
        hasCenterClass: count % 2 === 1
      };
      const cssColors = divergentSequential({
        colorA,
        colorB,
        steps: [split.lowerCount, split.upperCount],
        hasCenterClass: split.hasCenterClass,
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
      if (palette.qualitativePreset === 'grayscale') {
        const generated = generateSequentialFromColors(
          palette.colors[0] ?? GRAYSCALE_COLORS[0],
          palette.colors[palette.colors.length - 1] ??
            GRAYSCALE_COLORS[GRAYSCALE_COLORS.length - 1],
          count,
          contrast
        );
        return extendQualitativeColors(palette.colors, generated, count);
      }
      const presetOptions = getQualitativePresetOptions(
        palette.qualitativePreset
      );
      if (presetOptions) {
        const cssColors = categorical(count, {
          ...presetOptions,
          ...(categoricalOptions ?? {})
        });
        const generated = (
          resolvePalette(cssColors, { format: 'webgl' }) as WebGLColor[]
        ).map(webglToHex);
        return extendQualitativeColors(palette.colors, generated, count);
      }
      if (categoricalOptions) {
        const cssColors = categorical(count, categoricalOptions);
        return (
          resolvePalette(cssColors, { format: 'webgl' }) as WebGLColor[]
        ).map(webglToHex);
      }
      const base = palette.colors;
      return Array.from({ length: count }, (_, i) => base[i % base.length]);
    }
    case PALETTE_TYPE.PATTERN:
      return palette.colors;
    default:
      return palette.colors.slice(0, count);
  }
}

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
    size: resolveMotifFillPercent(sizePx, scalePx),
    scale: scalePx / 10,
    patchSize: true
  }).tile();

  return `url(${tile.toDataURL()})`;
}

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
  const resolvedId = normalizePaletteId(id) ?? id;
  const all = [
    ...monochromePalettes,
    ...bicolorPalettes,
    ...sepiaPalettes,
    ...divergingPalettes,
    ...qualitativePalettes,
    ...getPatternPalettes()
  ];
  return all.find((p) => p.id === resolvedId);
}

export function normalizePaletteId(id: string | undefined): string | undefined {
  if (!id) return id;
  return LEGACY_PALETTE_ID_ALIASES[id] ?? id;
}

export function resolvePaletteTypeForBreakpoint(
  classification: { breakpointValue?: number | null } | null | undefined
): PaletteType {
  return classification?.breakpointValue != null
    ? PALETTE_TYPE.DIVERGING
    : PALETTE_TYPE.SEQUENTIAL;
}

export function getPaletteDisplayName(palette: Palette): string {
  switch (palette.id) {
    case 'mono-pink':
      return m.palette_name_mono_pink();
    case 'mono-teal':
      return m.palette_name_mono_teal();
    case 'mono-gold':
      return m.palette_name_mono_gold();
    case 'mono-indigo':
      return m.palette_name_mono_indigo();
    case 'mono-vermilion':
      return m.palette_name_mono_vermilion();
    case 'blues':
      return m.palette_name_blues();
    case 'greens':
      return m.palette_name_greens();
    case 'oranges':
      return m.palette_name_oranges();
    case 'purples':
      return m.palette_name_purples();
    case 'reds':
      return m.palette_name_reds();
    case 'sepia-sand':
      return m.palette_name_sepia_sand();
    case 'sepia-terre':
      return m.palette_name_sepia_earth();
    case 'sepia-ochre':
      return m.palette_name_sepia_ochre();
    case 'sepia-brique':
      return m.palette_name_sepia_brick();
    case 'sepia-olive':
      return m.palette_name_sepia_olive();
    case 'rdbu':
      return m.palette_name_rdbu();
    case 'rdylgn':
      return m.palette_name_rdylgn();
    case 'brbg':
      return m.palette_name_brbg();
    case 'piyg':
      return m.palette_name_piyg();
    case 'prgn':
      return m.palette_name_prgn();
    case 'set1':
    case 'vif':
      return m.preset_vif();
    case 'set2':
    case 'pastel':
      return m.preset_pastel();
    case 'dark':
    case 'sepia':
      return m.preset_sepia();
    case 'grayscale':
      return m.preset_grayscale();
    case 'pattern-diagonal':
      return m.pattern_diagonal();
    case 'pattern-diagonal-reverse':
      return m.pattern_diagonal_reverse();
    case 'pattern-horizontal':
      return m.pattern_horizontal();
    case 'pattern-vertical':
      return m.pattern_vertical();
    case 'pattern-dots':
      return m.pattern_dots();
    case 'pattern-cross':
      return m.pattern_cross();
    case 'pattern-triangle':
      return m.pattern_triangle();
    case 'pattern-square':
      return m.pattern_square();
    case 'pattern-diamond':
      return m.pattern_diamond();
    case 'pattern-plus':
      return m.pattern_plus();
    default:
      return m.color_palette();
  }
}

function filterByIndices<T>(source: readonly T[], indices: number[]): T[] {
  return indices.map((i) => source[i]).filter((v): v is T => v !== undefined);
}

function getQualitativePresetOptions(
  preset: QualitativePreset | undefined
): CategoricalColorOptions | undefined {
  if (preset === 'vif') return presets.vif;
  if (preset === 'pastel') return presets.pastel;
  if (preset === 'sepia') return presets.sepia;
  return undefined;
}

function extendQualitativeColors(
  baseColors: string[],
  generatedColors: string[],
  count: number
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const color of [...baseColors, ...generatedColors]) {
    const normalized = color.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    merged.push(color);
    if (merged.length === count) {
      return merged;
    }
  }

  if (merged.length === 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => {
    return merged[index % merged.length];
  });
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
        : preset === 'sepia'
          ? [...SEPIA_MIXTE_COLORS]
          : [...GRAYSCALE_COLORS];
  const chaud =
    preset === 'vif'
      ? [...VIF_CHAUD_COLORS]
      : preset === 'pastel'
        ? [...PASTEL_CHAUD_COLORS]
        : preset === 'sepia'
          ? [...SEPIA_CHAUD_COLORS]
          : [...GRAYSCALE_COLORS];
  const froid =
    preset === 'vif'
      ? [...VIF_FROID_COLORS]
      : preset === 'pastel'
        ? [...PASTEL_FROID_COLORS]
        : preset === 'sepia'
          ? [...SEPIA_FROID_COLORS]
          : [...GRAYSCALE_COLORS];

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

export function generateIntensityShadesForColor(seedHex: string): string[] {
  return generateIntensityShades(seedHex);
}

export function generateCategoricalColorsFromSeed(
  seedHex: string,
  count: number,
  preset: QualitativePreset = DEFAULT_QUALITATIVE_PRESET
): string[] {
  if (count <= 0) return [];
  if (count === 1) return [seedHex];
  if (preset === 'grayscale') {
    return generateSequentialFromColors(
      GRAYSCALE_COLORS[0],
      GRAYSCALE_COLORS[GRAYSCALE_COLORS.length - 1],
      count
    );
  }
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
