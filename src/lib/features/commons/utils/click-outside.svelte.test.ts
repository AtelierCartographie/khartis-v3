import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT } from '../constants/dom.constants';
import { clickOutside } from './click-outside';

describe('clickOutside', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not attach a deferred document click listener after destroy', async () => {
    vi.useFakeTimers();
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const node = document.createElement('div');

    const action = clickOutside(node);
    action.destroy();
    await vi.advanceTimersByTimeAsync(0);

    expect(addEventListener).not.toHaveBeenCalledWith(
      EVENT.CLICK,
      expect.any(Function),
      true
    );
  });
});
