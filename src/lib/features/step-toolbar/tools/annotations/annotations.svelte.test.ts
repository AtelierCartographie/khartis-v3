import { render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import * as m from '$lib/paraglide/messages';
import Annotations from './annotations.svelte';
import { annotationsActions } from './annotations.store.svelte';

describe('annotations tool', () => {
  beforeEach(() => {
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
});
