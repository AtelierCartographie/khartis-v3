import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ToggleTabs from './toggle-tabs.svelte';

describe('ToggleTabs', () => {
  it('ignores clicks on the active tab', async () => {
    const onChange = vi.fn();
    const { container } = render(ToggleTabs, {
      props: {
        items: [{ label: 'A' }, { label: 'B' }],
        activeIndex: 1,
        onChange
      }
    });

    const buttons = container.querySelectorAll('button');
    await fireEvent.click(buttons[1]);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('still emits changes for inactive tabs', async () => {
    const onChange = vi.fn();
    const { container } = render(ToggleTabs, {
      props: {
        items: [{ label: 'A' }, { label: 'B' }],
        activeIndex: 0,
        onChange
      }
    });

    const buttons = container.querySelectorAll('button');
    await fireEvent.click(buttons[1]);

    expect(onChange).toHaveBeenCalledWith(1);
  });
});
