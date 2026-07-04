import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InfoPopover from './info-popover.svelte';

describe('InfoPopover', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears pending hover timeout on destroy', async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const { unmount } = render(InfoPopover, {
      text: 'Details'
    });

    const button = screen.getByRole('button', { name: /information/i });
    await fireEvent.mouseEnter(button);
    await fireEvent.mouseLeave(button);
    const hoverTimer = setTimeoutSpy.mock.results.find(
      (result, index) => setTimeoutSpy.mock.calls[index]?.[1] === 150
    )?.value;

    unmount();

    expect(hoverTimer).toBeDefined();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(hoverTimer);
  });
});
