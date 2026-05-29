import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'palette-custom.svelte'),
  'utf8'
);

describe('PaletteCustom (Palette personnalisée section)', () => {
  it('should branch on isQualitative to skip the content switcher for QUALITATIVE type', () => {
    expect(source).toContain(
      'const isQualitative = $derived(paletteType === PALETTE_TYPE.QUALITATIVE)'
    );
    expect(source).toContain('{#if isQualitative}');
    expect(source).toContain('{:else}');
  });

  it('should render a ContentSwitcher with three tabs in the non-qualitative branch', () => {
    expect(source).toContain('<ContentSwitcher');
    expect(source).toContain('m.palette_custom_1_color()');
    expect(source).toContain('m.palette_custom_2_colors()');
    expect(source).toContain('m.palette_custom_patterns()');
  });

  it('should expose a Contrast radio group with Faible/Normal/Élevé values', () => {
    expect(source).toContain('{m.contrast_label()}');
    expect(source).toContain('m.contrast_low()');
    expect(source).toContain('m.contrast_normal()');
    expect(source).toContain('m.contrast_high()');
    expect(source).toContain("value: 'low'");
    expect(source).toContain("value: 'normal'");
    expect(source).toContain("value: 'high'");
    expect(source).toContain('<SimpleRadioGroup');
  });

  it('should render an Inverser la palette ToggleWithLabel in the non-qualitative branch', () => {
    expect(source).toContain('<ToggleWithLabel');
    expect(source).toContain('{m.invert_palette_tooltip()}');
  });

  it('should render a direct ColorSelector and a Motif toggle instead of the content switcher in QUALITATIVE mode', () => {
    const qualitativeBlock = source
      .split('{#if isQualitative}')[1]
      ?.split('{:else}')[0];
    expect(qualitativeBlock).toBeDefined();
    expect(qualitativeBlock).toContain('<ColorSelector');
    expect(qualitativeBlock).toContain('<ToggleWithLabel');
    expect(qualitativeBlock).not.toContain('<SingleColorPreview');
    expect(qualitativeBlock).not.toContain('<ContentSwitcher');
  });

  it('should keep the exact picked color in QUALITATIVE mode instead of generating a sequential ramp', () => {
    expect(source).toMatch(
      /const colors = isQualitative\s*\?\s*\[color\]\s*:\s*generateSequentialFromColor\(color,\s*numClasses,\s*resolvedContrast\)/
    );
  });

  it('gates every Motif affordance behind the allowPattern prop (default true)', () => {
    expect(source).toContain('allowPattern = true');
    const qualitativeBlock = source
      .split('{#if isQualitative}')[1]
      ?.split('{:else}')[0];
    expect(qualitativeBlock).toContain('{#if allowPattern}');
    expect(source).toContain('{#if allowPattern && motifEnabled}');
    expect(source).toMatch(
      /allowPattern\s*\?\s*\[[\s\S]*m\.palette_custom_patterns\(\)[\s\S]*\]\s*:\s*\[\s*m\.palette_custom_1_color\(\),\s*m\.palette_custom_2_colors\(\)\s*\]/
    );
  });
});
