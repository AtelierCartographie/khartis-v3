import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SimpleCheckbox from './simple-checkbox.svelte';

describe('SimpleCheckbox', () => {
  it('renders a native checkbox and emits the next checked state', async () => {
    const onchange = vi.fn();

    render(SimpleCheckbox, {
      labelText: 'Layer',
      checked: false,
      onchange
    });

    const checkbox = screen.getByRole('checkbox', {
      name: 'Layer'
    }) as HTMLInputElement;

    await fireEvent.click(checkbox);

    expect(checkbox.checked).toBe(true);
    expect(onchange).toHaveBeenCalledWith(true);
  });

  it('does not stop native input handlers in the capture phase', () => {
    const source = SimpleCheckbox.toString();

    expect(source).not.toContain('capture: true');
  });
});
