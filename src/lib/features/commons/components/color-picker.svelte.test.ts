import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ColorPicker from './color-picker.svelte';

describe('ColorPicker', () => {
  it('uses the trigger label as the accessible button name', () => {
    render(ColorPicker, {
      triggerLabel: 'Couleur des textes'
    });

    expect(
      screen.getByRole('button', { name: /couleur des textes/i })
    ).toBeInTheDocument();
  });

  it('applies a typed hex color through the dialog', async () => {
    const onValidate = vi.fn();

    render(ColorPicker, {
      triggerLabel: 'Couleur des textes',
      onValidate
    });

    await fireEvent.click(
      screen.getByRole('button', { name: /couleur des textes/i })
    );

    await fireEvent.input(screen.getByLabelText(/code hexadécimal/i), {
      target: { value: '#FF0000' }
    });
    await fireEvent.click(screen.getByRole('button', { name: /appliquer/i }));

    expect(onValidate).toHaveBeenCalledWith({
      hex: '#FF0000',
      hue: 0,
      saturation: 100,
      lightness: 50
    });
  });
});
