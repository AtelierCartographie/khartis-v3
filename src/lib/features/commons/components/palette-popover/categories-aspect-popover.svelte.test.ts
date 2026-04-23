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
      'draftCategories = categories.map((category, index) => ({'
    );
    expect(source).toContain(
      'onvalidate?.(draftCategories, draftCommonAspect)'
    );
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
    expect(source).toContain(
      '{#each visibleDraftCategories as category, index'
    );
    expect(source).toContain('<SingleColorPreview');
    expect(source).toContain('class="category-label-input"');
    expect(source).toContain('<Switch');
  });

  it('should wire the category list to drag-and-drop in manual sort mode', () => {
    expect(source).toContain('import { dragHandle, dragHandleZone }');
    expect(source).toContain('use:dragHandleZone');
    expect(source).toContain('use:dragHandle');
    expect(source).toContain('handleCategoryListReorder');
  });

  it('should apply a suggestion color only to the selected category', () => {
    expect(source).toContain('if (!selectedCategoryId) return');
    expect(source).toContain('category.id === selectedCategoryId');
  });

  it('should expose the Annuler / Valider footer pair with the divider shell', () => {
    expect(source).toContain('{m.button_cancel()}');
    expect(source).toContain('{m.button_validate()}');
    expect(source).toContain('icon={ArrowRight}');
    expect(source).toContain('popover-divider');
  });

  it('should expose a variant prop with default symbols-unique', () => {
    expect(source).toContain('variant?: CategoriesAspectVariant');
    expect(source).toContain("variant = 'symbols-unique'");
  });

  it('should only seed per-category shapes for the symbols-different variant', () => {
    expect(source).toContain("variant === 'symbols-different'");
    expect(source).toContain(
      'CATEGORY_SHAPE_CYCLE[index % CATEGORY_SHAPE_CYCLE.length]'
    );
  });

  it('should render the "Aspect commun" section for the supported variants', () => {
    expect(source).toContain("variant === 'symbols-unique' ||");
    expect(source).toContain("variant === 'symbols-different-rank' ||");
    expect(source).toContain("variant === 'polygons'");
    expect(source).toContain('{#if showCommonAspect}');
    expect(source).toContain('{m.aspect_common_section()}');
    expect(source).toContain('{m.aspect_common_size_unique()}');
    expect(source).toContain('{m.aspect_common_stroke_yesno()}');
    expect(source).toContain('{m.aspect_common_auto_color()}');
    expect(source).toContain('{m.aspect_common_pattern()}');
  });

  it('should match the Figma common symbols layout instead of a flat two-column grid', () => {
    expect(source).toContain('class="common-symbols-layout"');
    expect(source).toContain(
      'class="common-paired-row common-paired-row--with-input"'
    );
    expect(source).toContain('class="common-divider"');
    expect(source).not.toContain('--kh-switch-on-bg');
  });

  it('should ship a CategoriesCommonAspect draft initialised via DEFAULT_COMMON_ASPECT', () => {
    expect(source).toContain('draftCommonAspect');
    expect(source).toContain('DEFAULT_COMMON_ASPECT');
    expect(source).toContain('handleCommonAspectChange');
  });

  it('should suppress the per-category accordion for the ranked symbols variant', () => {
    expect(source).toContain(
      'const showPerCategoryAspect = $derived(!isSymbolsDifferentRank)'
    );
    expect(source).toContain('{#if showPerCategoryAspect}');
  });

  it('should bound ranked marker previews to the ordered size range instead of growing unbounded per row', () => {
    expect(source).toContain('function resolveOrderedRankPreviewSize');
    expect(source).toContain(
      'resolveOrderedRankPreviewSize(index, visibleDraftCategories.length)'
    );
    expect(source).toContain('Math.max(1, Math.round(clampedBaseSize * 0.75))');
    expect(source).toContain(
      'Math.max(minSize + 1, Math.round(clampedBaseSize * 1.75))'
    );
    expect(source).not.toContain('rankBaseSize + index * 4');
  });

  it('should keep disabled categories visible in the editor while dimming their row', () => {
    expect(source).toContain(
      'class:category-item--disabled={!category.enabled}'
    );
    expect(source).toContain('.category-item--disabled');
  });
});

describe('CategoriesAspectPopover — high cardinality cap (E-04)', () => {
  it('caps the visible categories list to MAX_VISIBLE_CATEGORIES = 50', () => {
    expect(source).toContain('const MAX_VISIBLE_CATEGORIES = 50');
    expect(source).toMatch(
      /draftCategories\.slice\(0,\s*MAX_VISIBLE_CATEGORIES\)/
    );
  });

  it('renders a hidden-count note when categories exceed MAX_VISIBLE_CATEGORIES', () => {
    expect(source).toContain('hidden-count-note');
    expect(source).toMatch(
      /Math\.max\(0,\s*draftCategories\.length\s*-\s*MAX_VISIBLE_CATEGORIES\)/
    );
  });

  it('iterates visibleDraftCategories (capped) and not the full draftCategories', () => {
    expect(source).toContain(
      '{#each visibleDraftCategories as category, index'
    );
    expect(source).not.toContain('{#each draftCategories as category');
  });
});
