import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SliderWithInput from './slider-with-input.svelte';

describe('SliderWithInput', () => {
  it('updates from the numeric input and emits the new value', async () => {
    const onchange = vi.fn();

    render(SliderWithInput, {
      label: 'Zoom',
      value: 50,
      min: 0,
      max: 100,
      onchange
    });

    const input = screen.getByRole('spinbutton', { name: 'Zoom' });

    await fireEvent.input(input, {
      target: { value: '75' }
    });

    expect(onchange).toHaveBeenCalledWith(75);
    expect(input).toHaveValue(75);
  });

  it('keeps the numeric input disabled when requested', () => {
    render(SliderWithInput, {
      label: 'Zoom',
      value: 50,
      min: 0,
      max: 100,
      disabled: true
    });

    expect(screen.getByRole('spinbutton', { name: 'Zoom' })).toBeDisabled();
  });
});
