import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'stroke-section.svelte'),
  'utf8'
);

describe('StrokeSection — palette wiring', () => {
  it('should import PALETTE_TYPE from palette-popover/palette.constants', () => {
    expect(source).toContain("from '../palette-popover/palette.constants'");
    expect(source).toContain('PALETTE_TYPE');
  });

  it('should wire SEQUENTIAL paletteType on the classes-mode stroke palette', () => {
    expect(source).toContain('paletteType={PALETTE_TYPE.SEQUENTIAL}');
  });

  it('should wire QUALITATIVE paletteType on the categories-mode stroke palette', () => {
    expect(source).toContain('paletteType={PALETTE_TYPE.QUALITATIVE}');
  });

  it('should never render a PalettePreview without an explicit paletteType', () => {
    const paletteBlocks = source.match(/<PalettePreview[\s\S]*?\/>/g) || [];
    expect(paletteBlocks.length).toBeGreaterThan(0);
    paletteBlocks.forEach((block) => {
      expect(block).toMatch(
        /paletteType=\{PALETTE_TYPE\.(SEQUENTIAL|QUALITATIVE)\}/
      );
    });
  });

  it('should accept a categoryLabels prop and propagate it to the Categories popover', () => {
    expect(source).toContain('categoryLabels?:');
    expect(source).toContain('categoryLabels = []');
    const categoriesPalette = source
      .split('paletteType={PALETTE_TYPE.QUALITATIVE}')[1]
      ?.split('/>')[0];
    expect(categoriesPalette).toContain('categoriesMode={true}');
    expect(categoriesPalette).toContain('categoryLabels={');
  });
});
