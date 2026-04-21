import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(import.meta.dirname, 'palette-preview.svelte'),
  'utf8'
);

describe('PalettePreview — shell + popover routing', () => {
  it('should render PaletteDropdown with oncustomize wired to handleCustomize', () => {
    expect(source).toContain('<PaletteDropdown');
    expect(source).toContain('oncustomize={handleCustomize}');
  });

  it('should keep swatches display-only and route all edits through customize', () => {
    expect(source).not.toContain('type="color"');
    expect(source).not.toContain('colorInputRefs');
    expect(source).not.toContain('handleSwatchClick');
    expect(source).toContain('previewCount={dropdownPreviewCount}');
  });

  it('should normalize legacy selectedPaletteId values before opening dropdown/popover', () => {
    expect(source).toContain('normalizePaletteId(selectedPaletteId)');
    expect(source).toContain('selectedPaletteId={normalizedSelectedPaletteId}');
  });

  it('should always mount the PalettePopover for the default flow', () => {
    expect(source).toContain('<PalettePopover');
    expect(source).toContain('bind:open={popoverOpen}');
  });
});

describe('PalettePreview — categoriesMode routing (Fill Categories)', () => {
  it('should accept categoriesMode + categoryLabels props', () => {
    expect(source).toContain('categoriesMode?: boolean');
    expect(source).toContain('categoryLabels?: string[]');
    expect(source).toContain('disabledCategoryLabels?: string[]');
    expect(source).toContain('categoriesCommonAspect?: CategoriesCommonAspect');
    expect(source).toContain('categoriesMode = false');
    expect(source).toContain('categoryLabels = []');
    expect(source).toContain('disabledCategoryLabels = []');
    expect(source).toContain('categoriesCommonAspect = DEFAULT_COMMON_ASPECT');
  });

  it('should route handleCustomize to CategoriesAspectPopover when categoriesMode is true', () => {
    expect(source).toContain('if (categoriesMode)');
    expect(source).toContain('categoriesPopoverOpen = true');
    expect(source).toContain('popoverOpen = true');
  });

  it('should render a CategoriesAspectPopover bound to categoriesPopoverOpen', () => {
    expect(source).toContain('<CategoriesAspectPopover');
    expect(source).toContain('bind:open={categoriesPopoverOpen}');
    expect(source).toContain('categories={categoryDrafts}');
    expect(source).toContain('commonAspect={categoriesCommonAspect}');
    expect(source).toContain('onvalidate={handleCategoriesValidateWithAspect}');
  });

  it('should build categoryDrafts from colors and categoryLabels with default labels fallback', () => {
    expect(source).toContain(
      'const categoryDrafts = $derived<CategoryDraft[]>('
    );
    expect(source).toContain('colors.map((color, i) => {');
    expect(source).toContain(
      'categoryLabels[i] ?? m.palette_category_default_label'
    );
    expect(source).toContain(
      'enabled: !disabledCategoryLabels.includes(label)'
    );
  });

  it('should normalize validated category drafts before updating ClassificationConfig', () => {
    expect(source).toContain(
      'const resolvedColors = resolveValidatedCategoryColors'
    );
    expect(source).toContain(
      'labels: normalizedCategories.map((category) => category.label)'
    );
    expect(source).toContain('disabledLabels: normalizedCategories');
    expect(source).toContain("categoriesVariant === 'symbols-different'");
    expect(source).toContain("categoriesVariant === 'symbols-different-rank'");
  });

  it('should preserve the selected palette id when category colors are unchanged', () => {
    expect(source).toContain(
      'resolvedColors.every((color, index) => color === colors[index])'
    );
    expect(source).toContain("(selectedPaletteId ?? '__custom__')");
  });

  it('should expose normalized categories to the symbol-specific common aspect callback', () => {
    expect(source).toContain(
      'onCategoriesCommonAspectChange?.(commonAspect, normalizedCategories)'
    );
  });
});
