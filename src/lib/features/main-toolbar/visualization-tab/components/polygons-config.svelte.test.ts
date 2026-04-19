import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'polygons-config.svelte'),
  'utf8'
);

describe('PolygonsConfig — palette wiring', () => {
  it('should import PALETTE_TYPE from palette-popover/palette.constants', () => {
    expect(source).toContain("from './palette-popover/palette.constants'");
    expect(source).toContain('PALETTE_TYPE');
  });

  it('should pass paletteType=SEQUENTIAL on the CLASSES branch PalettePreview', () => {
    const classesBlock = source.split(
      'effectiveFillMode === FillMode.CLASSES'
    )[1];
    expect(classesBlock).toBeDefined();
    const classesPalette = classesBlock
      .split('<PalettePreview')[1]
      ?.split('/>')[0];
    expect(classesPalette).toBeDefined();
    expect(classesPalette).toContain('paletteType={PALETTE_TYPE.SEQUENTIAL}');
  });

  it('should pass paletteType=QUALITATIVE on the CATEGORIES branch PalettePreview', () => {
    const categoriesBlock = source.split(
      'effectiveFillMode === FillMode.CATEGORIES'
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

  it('should keep the DiscretizationRow + PalettePreview pair in both fill modes', () => {
    const classesBlock = source.split(
      'effectiveFillMode === FillMode.CLASSES'
    )[1];
    const categoriesBlock = source.split(
      'effectiveFillMode === FillMode.CATEGORIES'
    )[1];
    expect(classesBlock).toContain('<DiscretizationRow');
    expect(classesBlock).toContain('<PalettePreview');
    expect(categoriesBlock).toContain('<DiscretizationRow');
    expect(categoriesBlock).toContain('<PalettePreview');
  });

  it('should wire Fill Unique through SingleColorPreview (not the raw ColorSelector)', () => {
    expect(source).toContain(
      "import SingleColorPreview from './palette-popover/single-color-preview.svelte'"
    );
    const uniqueBlock = source
      .split('effectiveFillMode === FillMode.UNIQUE')[1]
      ?.split('{:else if')[0];
    expect(uniqueBlock).toBeDefined();
    expect(uniqueBlock).toContain('<SingleColorPreview');
    expect(uniqueBlock).toContain('color={fillColor}');
    expect(uniqueBlock).toContain('onchange={handleFillColorChange}');
    // ColorSelector should no longer be used for Fill Unique
    expect(uniqueBlock).not.toContain('<ColorSelector');
  });

  it('should enable the Categories Aspect popover via categoriesMode prop on the CATEGORIES branch', () => {
    const categoriesBlock = source.split(
      'effectiveFillMode === FillMode.CATEGORIES'
    )[1];
    expect(categoriesBlock).toBeDefined();
    const paletteBlock = categoriesBlock
      .split('<PalettePreview')[1]
      ?.split('/>')[0];
    expect(paletteBlock).toContain('categoriesMode={true}');
    expect(paletteBlock).toContain(
      'categoryLabels={visualization?.classification?.labels ?? []}'
    );
  });

  it('exposes FillMode.DENSITY in the fill mode items (issue #93)', () => {
    expect(source).toContain('FillMode.DENSITY');
    expect(source).toContain('<PolygonModeDensity');
    expect(source).toContain("from './polygons'");
  });
});
