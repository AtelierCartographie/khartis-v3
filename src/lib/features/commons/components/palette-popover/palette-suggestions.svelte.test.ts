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
    expect(source).toContain('--khartis-additions-text-primary-suggestions');
    expect(source).toContain('--khartis-additions-interactive-suggestions');
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
  it('should expose the Vif/Pastel/Sépia/Daltonisme filter tags', () => {
    expect(source).toContain('{m.preset_vif()}');
    expect(source).toContain('{m.preset_pastel()}');
    expect(source).toContain('{m.preset_sepia()}');
    expect(source).toContain('{m.preset_colorblind()}');
  });

  it('should expose the Niveaux de gris tag only in categories mode', () => {
    expect(source).toContain('{#if isCategoriesQualitative}');
    expect(source).toContain('{m.preset_grayscale()}');
  });

  it('should select a whole palette band (Mixte/Chaud/Froid) in categories mode', () => {
    expect(source).toContain('qualitativeBands');
    expect(source).toContain('{m.palette_theme_mixte()}');
    expect(source).toContain('{m.palette_theme_chaud()}');
    expect(source).toContain('{m.palette_theme_froid()}');
    expect(source).toContain('selectQualitativePalette([...band.colors])');
    expect(source).toContain('isCategoryBandSelected(band.colors)');
    expect(source).toContain('onPaletteSelect?.(colors)');
  });

  it('should mark the band selected when its first color matches the active color', () => {
    expect(source).toContain('function isCategoryBandSelected');
    expect(source).toContain(
      'colors[0].toLowerCase() === qualitativeSelectedColor.toLowerCase()'
    );
  });

  it('should keep individual color grids for single (non-categories) qualitative mode', () => {
    const gridCount = (source.match(/<QualitativeColorGrid/g) || []).length;
    expect(gridCount).toBe(3);
    expect(source).toContain('onColorSelect={selectQualitativeColor}');
  });

  it('should render the Intensité section only outside categories mode', () => {
    expect(source).toContain('{m.palette_intensity()}');
    expect(source).toContain(
      'generateIntensityShadesForColor(qualitativeSelectedColor)'
    );
  });

  it('should drive qualitativeGroups from getQualitativeColorGroups with the chosen preset', () => {
    expect(source).toContain('DEFAULT_QUALITATIVE_PRESET');
    expect(source).toContain(
      'getQualitativeColorGroups(qualitativePreset, colorBlindFilter)'
    );
    expect(source).toContain('onQualitativePresetChange?.(preset)');
  });

  it('should propagate single-color selection via onColorSelect(hex)', () => {
    expect(source).toContain('onColorSelect?.(hex)');
  });
});

describe('PaletteSuggestions — SEQUENTIAL branch (Figma 930:114478)', () => {
  it('should keep the Monochrome/Bicolore/Sépia/Daltonisme filter tags', () => {
    expect(source).toContain('{m.preset_monochrome()}');
    expect(source).toContain('{m.preset_bicolor()}');
    expect(source).toContain('{m.preset_colorblind()}');
  });

  it('should render sequential palette rows with family name labels', () => {
    expect(source).toContain('class="palette-label"');
    expect(source).toContain('{getPaletteDisplayName(palette)}');
    expect(source).toContain('{#each sequentialPalettes as palette');
  });

  it('should emit onSelect when a palette row is clicked', () => {
    expect(source).toContain('onclick={() => selectPalette(palette)}');
    expect(source).toContain('onSelect?.(palette)');
  });

  it('should auto-select first palette in new preset when current selection is missing', () => {
    expect(source).toContain(
      '!newPalettes.some((p) => p.id === selectedPaletteId)'
    );
    expect(source).toContain('onSelect?.(newPalettes[0])');
  });
});
