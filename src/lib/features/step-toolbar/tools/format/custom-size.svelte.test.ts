import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import * as m from '$lib/paraglide/messages';
import CustomSize from './custom-size.svelte';
import { formatActions, getFormatState } from './format.store.svelte';

describe('custom size', () => {
  beforeEach(() => {
    formatActions.reset();
  });

  it('renders the current size values in the numeric inputs', () => {
    render(CustomSize);

    expect(
      screen.getByRole('spinbutton', {
        name: m.format_width()
      })
    ).toHaveValue(842);
    expect(
      screen.getByRole('spinbutton', {
        name: m.format_height()
      })
    ).toHaveValue(595);
  });

  it('updates the format store when the custom width changes', async () => {
    render(CustomSize);

    const input = screen.getByRole('spinbutton', {
      name: m.format_width()
    });

    await fireEvent.input(input, {
      target: { value: '900' }
    });

    expect(getFormatState().width).toBe(900);
  });
});
