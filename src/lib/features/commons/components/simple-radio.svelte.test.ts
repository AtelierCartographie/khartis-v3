import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import SimpleRadio from './simple-radio.svelte';

describe('SimpleRadio', () => {
  it('renders an unchecked radio input by default', () => {
    const { getByRole } = render(SimpleRadio, { labelText: 'option' });
    const input = getByRole('radio') as HTMLInputElement;
    expect(input.checked).toBe(false);
  });

  it('reflects the checked prop', () => {
    const { getByRole } = render(SimpleRadio, {
      checked: true,
      labelText: 'on'
    });
    expect((getByRole('radio') as HTMLInputElement).checked).toBe(true);
  });

  it('fires onchange with the next checked value on click', async () => {
    const onchange = vi.fn();
    const { getByRole } = render(SimpleRadio, {
      labelText: 'click me',
      onchange
    });
    await fireEvent.click(getByRole('radio'));
    expect(onchange).toHaveBeenCalledWith(true);
  });

  it('propagates click events to ancestors so card wrappers can react', async () => {
    const ancestorClick = vi.fn();
    const wrapper = document.createElement('div');
    wrapper.addEventListener('click', ancestorClick);
    document.body.appendChild(wrapper);
    const { getByRole } = render(SimpleRadio, {
      target: wrapper,
      props: { labelText: 'card-radio' }
    });
    await fireEvent.click(getByRole('radio'));
    expect(ancestorClick).toHaveBeenCalled();
    wrapper.remove();
  });
});
