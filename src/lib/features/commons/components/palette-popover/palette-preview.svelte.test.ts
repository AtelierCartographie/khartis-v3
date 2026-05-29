import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import PalettePreview from './palette-preview.svelte';
import { PALETTE_TYPE } from './palette.constants';

vi.hoisted(() => {
  class WorkerMock {
    postMessage(): void {}

    terminate(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}
  }

  vi.stubGlobal('Worker', WorkerMock);
});

const source = readFileSync(
  resolve(import.meta.dirname, 'palette-preview.svelte'),
  'utf8'
);

afterEach(() => {
  cleanup();
});

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

  it('uses the shared palette swatch border token', () => {
    expect(source).toContain('--khartis-palette-swatch-border-color');
  });

  it('hides the invert action for qualitative palettes', () => {
    expect(source).toContain(
      'showInvertButton && paletteType !== PALETTE_TYPE.QUALITATIVE'
    );
  });
});

describe('PalettePreview runtime — categories common aspect routing', () => {
  it('does not expose common symbol controls for symbol fill categories', () => {
    render(PalettePreview, {
      colors: ['#111111', '#222222'],
      categoriesMode: true,
      categoriesVariant: 'symbols-unique',
      showCategoriesCommonAspect: false,
      categoriesPopoverOpen: true,
      categoryLabels: ['Category A', 'Category B'],
      paletteType: PALETTE_TYPE.QUALITATIVE
    });

    expect(
      screen.getByRole('dialog', {
        name: m.palette_categories_aspect_title()
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(m.aspect_common_section())
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(m.palette_categories_custom_section())
    ).toBeInTheDocument();
  });
});

describe('PalettePreview — categoriesMode routing (Fill Categories)', () => {
  it('should accept categoriesMode + categoryLabels props', () => {
    expect(source).toContain('categoriesMode?: boolean');
    expect(source).toContain('categoryLabels?: string[]');
    expect(source).toContain('disabledCategoryLabels?: string[]');
    expect(source).toContain('categoriesCommonAspect?: CategoriesCommonAspect');
    expect(source).toContain('showCategoriesCommonAspect?: boolean');
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
    expect(source).toContain(
      'showCommonAspect={resolvedShowCategoriesCommonAspect}'
    );
    expect(source).toContain('onvalidate={handleCategoriesValidateWithAspect}');
  });

  it('should build categoryDrafts from the full labels/colors span with default labels fallback', () => {
    expect(source).toContain(
      'const categoryDrafts = $derived<CategoryDraft[]>('
    );
    expect(source).toContain('const categoryDraftCount = $derived(');
    expect(source).toContain('Math.max(');
    expect(source).toContain('colors.length,');
    expect(source).toContain('categoryLabels.length,');
    expect(source).toContain('classification?.categoryValues?.length ?? 0');
    expect(source).toContain(
      'Array.from({ length: categoryDraftCount }, (_, i) => {'
    );
    expect(source).toContain('classification?.categoryValues?.[i]');
    expect(source).toContain(
      'classification?.labels?.[i] ?? categoryLabels[i] ?? value'
    );
    expect(source).toContain('colors[i % Math.max(colors.length, 1)]');
    expect(source).toContain('value,');
    expect(source).toContain('enabled: !disabledLabels.includes(value)');
  });

  it('should normalize validated category drafts before updating ClassificationConfig', () => {
    expect(source).toContain(
      'const resolvedColors = resolveValidatedCategoryColors'
    );
    expect(source).toContain(
      'labels: normalizedCategories.map((category) => category.label)'
    );
    expect(source).toContain('categoryValues: normalizedCategories.map(');
    expect(source).toContain('disabledLabels: normalizedCategories');
    expect(source).toContain(
      '.map((category) => category.value ?? category.label)'
    );
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

  it('should only enable the common aspect block for polygon fill or explicit common-aspect handlers', () => {
    expect(source).toContain('const resolvedShowCategoriesCommonAspect');
    expect(source).toContain("categoriesVariant === 'polygons'");
    expect(source).toContain('Boolean(onCategoriesCommonAspectChange)');
  });

  it('derives the common pattern id and params directly from the selected motif', () => {
    expect(source).toContain('function resolveValidatedCategoryPatternId');
    expect(source).toContain("categoriesVariant === 'polygons'");
    expect(source).toContain("categoriesVariant.startsWith('symbols')");
    expect(source).toContain("commonAspect.patternId ?? 'diagonal'");
    expect(source).not.toContain('coerceCategoryPatternId');
    expect(source).not.toContain('const existingPatternId');
    expect(source).toContain(
      'const patternId = resolveValidatedCategoryPatternId'
    );
    expect(source).toContain('patternId,');
    expect(source).toContain(
      'patternParams: patternId ? commonAspect.patternParams : undefined'
    );
  });
});
