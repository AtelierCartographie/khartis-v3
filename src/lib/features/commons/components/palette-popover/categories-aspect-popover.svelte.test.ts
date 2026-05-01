import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import { resetExclusiveContextualSurfaces } from '$lib/features/commons/utils/contextual-surface-coordinator';
import { generateCategoricalColorsFromSeed } from './palette.constants';
import CategoriesAspectPopover from './categories-aspect-popover.svelte';

vi.hoisted(() => {
  class WorkerMock {
    postMessage(): void {}

    terminate(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}
  }

  vi.stubGlobal('Worker', WorkerMock);
});

vi.mock('@ateliercartographie/ok-palette', async () => {
  const actual = await vi.importActual<
    typeof import('@ateliercartographie/ok-palette')
  >('@ateliercartographie/ok-palette');

  return {
    ...actual,
    resolvePalette: (colors: string[]) =>
      colors.map((_, i) => {
        const v = (i * 37) % 256;
        return [v, (v + 40) % 256, (v + 80) % 256, 255] as [
          number,
          number,
          number,
          number
        ];
      })
  };
});

const source = readFileSync(
  resolve(import.meta.dirname, 'categories-aspect-popover.svelte'),
  'utf8'
);

afterEach(() => {
  cleanup();
  resetExclusiveContextualSurfaces();
});

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
    expect(source).toContain(
      'onQualitativePresetChange={handleQualitativePresetChange}'
    );
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

  it('should apply a Khartis suggestion as a full categorical palette', () => {
    expect(source).toContain('function applySuggestionPalette');
    expect(source).toContain('generateCategoricalColorsFromSeed(');
    expect(source).toContain('draftQualitativePreset');
    expect(source).toContain('draftSuggestionSeedColor = seedHex');
    expect(source).toContain(
      'draftCategories = draftCategories.map((category, index)'
    );
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
    expect(source).toContain('const supportsCommonAspect = $derived(');
    expect(source).toContain('{#if showCommonAspectSection}');
    expect(source).toContain('{m.aspect_common_section()}');
    expect(source).toContain('{m.aspect_common_size_unique()}');
    expect(source).toContain('{m.aspect_common_stroke_yesno()}');
    expect(source).toContain('{m.aspect_common_auto_color()}');
    expect(source).toContain('{m.aspect_common_pattern()}');
  });

  it('should gate the common section by opener capability', () => {
    expect(source).toContain('showCommonAspect?: boolean');
    expect(source).toContain('showCommonAspect: commonAspectEnabled = true');
    expect(source).toContain('commonAspectEnabled && supportsCommonAspect');
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

  it('disables automatic stroke options when the common stroke is disabled', () => {
    expect(source).toContain("key === 'stroke' && value === false");
    expect(source).toContain('autoColor: false');
    expect(source).toContain('strokeUnique: false');
    expect(source).toContain('disabled={!draftCommonAspect.stroke}');
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

  it('should keep nested color surfaces from closing the whole categories popover', () => {
    expect(source).toContain('function isNestedColorSurface');
    expect(source).toContain("target.id === 'khartis-color-picker-dropdown'");
    expect(source).toContain(
      "target.classList.contains('single-color-dropdown')"
    );
    expect(source).toContain("target.classList.contains('palette-popover')");
    expect(source).toContain(
      'if (isNestedColorSurface(e.composedPath())) return'
    );
  });
});

describe('CategoriesAspectPopover runtime', () => {
  it('shows only the common pattern control for the polygons variant', async () => {
    render(CategoriesAspectPopover, {
      open: true,
      variant: 'polygons',
      categories: [
        {
          id: 'category-a',
          label: 'Category A',
          color: '#ff595e',
          enabled: true
        }
      ]
    });

    expect(screen.getByText(m.aspect_common_section())).toBeInTheDocument();
    expect(screen.getByText(m.aspect_common_pattern())).toBeInTheDocument();
    expect(
      screen.queryByText(m.aspect_common_size_unique())
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(m.aspect_common_stroke_yesno())
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(m.aspect_common_auto_color())
    ).not.toBeInTheDocument();
  });

  it('does not show a common section for line and text variants', async () => {
    for (const variant of ['lines', 'texts'] as const) {
      const { unmount } = render(CategoriesAspectPopover, {
        open: true,
        variant,
        categories: [
          {
            id: 'category-a',
            label: 'Category A',
            color: '#ff595e',
            enabled: true
          }
        ]
      });

      expect(
        screen.queryByText(m.aspect_common_section())
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(m.palette_categories_custom_section())
      ).toBeInTheDocument();

      unmount();
    }
  });

  it('hides the common section when the opener does not support it', async () => {
    render(CategoriesAspectPopover, {
      open: true,
      variant: 'symbols-unique',
      showCommonAspect: false,
      categories: [
        {
          id: 'category-a',
          label: 'Category A',
          color: '#ff595e',
          enabled: true
        }
      ]
    });

    expect(
      screen.queryByText(m.aspect_common_section())
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(m.palette_categories_custom_section())
    ).toBeInTheDocument();
  });

  it('applies a Khartis suggestion to every category before validation', async () => {
    const onvalidate = vi.fn();

    render(CategoriesAspectPopover, {
      open: true,
      variant: 'polygons',
      categories: [
        {
          id: 'category-a',
          label: 'Category A',
          color: '#111111',
          enabled: true
        },
        {
          id: 'category-b',
          label: 'Category B',
          color: '#222222',
          enabled: true
        },
        {
          id: 'category-c',
          label: 'Category C',
          color: '#333333',
          enabled: true
        }
      ],
      onvalidate
    });

    await fireEvent.click(screen.getByRole('radio', { name: '#00ad92' }));
    await fireEvent.click(
      screen.getByRole('button', { name: m.button_validate() })
    );

    expect(onvalidate).toHaveBeenCalledOnce();
    const [nextCategories] = onvalidate.mock.calls[0];

    expect(
      nextCategories.map((category: { color: string }) => category.color)
    ).toEqual(generateCategoricalColorsFromSeed('#00ad92', 3));
  });

  it('keeps the parent dialog open after selecting a category color preset', async () => {
    render(CategoriesAspectPopover, {
      open: true,
      variant: 'polygons',
      categories: [
        {
          id: 'category-a',
          label: 'Category A',
          color: '#ff595e',
          enabled: true
        }
      ]
    });

    const dialog = await screen.findByRole('dialog', {
      name: m.palette_categories_aspect_title()
    });

    expect(dialog).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: m.color() }));

    await waitFor(() => {
      expect(
        document.body.querySelector('.single-color-dropdown')
      ).toBeInTheDocument();
    });

    await fireEvent.click(screen.getAllByRole('option')[0]);

    expect(
      screen.getByRole('dialog', {
        name: m.palette_categories_aspect_title()
      })
    ).toBeInTheDocument();
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
