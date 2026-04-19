import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'palette-suggestions.svelte'),
  'utf8'
);

describe('PaletteSuggestions — shared heading', () => {
  it('should render the Suggestions heading with the magic wand icon', () => {
    expect(source).toContain('{m.palette_suggestions()}');
    expect(source).toContain('<MagicWandFilled');
  });

  it('should derive isQualitative from paletteType to branch rendering', () => {
    expect(source).toContain(
      'const isQualitative = $derived(paletteType === PALETTE_TYPE.QUALITATIVE)'
    );
    expect(source).toContain('{#if isQualitative}');
    expect(source).toContain('{:else}');
  });

  it('should toggle colorBlindFilter on the Daltonisme tag click', () => {
    expect(source).toContain('colorBlindFilter = !colorBlindFilter');
    expect(source).toContain('onColorBlindChange?.(colorBlindFilter)');
  });
});

describe('PaletteSuggestions — QUALITATIVE branch (Figma 893:153398)', () => {
  const qualitativeBlock = source
    .split('{#if isQualitative}')[1]
    ?.split('{:else}')[0];

  it('should expose the Vif/Pastel/Sépia/Daltonisme filter tags', () => {
    expect(qualitativeBlock).toBeDefined();
    expect(qualitativeBlock).toContain('{m.preset_vif()}');
    expect(qualitativeBlock).toContain('{m.preset_pastel()}');
    expect(qualitativeBlock).toContain('{m.preset_sepia()}');
    expect(qualitativeBlock).toContain('{m.preset_colorblind()}');
  });

  it('should render three themed QualitativeColorGrid rows (Mixte/Chaud/Froid)', () => {
    expect(qualitativeBlock).toContain('{m.palette_theme_mixte()}');
    expect(qualitativeBlock).toContain('{m.palette_theme_chaud()}');
    expect(qualitativeBlock).toContain('{m.palette_theme_froid()}');
    const gridCount = (qualitativeBlock?.match(/<QualitativeColorGrid/g) || [])
      .length;
    expect(gridCount).toBe(3);
  });

  it('should render the Intensité section with 7 shades from generateIntensityShadesForColor', () => {
    expect(qualitativeBlock).toContain('{m.palette_intensity()}');
    expect(source).toContain(
      'generateIntensityShadesForColor(qualitativeSelectedColor)'
    );
  });

  it('should drive qualitativeGroups from getQualitativeColorGroups with the chosen preset', () => {
    expect(source).toContain(
      "let qualitativePreset = $state<QualitativePreset>('vif')"
    );
    expect(source).toContain(
      'getQualitativeColorGroups(qualitativePreset, colorBlindFilter)'
    );
  });

  it('should propagate color selection via onColorSelect(hex)', () => {
    expect(source).toContain('onColorSelect?.(hex)');
  });
});

describe('PaletteSuggestions — SEQUENTIAL branch (Figma 930:114478)', () => {
  const sequentialBlock = source.split('{:else}')[1];

  it('should keep the Monochrome/Bicolore/Sépia/Daltonisme filter tags', () => {
    expect(sequentialBlock).toBeDefined();
    expect(sequentialBlock).toContain('{m.preset_monochrome()}');
    expect(sequentialBlock).toContain('{m.preset_bicolor()}');
    expect(sequentialBlock).toContain('{m.preset_sepia()}');
    expect(sequentialBlock).toContain('{m.preset_colorblind()}');
  });

  it('should render individual palette rows with family name labels', () => {
    expect(sequentialBlock).toContain('class="palette-label"');
    expect(sequentialBlock).toContain('{palette.name}');
    expect(sequentialBlock).toContain('{#each sequentialPalettes as palette');
  });

  it('should emit onSelect when a palette row is clicked', () => {
    expect(sequentialBlock).toContain('onclick={() => selectPalette(palette)}');
    expect(source).toContain('onSelect?.(palette)');
  });

  it('should auto-select first palette in new preset when current selection is missing', () => {
    expect(source).toContain(
      '!newPalettes.some((p) => p.id === selectedPaletteId)'
    );
    expect(source).toContain('onSelect?.(newPalettes[0])');
  });
});
