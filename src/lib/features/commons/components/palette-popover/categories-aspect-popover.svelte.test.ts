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
import {
  DEFAULT_QUALITATIVE_PRESET,
  getQualitativeColorGroups
} from './palette.constants';
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

afterEach(() => {
  cleanup();
  resetExclusiveContextualSurfaces();
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

  it('applies a whole Khartis palette band to every category before validation', async () => {
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

    const mixteColors = getQualitativeColorGroups(
      DEFAULT_QUALITATIVE_PRESET,
      false
    ).mixte;

    await fireEvent.click(
      screen.getByRole('button', { name: m.palette_theme_mixte() })
    );
    await fireEvent.click(
      screen.getByRole('button', { name: m.button_validate() })
    );

    expect(onvalidate).toHaveBeenCalledOnce();
    const [nextCategories] = onvalidate.mock.calls[0];

    expect(
      nextCategories.map((category: { color: string }) => category.color)
    ).toEqual(
      [0, 1, 2].map((index) => mixteColors[index % mixteColors.length])
    );
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
