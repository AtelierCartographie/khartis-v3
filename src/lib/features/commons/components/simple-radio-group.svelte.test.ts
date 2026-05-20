import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SimpleRadioGroup from './simple-radio-group.svelte';

describe('SimpleRadioGroup', () => {
  const items = [
    { value: 'a', labelText: 'Option A' },
    { value: 'b', labelText: 'Option B' },
    { value: 'c', labelText: 'Option C' }
  ];

  it('renders one radio per item with the shared name attribute', () => {
    const { getAllByRole } = render(SimpleRadioGroup, {
      items,
      selected: 'a',
      name: 'test-group'
    });
    const radios = getAllByRole('radio') as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    expect(radios.every((r) => r.name === 'test-group')).toBe(true);
  });

  it('marks the selected option as checked', () => {
    const { getAllByRole } = render(SimpleRadioGroup, {
      items,
      selected: 'b',
      name: 'test-group'
    });
    const radios = getAllByRole('radio') as HTMLInputElement[];
    expect(radios[0].checked).toBe(false);
    expect(radios[1].checked).toBe(true);
    expect(radios[2].checked).toBe(false);
  });

  it('invokes onchange with the picked value and skips no-op selections', async () => {
    const onchange = vi.fn();
    const { getAllByRole } = render(SimpleRadioGroup, {
      items,
      selected: 'a',
      name: 'test-group',
      onchange
    });
    const radios = getAllByRole('radio') as HTMLInputElement[];
    await fireEvent.click(radios[2]);
    expect(onchange).toHaveBeenCalledWith('c');
  });

  it('renders the legend when provided', () => {
    const { getByText } = render(SimpleRadioGroup, {
      items,
      selected: 'a',
      name: 'test-group',
      legendText: 'My options'
    });
    expect(getByText('My options')).toBeTruthy();
  });

  it('respects per-item disabled', () => {
    const { getAllByRole } = render(SimpleRadioGroup, {
      items: [
        { value: 'a', labelText: 'A' },
        { value: 'b', labelText: 'B', disabled: true }
      ],
      selected: 'a',
      name: 'test-group'
    });
    const radios = getAllByRole('radio') as HTMLInputElement[];
    expect(radios[0].disabled).toBe(false);
    expect(radios[1].disabled).toBe(true);
  });
});
