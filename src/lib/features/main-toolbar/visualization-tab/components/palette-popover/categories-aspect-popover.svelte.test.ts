import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'categories-aspect-popover.svelte'),
  'utf8'
);

describe('CategoriesAspectPopover (Figma 952:156994 — Polygons variant)', () => {
  it('should render the "Aspect des catégories" header title', () => {
    expect(source).toContain('{m.palette_categories_aspect_title()}');
  });

  it('should clone incoming categories into a draft on open and restore on cancel', () => {
    expect(source).toContain(
      'draftCategories = categories.map((c) => ({ ...c }))'
    );
    expect(source).toContain('onvalidate?.(draftCategories)');
  });

  it('should reuse PaletteSuggestions in QUALITATIVE mode for the Khartis suggestions section', () => {
    expect(source).toContain('<PaletteSuggestions');
    expect(source).toContain('paletteType={PALETTE_TYPE.QUALITATIVE}');
    expect(source).toContain('onColorSelect={handleSuggestionColor}');
  });

  it('should render the "Aspect personnalisé" section with the categories list heading', () => {
    expect(source).toContain('{m.palette_categories_custom_section()}');
    expect(source).toContain('{m.palette_categories_sort()}');
    expect(source).toContain('{m.palette_categories_sort_manual()}');
    expect(source).toContain('{m.palette_categories_list_label()}');
  });

  it('should render one category item per draft with color / label input / toggle', () => {
    expect(source).toContain('{#each draftCategories as cat');
    expect(source).toContain('<SingleColorPreview');
    expect(source).toContain('class="category-label-input"');
    expect(source).toContain('<Switch');
  });

  it('should apply a suggestion color only to the selected category', () => {
    expect(source).toContain('if (!selectedCategoryId) return');
    expect(source).toContain(
      'c.id === selectedCategoryId ? { ...c, color: hex } : c'
    );
  });

  it('should expose the Annuler / Valider footer pair with the divider shell', () => {
    expect(source).toContain('{m.button_cancel()}');
    expect(source).toContain('{m.button_validate()}');
    expect(source).toContain('icon={ArrowRight}');
    expect(source).toContain('popover-divider');
  });
});
