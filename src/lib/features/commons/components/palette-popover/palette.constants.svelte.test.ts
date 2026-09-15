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
  getSuggestionPresetsForType,
  getPalettesForType,
  getQualitativeColorBands,
  grayscalePalettes,
  colorblindSequentialPalettes,
  colorblindDivergingPalettes,
  colorblindQualitativePalettes,
  SUGGESTION_PRESET,
  findPaletteById,
  getPaletteDisplayName,
  buildPatternBackground,
  DEFAULT_SEQUENTIAL_PREVIEW,
  DEFAULT_QUALITATIVE_PREVIEW,
  VIF_MIXTE_COLORS,
  VIF_CHAUD_COLORS,
  VIF_FROID_COLORS,
  PASTEL_MIXTE_COLORS,
  SEPIA_MIXTE_COLORS
} from './palette.constants';
import {
  TOL_MUTED_COLORS,
  WONG_COLORS
} from '$lib/features/commons/constants/colorblind-palette.constants';
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
  it('should define every monochrome palette as a single-seed SEQUENTIAL ramp', () => {
    expect(monochromePalettes.length).toBeGreaterThan(0);
    monochromePalettes.forEach((p) => {
      expect(p.type).toBe(PALETTE_TYPE.SEQUENTIAL);
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

  it('should define diverging palettes with both extreme seed colors', () => {
    expect(divergingPalettes.length).toBeGreaterThan(0);
    divergingPalettes.forEach((p) => {
      expect(p.type).toBe(PALETTE_TYPE.DIVERGING);
      expect(p.colors.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('should define qualitative palettes with at least 3 distinct colors', () => {
    expect(qualitativePalettes.length).toBeGreaterThan(0);
    qualitativePalettes.forEach((p) => {
      expect(p.type).toBe(PALETTE_TYPE.QUALITATIVE);
      expect(p.colors.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('should no longer offer grayscale as a qualitative palette', () => {
    expect(qualitativePalettes.map((palette) => palette.id)).toEqual([
      'vif',
      'pastel',
      'sepia',
      'cb-wong',
      'cb-tol'
    ]);
  });

  it('should still resolve projects saved with the grayscale qualitative palette', () => {
    expect(findPaletteById('grayscale')?.type).toBe(PALETTE_TYPE.QUALITATIVE);
    expect(findPaletteById('categorical-grayscale')?.id).toBe('grayscale');
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

describe('palette.constants — suggestion presets', () => {
  it('should offer monochrome, bicolor, sepia, colour blindness and grayscale for a sequential palette', () => {
    expect(getSuggestionPresetsForType(PALETTE_TYPE.SEQUENTIAL)).toEqual([
      SUGGESTION_PRESET.MONOCHROME,
      SUGGESTION_PRESET.BICOLOR,
      SUGGESTION_PRESET.SEPIA,
      SUGGESTION_PRESET.COLORBLIND,
      SUGGESTION_PRESET.GRAYSCALE
    ]);
  });

  it('should not offer grayscale for a qualitative palette', () => {
    expect(getSuggestionPresetsForType(PALETTE_TYPE.QUALITATIVE)).not.toContain(
      SUGGESTION_PRESET.GRAYSCALE
    );
  });

  it('should offer colour blindness as a preset for every palette type', () => {
    [
      PALETTE_TYPE.SEQUENTIAL,
      PALETTE_TYPE.DIVERGING,
      PALETTE_TYPE.QUALITATIVE
    ].forEach((type) => {
      expect(getSuggestionPresetsForType(type)).toContain(
        SUGGESTION_PRESET.COLORBLIND
      );
    });
  });
});

describe('palette.constants — getSuggestionPalettes', () => {
  it('should return monochrome palettes for the monochrome preset', () => {
    expect(
      getSuggestionPalettes(
        PALETTE_TYPE.SEQUENTIAL,
        SUGGESTION_PRESET.MONOCHROME
      )
    ).toEqual(monochromePalettes);
  });

  it('should return sepia palettes for the sepia preset of a sequential palette', () => {
    expect(
      getSuggestionPalettes(PALETTE_TYPE.SEQUENTIAL, SUGGESTION_PRESET.SEPIA)
    ).toEqual(sepiaPalettes);
  });

  it('should return a single grayscale ramp for the grayscale preset', () => {
    expect(
      getSuggestionPalettes(
        PALETTE_TYPE.SEQUENTIAL,
        SUGGESTION_PRESET.GRAYSCALE
      )
    ).toEqual(grayscalePalettes);
    expect(grayscalePalettes).toHaveLength(1);
  });

  it('should only suggest DIVERGING palettes when the classification has a breakpoint', () => {
    getSuggestionPresetsForType(PALETTE_TYPE.DIVERGING).forEach((preset) => {
      const palettes = getSuggestionPalettes(PALETTE_TYPE.DIVERGING, preset);
      expect(palettes.length).toBeGreaterThan(0);
      palettes.forEach((palette) =>
        expect(palette.type).toBe(PALETTE_TYPE.DIVERGING)
      );
    });
  });

  it('should suggest the Wong and Tol ramps for the colour-blindness preset', () => {
    expect(
      getSuggestionPalettes(
        PALETTE_TYPE.SEQUENTIAL,
        SUGGESTION_PRESET.COLORBLIND
      )
    ).toEqual(colorblindSequentialPalettes);
    expect(
      getSuggestionPalettes(
        PALETTE_TYPE.DIVERGING,
        SUGGESTION_PRESET.COLORBLIND
      )
    ).toEqual(colorblindDivergingPalettes);
  });
});

describe('palette.constants — getPalettesForType', () => {
  it('should return sequential palettes for PALETTE_TYPE.SEQUENTIAL', () => {
    expect(getPalettesForType(PALETTE_TYPE.SEQUENTIAL)).toEqual(
      sequentialPalettes
    );
  });

  it('should return diverging palettes for PALETTE_TYPE.DIVERGING', () => {
    expect(getPalettesForType(PALETTE_TYPE.DIVERGING)).toEqual(
      divergingPalettes
    );
  });

  it('should return qualitative palettes for PALETTE_TYPE.QUALITATIVE', () => {
    expect(getPalettesForType(PALETTE_TYPE.QUALITATIVE)).toEqual(
      qualitativePalettes
    );
  });

  it('should return pattern palettes for PALETTE_TYPE.PATTERN', () => {
    expect(getPalettesForType(PALETTE_TYPE.PATTERN)).toEqual(
      getPatternPalettes()
    );
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

  it('should resolve every palette a suggestion preset can hand out', () => {
    [
      PALETTE_TYPE.SEQUENTIAL,
      PALETTE_TYPE.DIVERGING,
      PALETTE_TYPE.QUALITATIVE
    ].forEach((type) => {
      getSuggestionPresetsForType(type).forEach((preset) => {
        getSuggestionPalettes(type, preset).forEach((palette) => {
          expect(findPaletteById(palette.id)?.id, palette.id).toBe(palette.id);
        });
      });
    });
  });

  it('should resolve every palette the quick dropdown lists', () => {
    [
      PALETTE_TYPE.SEQUENTIAL,
      PALETTE_TYPE.DIVERGING,
      PALETTE_TYPE.QUALITATIVE,
      PALETTE_TYPE.PATTERN
    ].forEach((type) => {
      getPalettesForType(type).forEach((palette) => {
        expect(findPaletteById(palette.id)?.id, palette.id).toBe(palette.id);
      });
    });
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
      ...colorblindSequentialPalettes,
      ...colorblindQualitativePalettes,
      ...grayscalePalettes,
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

describe('palette.constants — getQualitativeColorBands', () => {
  it('should return the 5-color Mixte/Chaud/Froid bands for the Vif preset', () => {
    const bands = getQualitativeColorBands(SUGGESTION_PRESET.VIF);
    expect(bands.map((band) => band.key)).toEqual(['mixte', 'chaud', 'froid']);
    expect(bands[0].colors).toEqual([...VIF_MIXTE_COLORS]);
    expect(bands[1].colors).toEqual([...VIF_CHAUD_COLORS]);
    expect(bands[2].colors).toEqual([...VIF_FROID_COLORS]);
  });

  it('should return Pastel and Sépia bands for their presets', () => {
    expect(
      getQualitativeColorBands(SUGGESTION_PRESET.PASTEL)[0].colors
    ).toEqual([...PASTEL_MIXTE_COLORS]);
    expect(getQualitativeColorBands(SUGGESTION_PRESET.SEPIA)[0].colors).toEqual(
      [...SEPIA_MIXTE_COLORS]
    );
  });

  it('should propose the Bang Wong and Paul Tol schemes for the colour-blindness preset', () => {
    const bands = getQualitativeColorBands(SUGGESTION_PRESET.COLORBLIND);
    expect(bands.map((band) => band.key)).toEqual(['cb-wong', 'cb-tol']);
    expect(bands[0].colors).toEqual([...WONG_COLORS]);
    expect(bands[1].colors).toEqual([...TOL_MUTED_COLORS]);
  });

  it('should keep black out of the Wong scheme so categories stay comparable', () => {
    expect(WONG_COLORS).not.toContain('#000000');
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
