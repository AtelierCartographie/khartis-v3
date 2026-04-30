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

  it('uses the Aspect selon label for the category variable picker', () => {
    expect(source).toContain('{m.aspect_according()}');
  });

  it('propagates categoryShape choices through onModesChange', () => {
    expect(source).toContain('onModesChange?.({ categoryShape: next })');
  });

  it('renders the qualitative palette preview and opacity slider', () => {
    expect(source).toContain('PalettePreview');
    expect(source).toContain('label={m.opacity()}');
  });

  it('renders the shared StrokeSection below missing data to match the Figma Contour block', () => {
    expect(source).toContain('StrokeSection');
    expect(source).toContain('infoText={m.stroke_section_info()}');
    expect(source).toContain('showDashed={true}');
    expect(source).toContain(
      'strokeClassification={visualization?.symbol?.strokeClassification}'
    );
    expect(source).toContain(
      'strokeCategoryColumn={visualization?.symbol?.strokeCategoryColumn}'
    );
    expect(source).toContain(
      'strokeValueColumn={visualization?.symbol?.strokeValueColumn}'
    );
  });

  it('wires PalettePreview with paletteType=QUALITATIVE so the popover shows the Couleur title', () => {
    expect(source).toContain('paletteType={PALETTE_TYPE.QUALITATIVE}');
    expect(source).toContain(
      "from '$lib/features/commons/components/palette-popover/palette.constants'"
    );
  });

  it('enables the Categories Aspect popover via categoriesMode + categoryLabels', () => {
    expect(source).toContain('categoriesMode={true}');
    expect(source).toContain('const resolvedCategoryLabels = $derived(');
    expect(source).toContain('categoryLabels={resolvedCategoryLabels}');
    expect(source).toContain(
      'disabledCategoryLabels={visualization?.symbol?.classification'
    );
    expect(source).toContain('categoriesCommonAspect={categoriesCommonAspect}');
  });

  it('hydrates missing category labels from the dataset when the classification mirror is empty', () => {
    expect(source).toContain(
      "import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte'"
    );
    expect(source).toContain(
      "import { useCategoryLabels } from '../../use-category-labels.svelte';"
    );
    expect(source).toContain('syncFetchedCategoryLabels(');
    expect(source).toContain('const categoryLabels = useCategoryLabels({');
    expect(source).toContain('onResolvedLabels: syncFetchedCategoryLabels');
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

  it('maps category common aspect updates back to the point symbol primitive', () => {
    expect(source).toContain('function handleCategoriesCommonAspectChange');
    expect(source).toContain('resolveOrderedCategorySizeBounds');
    expect(source).toContain('symbolUpdates.minSize = minSize');
    expect(source).toContain('symbolUpdates.maxSize = maxSize');
    expect(source).toContain('disabledLabels: nextCategories');
    expect(source).toContain('onSymbolPrimitiveChange?.(symbolUpdates)');
    expect(source).toContain(
      'onCategoriesCommonAspectChange={handleCategoriesCommonAspectChange}'
    );
  });

  it('uses a dedicated categories-aspect trigger that stops propagation before opening the popover', () => {
    expect(source).toContain('class="categories-aspect-settings"');
    expect(source).toContain(
      'aria-label={m.palette_categories_aspect_title()}'
    );
    expect(source).toContain('event.stopPropagation();');
    expect(source).toContain('categoriesAspectOpen = true;');
  });

  it('opens a dedicated stroke discretization modal for contour classes', () => {
    expect(source).toContain('strokeDiscretizationModalOpen = $state(false)');
    expect(source).toContain('const strokeDiscretizationLabel = $derived.by');
    expect(source).toContain('<DiscretizationModal');
    expect(source).toContain('role="stroke"');
    expect(source).toContain(
      'classification={visualization?.symbol?.strokeClassification}'
    );
  });
});

describe('SymbolModeCategories — anti-leak classification routing', () => {
  it('routes PalettePreview strictly to onClassificationChange without fallback to a stroke handler', () => {
    const paletteBlock = source.split('<PalettePreview')[1]?.split('/>')[0];
    expect(paletteBlock).toBeDefined();
    expect(paletteBlock).toContain(
      'onClassificationChange={onClassificationChange}'
    );
    expect(paletteBlock).not.toContain('oninvert=');
    expect(paletteBlock).not.toMatch(
      /onClassificationChange\s*\?\?\s*onStrokeClassificationChange/
    );
  });

  it('never shadows onClassificationChange with any stroke-related callback', () => {
    expect(source).not.toMatch(
      /onClassificationChange\s*=\s*\{?onStrokeClassificationChange/
    );
    expect(source).not.toContain(
      'onStrokeClassificationChange ?? onClassificationChange'
    );
  });

  it('routes StrokeSection strictly to stroke-specific handlers', () => {
    const strokeBlock = source.split('<StrokeSection')[1]?.split('/>')[0];
    expect(strokeBlock).toBeDefined();
    expect(strokeBlock).toContain(
      'onStrokeClassificationChange={onStrokeClassificationChange'
    );
    expect(strokeBlock).toContain('onStyleChange={onStyleChange}');
    expect(strokeBlock).toContain(
      'onStrokeMappingChange={onStrokeMappingChange}'
    );
    expect(strokeBlock).toContain('onInvertPalette={onStrokeInvertPalette}');
    expect(strokeBlock).not.toContain(
      'onClassificationChange={onClassificationChange}'
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
