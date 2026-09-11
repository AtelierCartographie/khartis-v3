import { describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import { DEFAULT_VISUALIZATION_COLOR } from '$lib/features/commons/constants/colors.constants';
import { hexToOklchHue } from '$lib/features/commons/utils/color-utils';

vi.mock('@ateliercartographie/ok-palette', async () => {
  const divergentSequential = vi.fn(
    ({
      steps,
      hasCenterClass
    }: {
      steps: [number, number];
      hasCenterClass: boolean;
    }) =>
      Array.from(
        { length: steps[0] + steps[1] + (hasCenterClass ? 1 : 0) },
        (_, i) => `#mock-${i}`
      )
  );
  const actual = await vi.importActual<
    typeof import('@ateliercartographie/ok-palette')
  >('@ateliercartographie/ok-palette');
  return {
    ...actual,
    divergentSequential,
    resolvePalette: (colors: string[]) =>
      colors.map((_, i) => {
        const v = (i * 37) % 256;
        return [v, (v + 40) % 256, (v + 80) % 256, 255] as [
          number,
          number,
          number,
          number
        ];
      })
  };
});

vi.mock('@ateliercartographie/motif.js', () => ({
  motif: (config: { type: string; angle?: number }) => ({
    defs: {
      outerHTML: `<defs><pattern id="mock-${config.type}-${config.angle ?? 0}"></pattern></defs>`
    },
    url: `url(#mock-${config.type}-${config.angle ?? 0})`,
    tile: () => ({
      toDataURL: () =>
        `data:image/png;base64,MOCK_${config.type}_${config.angle ?? 0}`
    })
  })
}));

import {
  PALETTE_TYPE,
  monochromePalettes,
  sepiaPalettes,
  sequentialPalettes,
  divergingPalettes,
  qualitativePalettes,
  getPatternPalettes,
  generatePaletteColors,
  generateSequentialFromColor,
  generateSequentialFromColors,
  generateIntensityShades,
  generateCategoricalColorsFromSeed,
  getSuggestionPalettes,
  getPalettesForType,
  getQualitativeColorGroups,
  findPaletteById,
  getPaletteDisplayName,
  buildPatternBackground,
  DEFAULT_SEQUENTIAL_PREVIEW,
  DEFAULT_QUALITATIVE_PREVIEW,
  VIF_MIXTE_COLORS,
  VIF_CHAUD_COLORS,
  VIF_FROID_COLORS,
  PASTEL_MIXTE_COLORS,
  SEPIA_MIXTE_COLORS,
  type Palette
} from './palette.constants';
import { divergentSequential } from '@ateliercartographie/ok-palette';

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

describe('palette.constants — PALETTE_TYPE', () => {
  it('should expose the four palette types used by the popover title switch', () => {
    expect(PALETTE_TYPE.SEQUENTIAL).toBe('sequential');
    expect(PALETTE_TYPE.DIVERGING).toBe('diverging');
    expect(PALETTE_TYPE.QUALITATIVE).toBe('qualitative');
    expect(PALETTE_TYPE.PATTERN).toBe('pattern');
  });
});

describe('palette.constants — default previews', () => {
  it('should return four sequential preview colors in hex format', () => {
    expect(DEFAULT_SEQUENTIAL_PREVIEW).toHaveLength(4);
    DEFAULT_SEQUENTIAL_PREVIEW.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });

  it('should return four qualitative preview colors in hex format', () => {
    expect(DEFAULT_QUALITATIVE_PREVIEW).toHaveLength(4);
    expect(DEFAULT_QUALITATIVE_PREVIEW).toEqual([
      ...VIF_MIXTE_COLORS.slice(0, 4)
    ]);
    DEFAULT_QUALITATIVE_PREVIEW.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });
});

describe('palette.constants — palette collections', () => {
  it('should mark every monochrome palette as colorBlindSafe and SEQUENTIAL', () => {
    expect(monochromePalettes.length).toBeGreaterThan(0);
    monochromePalettes.forEach((p) => {
      expect(p.type).toBe(PALETTE_TYPE.SEQUENTIAL);
      expect(p.colorBlindSafe).toBe(true);
      expect(p.colors.length).toBe(1);
    });
  });

  it('should define sequential palettes with exactly two seed colors per palette', () => {
    expect(sequentialPalettes.length).toBeGreaterThan(0);
    sequentialPalettes.forEach((p) => {
      expect(p.type).toBe(PALETTE_TYPE.SEQUENTIAL);
      expect(p.colors.length).toBe(2);
    });
  });

  it('should mark all sepia palettes as colorBlindSafe', () => {
    expect(sepiaPalettes.length).toBeGreaterThan(0);
    sepiaPalettes.forEach((p) => expect(p.colorBlindSafe).toBe(true));
  });

  it('should define diverging palettes with three seed colors (start/middle/end)', () => {
    expect(divergingPalettes.length).toBeGreaterThan(0);
    divergingPalettes.forEach((p) => {
      expect(p.type).toBe(PALETTE_TYPE.DIVERGING);
      expect(p.colors.length).toBe(3);
    });
  });

  it('should define qualitative palettes with at least 3 distinct colors', () => {
    expect(qualitativePalettes.length).toBeGreaterThan(0);
    qualitativePalettes.forEach((p) => {
      expect(p.type).toBe(PALETTE_TYPE.QUALITATIVE);
      expect(p.colors.length).toBeGreaterThanOrEqual(3);
      expect(p.colorBlindSafe).toBe(true);
    });
  });

  it('should expose the Figma-aligned qualitative palette ids in dropdown order', () => {
    expect(qualitativePalettes.map((palette) => palette.id)).toEqual([
      'vif',
      'pastel',
      'sepia',
      'grayscale'
    ]);
  });
});

describe('palette.constants — getPatternPalettes', () => {
  it('should return pattern palettes with a patternId and PATTERN type', () => {
    const patterns = getPatternPalettes();
    expect(patterns.length).toBeGreaterThan(0);
    patterns.forEach((p) => {
      expect(p.type).toBe(PALETTE_TYPE.PATTERN);
      expect(p.patternId).toBeDefined();
      expect(p.id).toMatch(/^pattern-/);
    });
  });

  it('should expose the four line patterns expected by the angle selector', () => {
    const patterns = getPatternPalettes();
    const ids = patterns.map((p) => p.patternId);
    expect(ids).toContain('diagonal');
    expect(ids).toContain('diagonal-reverse');
    expect(ids).toContain('horizontal');
    expect(ids).toContain('vertical');
  });
});

describe('palette.constants — generatePaletteColors', () => {
  it('should return an empty array when count is 0', () => {
    const p = monochromePalettes[0];
    expect(generatePaletteColors(p, 0)).toEqual([]);
  });

  it('should return a single color when count is 1', () => {
    const p = monochromePalettes[0];
    const result = generatePaletteColors(p, 1);
    expect(result).toEqual([p.colors[0]]);
  });

  it('should generate N hex colors for a SEQUENTIAL monochrome palette', () => {
    const p = monochromePalettes[0];
    const result = generatePaletteColors(p, 5);
    expect(result).toHaveLength(5);
    result.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });

  it('should generate N hex colors for a SEQUENTIAL bicolor palette', () => {
    const p = sequentialPalettes[0];
    const result = generatePaletteColors(p, 7);
    expect(result).toHaveLength(7);
    result.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });

  it('should generate N hex colors for a DIVERGING palette', () => {
    const p = divergingPalettes[0];
    const result = generatePaletteColors(p, 5);
    expect(result).toHaveLength(5);
    result.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });

  it('should forward an asymmetric diverging split to ok-palette for custom diverging palettes', () => {
    const p = divergingPalettes[0];
    generatePaletteColors(p, 5, undefined, undefined, {
      lowerCount: 1,
      upperCount: 3,
      hasCenterClass: true
    });

    expect(vi.mocked(divergentSequential)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        steps: [1, 3],
        hasCenterClass: true
      })
    );
  });

  it('should slice QUALITATIVE palette colors when count <= palette length', () => {
    const p = qualitativePalettes[0];
    const result = generatePaletteColors(p, 3);
    expect(result).toEqual(p.colors.slice(0, 3));
  });

  it('should extend QUALITATIVE palette colors when count exceeds palette length', () => {
    const p = qualitativePalettes[0];
    const result = generatePaletteColors(p, p.colors.length + 5);
    expect(result).toHaveLength(p.colors.length + 5);
    result.forEach((c) => expect(c).toMatch(HEX_REGEX));
    expect(result.slice(0, p.colors.length)).toEqual(p.colors);
  });

  it('should preserve the seed order before appending generated QUALITATIVE colors', () => {
    const p = qualitativePalettes[0];
    const count = p.colors.length + 3;
    const result = generatePaletteColors(p, count);
    expect(result).toHaveLength(count);
    expect(result.slice(0, p.colors.length)).toEqual(p.colors);
    expect(result[p.colors.length]).not.toBeUndefined();
  });

  it('should keep each QUALITATIVE palette own seeds on overflow across every qualitative palette', () => {
    for (const palette of qualitativePalettes) {
      const result = generatePaletteColors(palette, palette.colors.length + 10);
      expect(result.slice(0, palette.colors.length)).toEqual(palette.colors);
    }
  });

  it('should expand PATTERN palettes into a ramp matching the class count', () => {
    const p = getPatternPalettes()[0];
    const result = generatePaletteColors(p, 3);
    expect(result).toHaveLength(3);
    result.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });

  it('should accept a contrast parameter and still return N hex colors', () => {
    const p = monochromePalettes[0];
    const normal = generatePaletteColors(p, 5);
    const high = generatePaletteColors(p, 5, 'high');
    expect(normal).toHaveLength(5);
    expect(high).toHaveLength(5);
    normal.forEach((c) => expect(c).toMatch(HEX_REGEX));
    high.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });
});

describe('palette.constants — generateSequentialFromColor', () => {
  it('should return an empty array when count is 0', () => {
    expect(generateSequentialFromColor('#08519c', 0)).toEqual([]);
  });

  it('should generate N hex colors starting from a single seed', () => {
    const result = generateSequentialFromColor('#08519c', 5);
    expect(result).toHaveLength(5);
    result.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });
});

describe('palette.constants — generateSequentialFromColors', () => {
  it('should return an empty array when count is 0', () => {
    expect(generateSequentialFromColors('#fff', '#000', 0)).toEqual([]);
  });

  it('should generate N hex colors interpolating between two seeds', () => {
    const result = generateSequentialFromColors('#ffffff', '#08519c', 6);
    expect(result).toHaveLength(6);
    result.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });
});

describe('palette.constants — generateIntensityShades', () => {
  it('should return exactly 7 intensity shades for the color unique section', () => {
    const shades = generateIntensityShades('#f287ac');
    expect(shades).toHaveLength(7);
    shades.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });
});

describe('palette.constants — getSuggestionPalettes', () => {
  it('should return monochrome palettes for the monochrome preset', () => {
    const result = getSuggestionPalettes('monochrome', false);
    expect(result).toEqual(monochromePalettes);
  });

  it('should return bicolor palettes for the bicolor preset', () => {
    const result = getSuggestionPalettes('bicolor', false);
    expect(result).toEqual(sequentialPalettes);
  });

  it('should return sepia palettes for the sepia preset', () => {
    const result = getSuggestionPalettes('sepia', false);
    expect(result).toEqual(sepiaPalettes);
  });

  it('should filter to colorBlindSafe palettes only when colorBlindFilter is true', () => {
    const filtered = getSuggestionPalettes('monochrome', true);
    expect(filtered.every((p: Palette) => p.colorBlindSafe)).toBe(true);
  });
});

describe('palette.constants — getPalettesForType', () => {
  it('should return sequential palettes for PALETTE_TYPE.SEQUENTIAL', () => {
    expect(getPalettesForType(PALETTE_TYPE.SEQUENTIAL, false)).toEqual(
      sequentialPalettes
    );
  });

  it('should return diverging palettes for PALETTE_TYPE.DIVERGING', () => {
    expect(getPalettesForType(PALETTE_TYPE.DIVERGING, false)).toEqual(
      divergingPalettes
    );
  });

  it('should return qualitative palettes for PALETTE_TYPE.QUALITATIVE', () => {
    expect(getPalettesForType(PALETTE_TYPE.QUALITATIVE, false)).toEqual(
      qualitativePalettes
    );
  });

  it('should return pattern palettes for PALETTE_TYPE.PATTERN', () => {
    expect(getPalettesForType(PALETTE_TYPE.PATTERN, false)).toEqual(
      getPatternPalettes()
    );
  });

  it('should filter to colorBlindSafe palettes only when colorBlindFilter is true', () => {
    const filtered = getPalettesForType(PALETTE_TYPE.QUALITATIVE, true);
    expect(filtered.every((p: Palette) => p.colorBlindSafe)).toBe(true);
  });
});

describe('palette.constants — diverging colour-blind-safe flags are truthful', () => {
  const flagFor = (id: string) =>
    divergingPalettes.find((p) => p.id === id)?.colorBlindSafe;

  it('should mark the red-green rdylgn and piyg ramps as not colour-blind-safe', () => {
    expect(flagFor('rdylgn')).toBe(false);
    expect(flagFor('piyg')).toBe(false);
  });

  it('should mark rdbu, brbg and prgn as colour-blind-safe', () => {
    expect(flagFor('rdbu')).toBe(true);
    expect(flagFor('brbg')).toBe(true);
    expect(flagFor('prgn')).toBe(true);
  });

  it('should exclude rdylgn and piyg from getPalettesForType under the colour-blind filter', () => {
    const ids = getPalettesForType(PALETTE_TYPE.DIVERGING, true).map(
      (p) => p.id
    );
    expect(ids).not.toContain('rdylgn');
    expect(ids).not.toContain('piyg');
    expect(ids).toContain('rdbu');
    expect(ids).toContain('brbg');
    expect(ids).toContain('prgn');
  });
});

describe('palette.constants — findPaletteById', () => {
  it('should find a palette across all collections by id', () => {
    expect(findPaletteById(monochromePalettes[0].id)?.id).toBe(
      monochromePalettes[0].id
    );
    expect(findPaletteById(sequentialPalettes[0].id)?.id).toBe(
      sequentialPalettes[0].id
    );
    expect(findPaletteById(divergingPalettes[0].id)?.id).toBe(
      divergingPalettes[0].id
    );
    expect(findPaletteById(qualitativePalettes[0].id)?.id).toBe(
      qualitativePalettes[0].id
    );
  });

  it('should find a pattern palette by its pattern- prefixed id', () => {
    const first = getPatternPalettes()[0];
    expect(findPaletteById(first.id)?.id).toBe(first.id);
  });

  it('should resolve legacy qualitative palette ids to the new Figma presets', () => {
    expect(findPaletteById('set1')?.id).toBe('vif');
    expect(findPaletteById('set2')?.id).toBe('pastel');
    expect(findPaletteById('dark')?.id).toBe('sepia');
    expect(findPaletteById('categorical-set1')?.id).toBe('vif');
    expect(findPaletteById('categorical-set2')?.id).toBe('pastel');
  });

  it('should return undefined for an unknown palette id', () => {
    expect(findPaletteById('unknown-palette-id')).toBeUndefined();
  });
});

describe('palette.constants — getPaletteDisplayName', () => {
  it('should resolve a translated display name for every exported palette', () => {
    const palettes = [
      ...monochromePalettes,
      ...sequentialPalettes,
      ...sepiaPalettes,
      ...divergingPalettes,
      ...qualitativePalettes,
      ...getPatternPalettes()
    ];

    palettes.forEach((palette) => {
      expect(getPaletteDisplayName(palette)).toBeTruthy();
    });
  });

  it('should return a translated generic fallback for an unknown palette id', () => {
    expect(
      getPaletteDisplayName({
        id: 'unknown-id',
        colors: ['#000000'],
        type: PALETTE_TYPE.SEQUENTIAL
      })
    ).toBe(m.color_palette());
  });
});

describe('palette.constants — qualitative preset constants', () => {
  it('should start the Vif Mixte band on the Khartis signature hue', () => {
    const SRGB_CLIPPING_HUE_TOLERANCE_DEGREES = 10;
    const drift = Math.abs(
      hexToOklchHue(VIF_MIXTE_COLORS[0]) -
        hexToOklchHue(DEFAULT_VISUALIZATION_COLOR)
    );

    expect(drift).toBeLessThan(SRGB_CLIPPING_HUE_TOLERANCE_DEGREES);
  });

  it('should expose 5 Vif Mixte colors', () => {
    expect(VIF_MIXTE_COLORS).toHaveLength(5);
    VIF_MIXTE_COLORS.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });

  it('should expose 5 Vif Chaud colors and 5 Vif Froid colors', () => {
    expect(VIF_CHAUD_COLORS).toHaveLength(5);
    expect(VIF_FROID_COLORS).toHaveLength(5);
    VIF_CHAUD_COLORS.forEach((c) => expect(c).toMatch(HEX_REGEX));
    VIF_FROID_COLORS.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });

  it('should expose 5 Pastel Mixte and 5 Sépia Mixte colors', () => {
    expect(PASTEL_MIXTE_COLORS).toHaveLength(5);
    expect(SEPIA_MIXTE_COLORS).toHaveLength(5);
    PASTEL_MIXTE_COLORS.forEach((c) => expect(c).toMatch(HEX_REGEX));
    SEPIA_MIXTE_COLORS.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });
});

describe('palette.constants — getQualitativeColorGroups', () => {
  it('should return 5-color Mixte/Chaud/Froid groups for the Vif preset', () => {
    const groups = getQualitativeColorGroups('vif', false);
    expect(groups.mixte).toEqual([...VIF_MIXTE_COLORS]);
    expect(groups.chaud).toEqual([...VIF_CHAUD_COLORS]);
    expect(groups.froid).toEqual([...VIF_FROID_COLORS]);
  });

  it('should return Pastel groups for the pastel preset', () => {
    const groups = getQualitativeColorGroups('pastel', false);
    expect(groups.mixte).toEqual([...PASTEL_MIXTE_COLORS]);
  });

  it('should return Sépia groups for the sepia preset', () => {
    const groups = getQualitativeColorGroups('sepia', false);
    expect(groups.mixte).toEqual([...SEPIA_MIXTE_COLORS]);
  });

  it('should filter to colorblind-safe subsets when colorBlindFilter is true', () => {
    const all = getQualitativeColorGroups('vif', false);
    const safe = getQualitativeColorGroups('vif', true);
    expect(safe.mixte.length).toBeLessThanOrEqual(all.mixte.length);
    expect(safe.chaud.length).toBeLessThanOrEqual(all.chaud.length);
    expect(safe.froid.length).toBeLessThanOrEqual(all.froid.length);
  });
});

describe('palette.constants — generateIntensityShades', () => {
  it('should generate 7 shades from a seed color', () => {
    const shades = generateIntensityShades('#f287ac');
    expect(shades).toHaveLength(7);
  });
});

describe('palette.constants — generateCategoricalColorsFromSeed', () => {
  it('should return an empty array for count <= 0', () => {
    expect(generateCategoricalColorsFromSeed('#f287ac', 0)).toEqual([]);
  });

  it('should return the seed itself for count === 1', () => {
    expect(generateCategoricalColorsFromSeed('#f287ac', 1)).toEqual([
      '#f287ac'
    ]);
  });

  it('should return N hex colors when count > 1 under the Vif preset', () => {
    const colors = generateCategoricalColorsFromSeed('#f287ac', 5, 'vif');
    expect(colors).toHaveLength(5);
    colors.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });

  it('should accept a seed without a hash prefix', () => {
    const colors = generateCategoricalColorsFromSeed('f287ac', 5, 'vif');
    expect(colors).toHaveLength(5);
    colors.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });

  it('should return N hex colors regardless of preset', () => {
    const vif = generateCategoricalColorsFromSeed('#f287ac', 4, 'vif');
    const pastel = generateCategoricalColorsFromSeed('#f287ac', 4, 'pastel');
    expect(vif).toHaveLength(4);
    expect(pastel).toHaveLength(4);
    vif.forEach((c) => expect(c).toMatch(HEX_REGEX));
    pastel.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });
});

describe('palette.constants — buildPatternBackground', () => {
  it('should return an SVG data-URL background for a pattern palette', () => {
    const p = getPatternPalettes().find((x) => x.patternId === 'diagonal')!;
    const bg = buildPatternBackground(p);
    expect(bg).toMatch(/^url\("data:image\/svg\+xml,/);
  });

  it('should honor the angle override by mapping to the corresponding patternId', () => {
    const p = getPatternPalettes().find((x) => x.patternId === 'diagonal')!;
    const bgHorizontal = buildPatternBackground(p, {
      angle: 0,
      size: 4,
      scale: 8
    });
    const bgDiagonal = buildPatternBackground(p, {
      angle: 45,
      size: 4,
      scale: 8
    });
    expect(bgHorizontal).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(bgDiagonal).toMatch(/^url\("data:image\/svg\+xml,/);
    expect(bgHorizontal).not.toBe(bgDiagonal);
  });
});
