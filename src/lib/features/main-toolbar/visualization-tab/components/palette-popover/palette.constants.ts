import * as m from '$lib/paraglide/messages';

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

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : { r: 0, g: 0, b: 0 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function interpolateColors(colors: string[], count: number): string[] {
  if (colors.length === count) return colors;
  if (colors.length >= count) return colors.slice(0, count);

  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const idx = t * (colors.length - 1);
    const lowIdx = Math.floor(idx);
    const highIdx = Math.min(lowIdx + 1, colors.length - 1);
    const frac = idx - lowIdx;

    if (frac === 0) {
      result.push(colors[lowIdx]);
    } else {
      const c1 = hexToRgb(colors[lowIdx]);
      const c2 = hexToRgb(colors[highIdx]);
      const r = Math.round(c1.r + (c2.r - c1.r) * frac);
      const g = Math.round(c1.g + (c2.g - c1.g) * frac);
      const b = Math.round(c1.b + (c2.b - c1.b) * frac);
      result.push(rgbToHex(r, g, b));
    }
  }
  return result;
}

export function buildPatternBackground(palette: Palette): string {
  const accent = palette.colors[0] ?? '#3d3d3d';
  const base = palette.colors[1] ?? '#f4f4f4';
  switch (palette.patternId) {
    case 'horizontal':
      return `repeating-linear-gradient(0deg, ${accent} 0 4px, ${base} 4px 8px)`;
    case 'vertical':
      return `repeating-linear-gradient(90deg, ${accent} 0 4px, ${base} 4px 8px)`;
    case 'dots':
      return `radial-gradient(${accent} 16%, transparent 17%), linear-gradient(${base}, ${base})`;
    case 'cross':
      return `repeating-linear-gradient(0deg, transparent 0 5px, ${accent} 5px 7px), repeating-linear-gradient(90deg, transparent 0 5px, ${accent} 5px 7px), linear-gradient(${base}, ${base})`;
    case 'diagonal-reverse':
      return `repeating-linear-gradient(315deg, ${accent} 0 4px, ${base} 4px 8px)`;
    case 'diagonal':
    default:
      return `repeating-linear-gradient(45deg, ${accent} 0 4px, ${base} 4px 8px)`;
  }
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
