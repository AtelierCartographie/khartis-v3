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

  it('should always mount the PalettePopover for the default flow', () => {
    expect(source).toContain('<PalettePopover');
    expect(source).toContain('bind:open={popoverOpen}');
  });
});

describe('PalettePreview — categoriesMode routing (Fill Categories)', () => {
  it('should accept categoriesMode + categoryLabels props', () => {
    expect(source).toContain('categoriesMode?: boolean');
    expect(source).toContain('categoryLabels?: string[]');
    expect(source).toContain('categoriesMode = false');
    expect(source).toContain('categoryLabels = []');
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
    expect(source).toContain('onvalidate={handleCategoriesValidateWithAspect}');
  });

  it('should build categoryDrafts from colors and categoryLabels with default labels fallback', () => {
    expect(source).toContain(
      'const categoryDrafts = $derived<CategoryDraft[]>('
    );
    expect(source).toContain('colors.map((color, i) => ({');
    expect(source).toContain('label: categoryLabels[i]');
  });

  it('should propagate validated category drafts as ClassificationConfig colors + labels', () => {
    expect(source).toContain('colors: next.map((c) => c.color)');
    expect(source).toContain('labels: next.map((c) => c.label)');
  });
});
