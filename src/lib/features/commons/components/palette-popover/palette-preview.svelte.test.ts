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

afterEach(() => {
  cleanup();
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
