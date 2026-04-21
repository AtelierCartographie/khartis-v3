import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import * as m from '$lib/paraglide/messages';
import MarginsEditor from './margins-editor.svelte';
import { formatActions, getFormatState } from './format.store.svelte';

describe('margins editor', () => {
  beforeEach(() => {
    formatActions.reset();
  });

  it('renders the current margin values in the numeric inputs', () => {
    render(MarginsEditor);

    expect(
      screen.getByRole('spinbutton', {
        name: m.format_margin_top()
      })
    ).toHaveValue(32);
    expect(
      screen.getByRole('spinbutton', {
        name: m.format_margin_bottom()
      })
    ).toHaveValue(32);
    expect(
      screen.getByRole('spinbutton', {
        name: m.format_margin_left()
      })
    ).toHaveValue(32);
    expect(
      screen.getByRole('spinbutton', {
        name: m.format_margin_right()
      })
    ).toHaveValue(32);
  });

  it('updates the format store when a margin changes', async () => {
    render(MarginsEditor);

    const input = screen.getByRole('spinbutton', {
      name: m.format_margin_top()
    });

    await fireEvent.input(input, {
      target: { value: '48' }
    });

    expect(getFormatState().margins.top).toBe(48);
  });
});
