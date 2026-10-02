import { describe, expect, it, vi } from 'vitest';
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

import {
  PALETTE_TYPE,
  divergingPalettes,
  qualitativePalettes,
  generatePaletteColors,
  generateCategoricalColorsFromSeed,
  getSuggestionPalettes,
  getSuggestionPresetsForType,
  getPalettesForType,
  getQualitativeColorBands,
  SUGGESTION_PRESET,
  findPaletteById,
  VIF_MIXTE_COLORS
} from './palette.constants';
import {
  TOL_MUTED_COLORS,
  WONG_COLORS
} from '$lib/features/commons/constants/colorblind-palette.constants';
import { divergentSequential } from '@ateliercartographie/ok-palette';

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

describe('palette.constants — palette collections', () => {
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

describe('palette.constants — generatePaletteColors', () => {
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

  it('should keep each QUALITATIVE palette own seeds on overflow across every qualitative palette', () => {
    for (const palette of qualitativePalettes) {
      const result = generatePaletteColors(palette, palette.colors.length + 10);
      expect(result.slice(0, palette.colors.length)).toEqual(palette.colors);
    }
  });
});

describe('palette.constants — suggestion presets', () => {
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
  it('should only suggest DIVERGING palettes when the classification has a breakpoint', () => {
    getSuggestionPresetsForType(PALETTE_TYPE.DIVERGING).forEach((preset) => {
      const palettes = getSuggestionPalettes(PALETTE_TYPE.DIVERGING, preset);
      expect(palettes.length).toBeGreaterThan(0);
      palettes.forEach((palette) =>
        expect(palette.type).toBe(PALETTE_TYPE.DIVERGING)
      );
    });
  });
});

describe('palette.constants — findPaletteById', () => {
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

describe('palette.constants — qualitative preset constants', () => {
  it('should start the Vif Mixte band on the Khartis signature hue', () => {
    const SRGB_CLIPPING_HUE_TOLERANCE_DEGREES = 10;
    const drift = Math.abs(
      hexToOklchHue(VIF_MIXTE_COLORS[0]) -
        hexToOklchHue(DEFAULT_VISUALIZATION_COLOR)
    );

    expect(drift).toBeLessThan(SRGB_CLIPPING_HUE_TOLERANCE_DEGREES);
  });
});

describe('palette.constants — getQualitativeColorBands', () => {
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

describe('palette.constants — generateCategoricalColorsFromSeed', () => {
  it('should accept a seed without a hash prefix', () => {
    const colors = generateCategoricalColorsFromSeed('f287ac', 5, 'vif');
    expect(colors).toHaveLength(5);
    colors.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });
});
