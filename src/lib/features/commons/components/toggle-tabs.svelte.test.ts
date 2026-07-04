import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ToggleTabs from './toggle-tabs.svelte';

describe('ToggleTabs', () => {
  it('invokes the lowercase onchange prop when a different tab is clicked', async () => {
    const onchange = vi.fn();
    const { getByRole } = render(ToggleTabs, {
      activeIndex: 0,
      items: [{ label: 'Unique' }, { label: 'Classes' }],
      onchange
    });

    await fireEvent.click(getByRole('button', { name: 'Classes' }));

    expect(onchange).toHaveBeenCalledWith(1);
  });

  it('exposes the active tab as pressed', () => {
    const { getByRole } = render(ToggleTabs, {
      activeIndex: 0,
      items: [{ label: 'Unique' }, { label: 'Classes' }]
    });

    expect(getByRole('button', { name: 'Unique' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(getByRole('button', { name: 'Classes' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('ignores clicks on the already active tab', async () => {
    const onchange = vi.fn();
    const { getByRole } = render(ToggleTabs, {
      activeIndex: 0,
      items: [{ label: 'Unique' }, { label: 'Classes' }],
      onchange
    });

    await fireEvent.click(getByRole('button', { name: 'Unique' }));

    expect(onchange).not.toHaveBeenCalled();
  });

  it('invokes the lowercase ondblclick prop on double click', async () => {
    const ondblclick = vi.fn();
    const { getByRole } = render(ToggleTabs, {
      activeIndex: 0,
      items: [{ label: 'Unique' }, { label: 'Classes' }],
      ondblclick
    });

    await fireEvent.dblClick(getByRole('button', { name: 'Classes' }));

    expect(ondblclick).toHaveBeenCalledWith(1);
  });
});
