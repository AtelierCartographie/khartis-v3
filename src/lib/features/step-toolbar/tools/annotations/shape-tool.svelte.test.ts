import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { tick } from 'svelte';
import '$lib/features/commons/stores/locale.store.svelte';
import { SHAPE_TYPE } from '$lib/features/commons/constants';
import { AnnotationKind } from '$lib/features/commons/constants/ui.constants';
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

  it('should update the selected shape type before starting another placement', async () => {
    annotationsActions.addAnnotation(
      AnnotationKind.SHAPE,
      SHAPE_TYPE.RECTANGLE
    );
    const selected = getAnnotationsState().items.at(-1);
    expect(selected).toBeDefined();
    if (!selected) return;

    annotationsActions.selectAnnotation(selected.id);
    render(ShapeTool);

    await fireEvent.change(screen.getByRole('combobox', { name: m.shape() }), {
      target: { value: SHAPE_TYPE.TRIANGLE }
    });
    await fireEvent.click(
      screen.getByRole('button', { name: m.annotations_add_shape() })
    );

    expect(
      getAnnotationsState().items.find((item) => item.id === selected.id)
        ?.content
    ).toBe(SHAPE_TYPE.TRIANGLE);
    expect(getAnnotationsState().pendingContent).toBe(SHAPE_TYPE.TRIANGLE);
  });
});
