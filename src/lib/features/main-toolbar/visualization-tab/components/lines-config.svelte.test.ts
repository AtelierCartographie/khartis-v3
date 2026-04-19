import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'lines-config.svelte'),
  'utf8'
);

describe('LinesConfig — palette wiring', () => {
  it('should import PALETTE_TYPE from palette-popover/palette.constants', () => {
    expect(source).toContain("from './palette-popover/palette.constants'");
    expect(source).toContain('PALETTE_TYPE');
  });

  it('should pass paletteType=SEQUENTIAL on the CLASSES branch PalettePreview', () => {
    const classesBlock = source.split('colorMode === ColorMode.CLASSES')[1];
    expect(classesBlock).toBeDefined();
    const classesPalette = classesBlock
      .split('<PalettePreview')[1]
      ?.split('/>')[0];
    expect(classesPalette).toBeDefined();
    expect(classesPalette).toContain('paletteType={PALETTE_TYPE.SEQUENTIAL}');
  });

  it('should pass paletteType=QUALITATIVE on the CATEGORIES branch PalettePreview', () => {
    const categoriesBlock = source.split(
      'colorMode === ColorMode.CATEGORIES'
    )[1];
    expect(categoriesBlock).toBeDefined();
    const categoriesPalette = categoriesBlock
      .split('<PalettePreview')[1]
      ?.split('/>')[0];
    expect(categoriesPalette).toBeDefined();
    expect(categoriesPalette).toContain(
      'paletteType={PALETTE_TYPE.QUALITATIVE}'
    );
  });

  it('should route ColorMode.UNIQUE through SingleColorPreview', () => {
    expect(source).toContain(
      "import SingleColorPreview from './palette-popover/single-color-preview.svelte'"
    );
    const uniqueBlock = source
      .split('colorMode === ColorMode.UNIQUE')[1]
      ?.split('{:else if')[0];
    expect(uniqueBlock).toContain('<SingleColorPreview');
    expect(uniqueBlock).not.toContain('<ColorSelector');
  });

  it('should enable Categories Aspect popover via categoriesMode + categoryLabels on CATEGORIES', () => {
    const categoriesBlock = source.split(
      'colorMode === ColorMode.CATEGORIES'
    )[1];
    const paletteBlock = categoriesBlock
      ?.split('<PalettePreview')[1]
      ?.split('/>')[0];
    expect(paletteBlock).toContain('categoriesMode={true}');
    expect(paletteBlock).toContain(
      'categoryLabels={visualization?.classification?.labels ?? []}'
    );
  });
});
