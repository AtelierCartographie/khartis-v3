import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import { ANNOTATION_ROLE } from '$lib/features/commons/constants';
import * as m from '$lib/paraglide/messages';
import Annotations from './annotations.svelte';
import {
  annotationsActions,
  getAnnotationsState
} from './annotations.store.svelte';
import { formatActions } from '../format/format.store.svelte';

describe('annotations tool', () => {
  beforeEach(() => {
    formatActions.reset();
    annotationsActions.reset();
  });

  it('matches the figma default text controls for note annotations', () => {
    render(Annotations);

    const addTextButton = screen.getByRole('button', {
      name: m.annotations_add_text()
    });
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];

    expect(addTextButton).toBeEnabled();
    expect(selects[0]?.value).toBe(ANNOTATION_ROLE.NOTE);
    expect(selects.at(-1)?.value).toBe('8');
  });

  it('keeps the text font-size and predefined style controls in sync for title page elements', () => {
    annotationsActions.initPageElements({ withPlaceholders: true });

    const title = getAnnotationsState().items.find(
      (item) => item.role === ANNOTATION_ROLE.TITLE
    );

    expect(title).toBeDefined();
    if (!title) {
      return;
    }

    annotationsActions.selectAnnotation(title.id);

    render(Annotations);

    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];

    expect(selects[0]?.value).toBe(ANNOTATION_ROLE.TITLE);
    expect(selects.at(-1)?.value).toBe('14');
  });

  it('should apply shape slider values entered through the numeric input', async () => {
    render(Annotations);

    await fireEvent.click(
      screen.getByRole('button', { name: m.annotations_shape() })
    );
    await fireEvent.change(
      screen.getByRole('spinbutton', { name: m.thickness() }),
      { target: { value: '6' } }
    );

    expect(getAnnotationsState().defaultStyle.strokeWidth).toBe(6);
  });

  it('should apply drawing slider values entered through the numeric input', async () => {
    render(Annotations);

    await fireEvent.click(
      screen.getByRole('button', { name: m.annotations_drawing() })
    );
    await fireEvent.change(
      screen.getByRole('spinbutton', { name: m.annotations_smoothness() }),
      { target: { value: '35' } }
    );

    expect(getAnnotationsState().defaultStyle.smoothness).toBe(35);
  });

  it('should apply image slider values entered through the numeric input', async () => {
    render(Annotations);

    await fireEvent.click(
      screen.getByRole('button', { name: m.annotations_image() })
    );
    await fireEvent.change(
      screen.getByRole('spinbutton', { name: m.annotations_size() }),
      { target: { value: '320' } }
    );

    expect(getAnnotationsState().defaultStyle.size).toBe(320);
  });

  it('should apply text slider values entered through the numeric input', async () => {
    render(Annotations);

    const [opacityInput] = screen.getAllByRole('spinbutton', {
      name: m.annotations_opacity()
    });
    await fireEvent.change(opacityInput, { target: { value: '65' } });

    expect(getAnnotationsState().defaultStyle.opacity).toBe(65);
  });
});
