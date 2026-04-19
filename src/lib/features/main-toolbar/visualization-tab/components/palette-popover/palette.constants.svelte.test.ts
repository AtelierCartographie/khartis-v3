import { describe, expect, it, vi } from 'vitest';

// ok-palette's resolvePalette relies on OffscreenCanvas which jsdom does not expose.
// Stub it with a deterministic dummy so tests can exercise count/branching logic
// without needing a working canvas 2D context.
vi.mock('@ateliercartographie/ok-palette', async () => {
  const actual = await vi.importActual<
    typeof import('@ateliercartographie/ok-palette')
  >('@ateliercartographie/ok-palette');
  return {
    ...actual,
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

// motif.js relies on canvas via tile().toDataURL(); stub to return a fixed data URL
// keyed on a hash of its inputs so buildPatternBackground assertions still vary
// between different pattern/angle combinations.
vi.mock('@ateliercartographie/motif.js', () => ({
  motif: (config: { type: string; angle?: number }) => ({
    tile: () => ({
      toDataURL: () =>
        `data:image/png;base64,MOCK_${config.type}_${config.angle ?? 0}`
    })
  })
}));

import {
  PALETTE_TYPE,
  monochromePalettes,
  bicolorPalettes,
  sepiaPalettes,
  sequentialPalettes,
  divergingPalettes,
  qualitativePalettes,
  getPatternPalettes,
  generatePaletteColors,
  generateSequentialFromColor,
  generateSequentialFromColors,
  generateIntensityShades,
  generateIntensityShadesForColor,
  generateCategoricalColorsFromSeed,
  getSuggestionPalettes,
  getPalettesForType,
  getQualitativeColorGroups,
  findPaletteById,
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

  it('should define bicolor palettes with exactly two seed colors per palette', () => {
    expect(bicolorPalettes.length).toBeGreaterThan(0);
    bicolorPalettes.forEach((p) => {
      expect(p.type).toBe(PALETTE_TYPE.SEQUENTIAL);
      expect(p.colors.length).toBe(2);
    });
  });

  it('should expose sequentialPalettes aliased from bicolorPalettes', () => {
    expect(sequentialPalettes).toBe(bicolorPalettes);
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
    });
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
    const p = bicolorPalettes[0];
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

  it('should slice QUALITATIVE palette colors when count <= palette length', () => {
    const p = qualitativePalettes[0];
    const result = generatePaletteColors(p, 3);
    expect(result).toEqual(p.colors.slice(0, 3));
  });

  it('should generate N colors via categorical for QUALITATIVE when count exceeds palette length', () => {
    const p = qualitativePalettes[0];
    const result = generatePaletteColors(p, p.colors.length + 5);
    expect(result).toHaveLength(p.colors.length + 5);
    result.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });

  it('should return raw palette colors for PATTERN type', () => {
    const p = getPatternPalettes()[0];
    const result = generatePaletteColors(p, 3);
    expect(result).toEqual(p.colors);
  });

  it('should accept a contrast parameter and still return N hex colors', () => {
    // resolvePalette is mocked in this file, so we only assert the contract
    // (count + hex format) rather than inter-contrast distinctness which depends
    // on the real ok-palette color math.
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
    expect(result).toEqual(bicolorPalettes);
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

describe('palette.constants — findPaletteById', () => {
  it('should find a palette across all collections by id', () => {
    expect(findPaletteById(monochromePalettes[0].id)?.id).toBe(
      monochromePalettes[0].id
    );
    expect(findPaletteById(bicolorPalettes[0].id)?.id).toBe(
      bicolorPalettes[0].id
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

  it('should return undefined for an unknown palette id', () => {
    expect(findPaletteById('unknown-palette-id')).toBeUndefined();
  });
});

describe('palette.constants — qualitative preset constants (Figma 893:153398)', () => {
  it('should expose the exact Vif Mixte hex codes from the Figma design', () => {
    expect([...VIF_MIXTE_COLORS]).toEqual([
      '#f287ac',
      '#00ad92',
      '#c39800',
      '#90a8ff',
      '#da5e04'
    ]);
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

describe('palette.constants — generateIntensityShadesForColor', () => {
  it('should alias to generateIntensityShades (7 shades)', () => {
    const shades = generateIntensityShadesForColor('#f287ac');
    const ref = generateIntensityShades('#f287ac');
    expect(shades).toEqual(ref);
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

  it('should return N hex colors regardless of preset', () => {
    // resolvePalette is mocked, so inter-preset distinctness is not verifiable
    // here; the real behavior is covered by ok-palette's own tests.
    const vif = generateCategoricalColorsFromSeed('#f287ac', 4, 'vif');
    const pastel = generateCategoricalColorsFromSeed('#f287ac', 4, 'pastel');
    expect(vif).toHaveLength(4);
    expect(pastel).toHaveLength(4);
    vif.forEach((c) => expect(c).toMatch(HEX_REGEX));
    pastel.forEach((c) => expect(c).toMatch(HEX_REGEX));
  });
});

describe('palette.constants — buildPatternBackground', () => {
  it('should return a data-URL background for a pattern palette', () => {
    const p = getPatternPalettes().find((x) => x.patternId === 'diagonal')!;
    const bg = buildPatternBackground(p);
    expect(bg).toMatch(/^url\(data:/);
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
    expect(bgHorizontal).toMatch(/^url\(data:/);
    expect(bgDiagonal).toMatch(/^url\(data:/);
    expect(bgHorizontal).not.toBe(bgDiagonal);
  });
});
