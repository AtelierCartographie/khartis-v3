import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'texts-config.svelte'),
  'utf8'
);

describe('TextsConfig — palette wiring', () => {
  it('should import PALETTE_TYPE from palette-popover/palette.constants', () => {
    expect(source).toContain("from './palette-popover/palette.constants'");
    expect(source).toContain('PALETTE_TYPE');
  });

  it('should wire SEQUENTIAL paletteType on every CLASSES-mode PalettePreview (color + fill)', () => {
    const sequentialCount = (
      source.match(/paletteType=\{PALETTE_TYPE\.SEQUENTIAL\}/g) || []
    ).length;
    expect(sequentialCount).toBeGreaterThanOrEqual(2);
  });

  it('should wire QUALITATIVE paletteType on every CATEGORIES-mode PalettePreview (color + fill)', () => {
    const qualitativeCount = (
      source.match(/paletteType=\{PALETTE_TYPE\.QUALITATIVE\}/g) || []
    ).length;
    expect(qualitativeCount).toBeGreaterThanOrEqual(2);
  });

  it('should never default to the implicit paletteType on a PalettePreview (no prop) for class/category modes', () => {
    const paletteBlocks = source.match(/<PalettePreview[\s\S]*?\/>/g) || [];
    expect(paletteBlocks.length).toBeGreaterThan(0);
    paletteBlocks.forEach((block) => {
      expect(block).toMatch(
        /paletteType=\{PALETTE_TYPE\.(SEQUENTIAL|QUALITATIVE)\}/
      );
    });
  });

  it('should route ColorMode.UNIQUE and FillMode.UNIQUE through SingleColorPreview', () => {
    expect(source).toContain(
      "import SingleColorPreview from './palette-popover/single-color-preview.svelte'"
    );
    const singleColorCount = (source.match(/<SingleColorPreview/g) ?? [])
      .length;
    expect(singleColorCount).toBeGreaterThanOrEqual(2);
  });

  it('should enable Categories Aspect popover on every QUALITATIVE PalettePreview', () => {
    const paletteBlocks = source.match(/<PalettePreview[\s\S]*?\/>/g) || [];
    const qualitativeBlocks = paletteBlocks.filter((block) =>
      block.includes('paletteType={PALETTE_TYPE.QUALITATIVE}')
    );
    expect(qualitativeBlocks.length).toBeGreaterThanOrEqual(2);
    qualitativeBlocks.forEach((block) => {
      expect(block).toContain('categoriesMode={true}');
      expect(block).toMatch(
        /categoryLabels=\{(visualization|backgroundVisualization)\?\.classification[\s\S]*?labels[\s\S]*?\?\?[\s\S]*?\[\]\}/
      );
    });
  });
});
