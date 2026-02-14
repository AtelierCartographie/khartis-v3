import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PAGE_PRESETS,
  PageModel
} from '$lib/features/commons/constants/ui.constants';
import { formatActions, formatState } from './format.store.svelte';
import ModelSelect from './model-select.svelte';

afterEach(cleanup);

describe('ModelSelect', () => {
  beforeEach(() => {
    formatActions.reset();
  });

  it('updates format model and dimensions when selecting a new preset', async () => {
    render(ModelSelect);

    const select = screen.getByRole('combobox');

    await fireEvent.change(select, {
      target: { value: PageModel.A3_PORTRAIT }
    });

    expect(formatState.model).toBe(PageModel.A3_PORTRAIT);
    expect(formatState.width).toBe(PAGE_PRESETS[PageModel.A3_PORTRAIT].width);
    expect(formatState.height).toBe(PAGE_PRESETS[PageModel.A3_PORTRAIT].height);
  });
});
