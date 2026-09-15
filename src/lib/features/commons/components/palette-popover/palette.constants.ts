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
import {
  PatternType,
  type PatternParams,
  type PatternShape
} from '$lib/features/commons/constants/pattern.constants';
import type { ClassPattern } from '$lib/features/commons/services/pattern-palette.service';
import {
  hexToOklchHue,
  webglToHex
} from '$lib/features/commons/utils/color-utils';
import { DEFAULT_VISUALIZATION_COLOR } from '$lib/features/commons/constants/colors.constants';
import {
  resolveMotifOptions,
  type PatternName
} from '$lib/features/map/layers/pattern-texture';
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
import {
  COLORBLIND_DIVERGING_PAIRS,
  COLORBLIND_SEQUENTIAL_SEEDS,
  TOL_MUTED_COLORS,
  WONG_COLORS
} from '$lib/features/commons/constants/colorblind-palette.constants';

export type { PatternParams };
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
  '#c2e7ff',
  '#89c1ed',
  '#4d9bd4',
  '#0076ba'
];

export const DEFAULT_QUALITATIVE_PREVIEW = [...VIF_MIXTE_COLORS.slice(0, 4)];

// Catégories ordonnées (QLO) : l'ordre se dit avec la valeur, pas avec la teinte,
// donc une rampe séquentielle échantillonnée sur le nombre de catégories. Teinte
// distincte du défaut choroplèthe (« blues ») pour que les deux traitements
// restent lisibles l'un à côté de l'autre.
export const ORDERED_CATEGORY_PALETTE_ID = 'purples';

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

const PATTERN_TYPE_TO_PATTERN_ID: Record<PatternType, PatternId> = {
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
  patternId?: PatternId;
  qualitativePreset?: QualitativePreset;
}

export interface DivergingPaletteSplit {
  lowerCount: number;
  upperCount: number;
  hasCenterClass: boolean;
}

export const SUGGESTION_PRESET = {
  MONOCHROME: 'monochrome',
  BICOLOR: 'bicolor',
  SEPIA: 'sepia',
  GRAYSCALE: 'grayscale',
  VIF: 'vif',
  PASTEL: 'pastel',
  COLORBLIND: 'colorblind'
} as const;

export type SuggestionPreset =
  (typeof SUGGESTION_PRESET)[keyof typeof SUGGESTION_PRESET];

export type QualitativePreset = 'vif' | 'pastel' | 'sepia' | 'grayscale';

export interface QualitativeColorBand {
  key: string;
  label: string;
  colors: string[];
}

export const monochromePalettes: Palette[] = [
  {
    id: 'mono-khartis',
    colors: [DEFAULT_VISUALIZATION_COLOR],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'mono-pink',
    colors: ['#c2185b'],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'mono-teal',
    colors: ['#00897b'],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'mono-gold',
    colors: ['#f9a825'],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'mono-indigo',
    colors: ['#1565c0'],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'mono-vermilion',
    colors: ['#d84315'],
    type: PALETTE_TYPE.SEQUENTIAL
  }
];

const bicolorPalettes: Palette[] = [
  {
    id: 'blues',
    colors: ['#f7fbff', DEFAULT_VISUALIZATION_COLOR],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'greens',
    colors: ['#f7fcf5', '#006d2c'],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'oranges',
    colors: ['#fff5eb', '#a63603'],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'purples',
    colors: ['#fcfbfd', '#54278f'],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'reds',
    colors: ['#fff5f0', '#a50f15'],
    type: PALETTE_TYPE.SEQUENTIAL
  }
];

export const sepiaPalettes: Palette[] = [
  {
    id: 'sepia-sand',
    colors: ['#d7ccc8'],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'sepia-terre',
    colors: ['#8d6e63'],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'sepia-ochre',
    colors: ['#bf8f00'],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'sepia-brique',
    colors: ['#a1887f'],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'sepia-olive',
    colors: ['#827717'],
    type: PALETTE_TYPE.SEQUENTIAL
  }
];

export const grayscalePalettes: Palette[] = [
  {
    id: 'grays',
    colors: [
      GRAYSCALE_COLORS[0],
      GRAYSCALE_COLORS[GRAYSCALE_COLORS.length - 1]
    ],
    type: PALETTE_TYPE.SEQUENTIAL
  }
];

export const colorblindSequentialPalettes: Palette[] = [
  {
    id: 'cb-blue',
    colors: [COLORBLIND_SEQUENTIAL_SEEDS.blue],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'cb-vermilion',
    colors: [COLORBLIND_SEQUENTIAL_SEEDS.vermilion],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'cb-green',
    colors: [COLORBLIND_SEQUENTIAL_SEEDS.green],
    type: PALETTE_TYPE.SEQUENTIAL
  },
  {
    id: 'cb-indigo',
    colors: [COLORBLIND_SEQUENTIAL_SEEDS.indigo],
    type: PALETTE_TYPE.SEQUENTIAL
  }
];

export const sequentialPalettes: Palette[] = [
  ...bicolorPalettes,
  ...grayscalePalettes
];

const divergingVifPalettes: Palette[] = [
  {
    id: 'rdbu',
    colors: ['#b2182b', '#f7f7f7', '#2166ac'],
    type: PALETTE_TYPE.DIVERGING
  },
  {
    id: 'rdylgn',
    colors: ['#d73027', '#ffffbf', '#1a9850'],
    type: PALETTE_TYPE.DIVERGING
  },
  {
    id: 'piyg',
    colors: ['#c51b7d', '#f7f7f7', '#4d9221'],
    type: PALETTE_TYPE.DIVERGING
  },
  {
    id: 'prgn',
    colors: ['#7b3294', '#f7f7f7', '#008837'],
    type: PALETTE_TYPE.DIVERGING
  }
];

const divergingSepiaPalettes: Palette[] = [
  {
    id: 'brbg',
    colors: ['#8c510a', '#f5f5f5', '#01665e'],
    type: PALETTE_TYPE.DIVERGING
  },
  {
    id: 'sepia-ochre-slate',
    colors: ['#bf8f00', '#f2efe9', '#4a5d7e'],
    type: PALETTE_TYPE.DIVERGING
  },
  {
    id: 'sepia-brick-olive',
    colors: ['#a1887f', '#f2efe9', '#827717'],
    type: PALETTE_TYPE.DIVERGING
  }
];

export const colorblindDivergingPalettes: Palette[] = [
  {
    id: 'cb-prgn',
    colors: [...COLORBLIND_DIVERGING_PAIRS.prgn],
    type: PALETTE_TYPE.DIVERGING
  },
  {
    id: 'cb-burd',
    colors: [...COLORBLIND_DIVERGING_PAIRS.burd],
    type: PALETTE_TYPE.DIVERGING
  },
  {
    id: 'cb-orin',
    colors: [...COLORBLIND_DIVERGING_PAIRS.orin],
    type: PALETTE_TYPE.DIVERGING
  }
];

export const divergingPalettes: Palette[] = [
  ...divergingVifPalettes,
  ...divergingSepiaPalettes,
  ...colorblindDivergingPalettes
];

export const colorblindQualitativePalettes: Palette[] = [
  {
    id: 'cb-wong',
    colors: [...WONG_COLORS],
    type: PALETTE_TYPE.QUALITATIVE
  },
  {
    id: 'cb-tol',
    colors: [...TOL_MUTED_COLORS],
    type: PALETTE_TYPE.QUALITATIVE
  }
];

export const qualitativePalettes: Palette[] = [
  {
    id: 'vif',
    colors: [...VIF_ALL_COLORS],
    type: PALETTE_TYPE.QUALITATIVE,
    qualitativePreset: 'vif'
  },
  {
    id: 'pastel',
    colors: [...PASTEL_ALL_COLORS],
    type: PALETTE_TYPE.QUALITATIVE,
    qualitativePreset: 'pastel'
  },
  {
    id: 'sepia',
    colors: [...SEPIA_ALL_COLORS],
    type: PALETTE_TYPE.QUALITATIVE,
    qualitativePreset: 'sepia'
  },
  ...colorblindQualitativePalettes
];

// Grayscale is no longer offered for qualitative data (greys order, they do not
// separate), but projects saved with it must still resolve their palette.
const legacyQualitativePalettes: Palette[] = [
  {
    id: 'grayscale',
    colors: [...GRAYSCALE_COLORS],
    type: PALETTE_TYPE.QUALITATIVE,
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
      patternId: 'diagonal'
    },
    {
      id: 'pattern-diagonal-reverse',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      patternId: 'diagonal-reverse'
    },
    {
      id: 'pattern-horizontal',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      patternId: 'horizontal'
    },
    {
      id: 'pattern-vertical',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      patternId: 'vertical'
    },
    {
      id: 'pattern-dots',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      patternId: 'dots'
    },
    {
      id: 'pattern-cross',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      patternId: 'cross'
    },
    {
      id: 'pattern-triangle',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      patternId: 'triangle'
    },
    {
      id: 'pattern-square',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      patternId: 'square'
    },
    {
      id: 'pattern-diamond',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
      patternId: 'diamond'
    },
    {
      id: 'pattern-plus',
      colors: ['#3d3d3d', '#f4f4f4'],
      type: PALETTE_TYPE.PATTERN,
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
      // Pattern palettes carry [accent, base] grays; expand them into a
      // light-to-dark ramp so the classification keeps its class count.
      return generateSequentialFromColors(
        palette.colors[1] ?? '#f4f4f4',
        palette.colors[0] ?? '#3d3d3d',
        count,
        contrast
      );
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

const PATTERN_BACKGROUND_SVG_WIDTH = 320;
const PATTERN_BACKGROUND_SVG_HEIGHT = 40;

/**
 * Builds a CSS background rendering a motif with its true rotation and design
 * tile size (canvas tiles are devicePixelRatio-scaled and unrotated, so they
 * cannot be used directly). The SVG spans the widest swatch in the popover so
 * rotated patterns never hit a visible repeat seam.
 */
export function buildPatternSvgBackground(
  patternId: PatternId,
  patternColor: string,
  backgroundColor: string,
  params?: PatternParams,
  opacity = 1
): string {
  const pattern = motif({
    ...resolveMotifOptions(patternId as PatternName, params),
    fill: patternColor,
    background: backgroundColor
  });
  const fillOpacity = opacity < 1 ? ` opacity="${opacity}"` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PATTERN_BACKGROUND_SVG_WIDTH}" height="${PATTERN_BACKGROUND_SVG_HEIGHT}">${pattern.defs.outerHTML}<rect width="100%" height="100%" fill="${pattern.url}"${fillOpacity}/></svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function resolveEffectivePatternId(
  patternId: PatternId | undefined,
  params?: PatternParams
): PatternId {
  if (params?.angle === 0) return 'horizontal';
  if (params?.angle === 45) return 'diagonal';
  if (params?.angle === 315) return 'diagonal-reverse';
  return patternId ?? 'diagonal';
}

export function buildPatternBackground(
  palette: Palette,
  params?: PatternParams
): string {
  const accent = palette.colors[0] ?? '#3d3d3d';
  const base = palette.colors[1] ?? '#f4f4f4';
  const effectivePatternId = resolveEffectivePatternId(
    palette.patternId,
    params
  );

  return buildPatternSvgBackground(effectivePatternId, accent, base, params);
}

export function buildClassPatternSvgBackground(
  pattern: ClassPattern,
  background = '#ffffff',
  opacity = 1
): string {
  const rendered = motif({
    type: pattern.type as PatternShape,
    angle: pattern.angle,
    scale: pattern.scale,
    size: pattern.size,
    fill: pattern.fill,
    background: 'transparent',
    patchSize: pattern.patchSize
  });
  const fillOpacity = opacity < 1 ? ` opacity="${opacity}"` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PATTERN_BACKGROUND_SVG_WIDTH}" height="${PATTERN_BACKGROUND_SVG_HEIGHT}">${rendered.defs.outerHTML}<rect width="100%" height="100%" fill="${background}"/><rect width="100%" height="100%" fill="${rendered.url}"${fillOpacity}/></svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function buildShapeSwatchBackground(
  shape: PatternShape,
  color = '#161616'
): string {
  if (shape === 'line') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><line x1="4" y1="16" x2="16" y2="4" stroke="${color}" stroke-width="3" stroke-linecap="round"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  const rendered = motif({
    type: shape,
    angle: 0,
    scale: 2,
    size: 30,
    fill: color,
    background: 'transparent'
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">${rendered.defs.outerHTML}<rect width="100%" height="100%" fill="${rendered.url}"/></svg>`;

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
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

const SUGGESTION_PRESETS_BY_TYPE: Record<PaletteType, SuggestionPreset[]> = {
  [PALETTE_TYPE.SEQUENTIAL]: [
    SUGGESTION_PRESET.MONOCHROME,
    SUGGESTION_PRESET.BICOLOR,
    SUGGESTION_PRESET.SEPIA,
    SUGGESTION_PRESET.COLORBLIND,
    SUGGESTION_PRESET.GRAYSCALE
  ],
  [PALETTE_TYPE.DIVERGING]: [
    SUGGESTION_PRESET.VIF,
    SUGGESTION_PRESET.SEPIA,
    SUGGESTION_PRESET.COLORBLIND
  ],
  [PALETTE_TYPE.QUALITATIVE]: [
    SUGGESTION_PRESET.VIF,
    SUGGESTION_PRESET.PASTEL,
    SUGGESTION_PRESET.SEPIA,
    SUGGESTION_PRESET.COLORBLIND
  ],
  [PALETTE_TYPE.PATTERN]: [SUGGESTION_PRESET.MONOCHROME]
};

const SEQUENTIAL_SUGGESTIONS: Partial<Record<SuggestionPreset, Palette[]>> = {
  [SUGGESTION_PRESET.MONOCHROME]: monochromePalettes,
  [SUGGESTION_PRESET.BICOLOR]: bicolorPalettes,
  [SUGGESTION_PRESET.SEPIA]: sepiaPalettes,
  [SUGGESTION_PRESET.COLORBLIND]: colorblindSequentialPalettes,
  [SUGGESTION_PRESET.GRAYSCALE]: grayscalePalettes
};

const DIVERGING_SUGGESTIONS: Partial<Record<SuggestionPreset, Palette[]>> = {
  [SUGGESTION_PRESET.VIF]: divergingVifPalettes,
  [SUGGESTION_PRESET.SEPIA]: divergingSepiaPalettes,
  [SUGGESTION_PRESET.COLORBLIND]: colorblindDivergingPalettes
};

export function getSuggestionPresetsForType(
  type: PaletteType
): SuggestionPreset[] {
  return (
    SUGGESTION_PRESETS_BY_TYPE[type] ?? SUGGESTION_PRESETS_BY_TYPE.sequential
  );
}

export function getSuggestionPresetLabel(preset: SuggestionPreset): string {
  switch (preset) {
    case SUGGESTION_PRESET.MONOCHROME:
      return m.preset_monochrome();
    case SUGGESTION_PRESET.BICOLOR:
      return m.preset_bicolor();
    case SUGGESTION_PRESET.SEPIA:
      return m.preset_sepia();
    case SUGGESTION_PRESET.GRAYSCALE:
      return m.preset_grayscale();
    case SUGGESTION_PRESET.VIF:
      return m.preset_vif();
    case SUGGESTION_PRESET.PASTEL:
      return m.preset_pastel();
    case SUGGESTION_PRESET.COLORBLIND:
      return m.preset_colorblind();
  }
}

export function getSuggestionPalettes(
  type: PaletteType,
  preset: SuggestionPreset
): Palette[] {
  const source =
    type === PALETTE_TYPE.DIVERGING
      ? DIVERGING_SUGGESTIONS
      : SEQUENTIAL_SUGGESTIONS;
  const palettes = source[preset];
  if (palettes) {
    return palettes;
  }
  return source[getSuggestionPresetsForType(type)[0]] ?? [];
}

export function getPalettesForType(type: PaletteType): Palette[] {
  switch (type) {
    case PALETTE_TYPE.DIVERGING:
      return divergingPalettes;
    case PALETTE_TYPE.QUALITATIVE:
      return qualitativePalettes;
    case PALETTE_TYPE.PATTERN:
      return getPatternPalettes();
    default:
      return sequentialPalettes;
  }
}

// Every palette a suggestion or a dropdown can hand out must be findable here:
// a palette id that does not resolve makes the classification fall back to the
// default ramp, silently discarding the user's choice.
const ADDRESSABLE_PALETTES: Palette[] = [
  ...monochromePalettes,
  ...sequentialPalettes,
  ...sepiaPalettes,
  ...colorblindSequentialPalettes,
  ...divergingPalettes,
  ...qualitativePalettes,
  ...legacyQualitativePalettes
];

export function findPaletteById(id: string): Palette | undefined {
  const resolvedId = normalizePaletteId(id) ?? id;
  return (
    ADDRESSABLE_PALETTES.find((p) => p.id === resolvedId) ??
    getPatternPalettes().find((p) => p.id === resolvedId)
  );
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
    case 'mono-khartis':
      return m.palette_name_mono_khartis();
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
    case 'sepia-ochre-slate':
      return m.palette_name_sepia_ochre_slate();
    case 'sepia-brick-olive':
      return m.palette_name_sepia_brick_olive();
    case 'grays':
      return m.preset_grayscale();
    case 'cb-blue':
      return m.palette_name_cb_blue();
    case 'cb-vermilion':
      return m.palette_name_cb_vermilion();
    case 'cb-green':
      return m.palette_name_cb_green();
    case 'cb-indigo':
      return m.palette_name_cb_indigo();
    case 'cb-prgn':
      return m.palette_name_cb_prgn();
    case 'cb-burd':
      return m.palette_name_cb_burd();
    case 'cb-orin':
      return m.palette_name_cb_orin();
    case 'cb-wong':
      return m.palette_name_cb_wong();
    case 'cb-tol':
      return m.palette_name_cb_tol();
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

const QUALITATIVE_PRESET_BANDS: Record<
  QualitativePreset,
  readonly (readonly string[])[]
> = {
  vif: [VIF_MIXTE_COLORS, VIF_CHAUD_COLORS, VIF_FROID_COLORS],
  pastel: [PASTEL_MIXTE_COLORS, PASTEL_CHAUD_COLORS, PASTEL_FROID_COLORS],
  sepia: [SEPIA_MIXTE_COLORS, SEPIA_CHAUD_COLORS, SEPIA_FROID_COLORS],
  grayscale: [GRAYSCALE_COLORS, GRAYSCALE_COLORS, GRAYSCALE_COLORS]
};

export function resolveQualitativeGeneratorPreset(
  preset: SuggestionPreset
): QualitativePreset {
  return preset === SUGGESTION_PRESET.PASTEL ||
    preset === SUGGESTION_PRESET.SEPIA ||
    preset === SUGGESTION_PRESET.GRAYSCALE
    ? preset
    : DEFAULT_QUALITATIVE_PRESET;
}

export function getQualitativeColorBands(
  preset: SuggestionPreset
): QualitativeColorBand[] {
  if (preset === SUGGESTION_PRESET.COLORBLIND) {
    return colorblindQualitativePalettes.map((palette) => ({
      key: palette.id,
      label: getPaletteDisplayName(palette),
      colors: [...palette.colors]
    }));
  }

  const [mixte, chaud, froid] =
    QUALITATIVE_PRESET_BANDS[resolveQualitativeGeneratorPreset(preset)];

  return [
    { key: 'mixte', label: m.palette_theme_mixte(), colors: [...mixte] },
    { key: 'chaud', label: m.palette_theme_chaud(), colors: [...chaud] },
    { key: 'froid', label: m.palette_theme_froid(), colors: [...froid] }
  ];
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
  return hexToOklchHue(hex.startsWith('#') ? hex : `#${hex}`);
}
