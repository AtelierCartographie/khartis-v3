import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'symbol-mode-categories.svelte'),
  'utf8'
);

describe('SymbolModeCategories (en categorie.png alignment)', () => {
  it('exposes the CategoryShapeMode radio group with three options', () => {
    expect(source).toContain('id="cat-shape-unique"');
    expect(source).toContain('id="cat-shape-different"');
    expect(source).toContain('id="cat-shape-ordered"');
    expect(source).toContain('CategoryShapeMode.UNIQUE');
    expect(source).toContain('CategoryShapeMode.DIFFERENT');
    expect(source).toContain('CategoryShapeMode.ORDERED');
  });

  it('only shows the single-shape Dropdown when categoryShapeMode is UNIQUE', () => {
    expect(source).toContain(
      '{#if categoryShapeMode === CategoryShapeMode.UNIQUE}'
    );
    expect(source).toContain('<Dropdown');
    expect(source).toContain('items={shapeDropdownItems}');
  });

  it('uses the Taille selon label for the category variable picker', () => {
    expect(source).toContain('{m.size_according()}');
  });

  it('propagates categoryShape choices through onModesChange', () => {
    expect(source).toContain('onModesChange?.({ categoryShape: next })');
  });

  it('renders the qualitative palette preview and opacity slider', () => {
    expect(source).toContain('PalettePreview');
    expect(source).toContain('label={m.opacity()}');
  });

  it('wires PalettePreview with paletteType=QUALITATIVE so the popover shows the Couleur title', () => {
    expect(source).toContain('paletteType={PALETTE_TYPE.QUALITATIVE}');
    expect(source).toContain(
      "from '$lib/features/commons/components/palette-popover/palette.constants'"
    );
  });

  it('enables the Categories Aspect popover via categoriesMode + categoryLabels', () => {
    expect(source).toContain('categoriesMode={true}');
    expect(source).toContain(
      'categoryLabels={visualization?.classification?.labels ?? []}'
    );
  });

  it('maps categoryShapeMode to CategoriesAspectVariant and passes categoriesVariant to PalettePreview', () => {
    expect(source).toContain(
      'categoriesVariant = $derived<CategoriesAspectVariant>'
    );
    expect(source).toContain("'symbols-different'");
    expect(source).toContain("'symbols-different-rank'");
    expect(source).toContain("'symbols-unique'");
    expect(source).toContain('categoriesVariant={categoriesVariant}');
  });
});
