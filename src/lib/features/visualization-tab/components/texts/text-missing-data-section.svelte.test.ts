import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import TextMissingDataSection from './text-missing-data-section.svelte';

function renderSection(overrides = {}) {
  return render(TextMissingDataSection, {
    show: true,
    label: 'Missing data',
    color: '#ffffff',
    onShowChange: vi.fn(),
    onLabelChange: vi.fn(),
    onColorChange: vi.fn(),
    ...overrides
  });
}

describe('TextMissingDataSection', () => {
  it('keeps the missing-data label controlled by props and callback changes', async () => {
    const onLabelChange = vi.fn();
    const { container, rerender } = renderSection({ onLabelChange });
    const input = container.querySelector('#texts-missing-data-label');

    expect(input).toBeInstanceOf(HTMLInputElement);
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    expect(input.value).toBe('Missing data');

    await fireEvent.input(input, {
      target: { value: 'No response' }
    });

    expect(onLabelChange).toHaveBeenCalledWith('No response');

    await rerender({
      show: true,
      label: 'No response',
      color: '#ffffff',
      onShowChange: vi.fn(),
      onLabelChange,
      onColorChange: vi.fn()
    });

    expect(input.value).toBe('No response');
  });
});
