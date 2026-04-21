import { render, screen } from '@testing-library/svelte';
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

  it('renders annotation type actions without crashing', () => {
    render(Annotations);

    expect(
      screen.getByRole('button', { name: m.annotations_text() })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: m.annotations_shape() })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: m.annotations_drawing() })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: m.annotations_image() })
    ).toBeInTheDocument();
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
});
