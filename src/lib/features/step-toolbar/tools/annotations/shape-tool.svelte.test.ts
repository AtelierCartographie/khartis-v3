import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { tick } from 'svelte';
import '$lib/features/commons/stores/locale.store.svelte';
import * as m from '$lib/paraglide/messages';
import { setLocale } from '$lib/paraglide/runtime.js';
import ShapeTool from './shape-tool.svelte';
import {
  annotationsActions,
  getAnnotationsState
} from './annotations.store.svelte';

async function setTestLocale(locale: 'fr' | 'en'): Promise<void> {
  await Promise.resolve(setLocale(locale, { reload: false }));
  await tick();
}

describe('shape tool', () => {
  beforeEach(async () => {
    annotationsActions.reset();
    await setTestLocale('fr');
  });

  it('maps the dashed toggle to a dashed stroke style', async () => {
    render(ShapeTool);

    await fireEvent.click(screen.getByRole('switch'));

    expect(getAnnotationsState().defaultStyle.strokeStyle).toBe('dashed');
  });

  it('updates shape option labels when the locale changes without a reload', async () => {
    render(ShapeTool);

    const frArrowLabel = m.annotations_shape_arrow();
    expect(screen.getByText(frArrowLabel)).toBeInTheDocument();

    await setTestLocale('en');

    expect(screen.getByText(m.annotations_shape_arrow())).toBeInTheDocument();
    expect(screen.queryByText(frArrowLabel)).not.toBeInTheDocument();
  });
});
