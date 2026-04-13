import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import ShapeTool from './shape-tool.svelte';
import {
  annotationsActions,
  getAnnotationsState
} from './annotations.store.svelte';

describe('shape tool', () => {
  beforeEach(() => {
    annotationsActions.reset();
  });

  it('maps the dashed toggle to a dashed stroke style', async () => {
    render(ShapeTool);

    await fireEvent.click(screen.getByRole('switch'));

    expect(getAnnotationsState().defaultStyle.strokeStyle).toBe('dashed');
  });
});
