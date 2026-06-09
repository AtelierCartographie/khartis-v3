import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shouldSkipLastProjectRestore } from './pwa-reset';

const RESET_FLAG = 'kh:reset-skip-restore';

describe('shouldSkipLastProjectRestore', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
    sessionStorage.clear();
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
    sessionStorage.clear();
  });

  it('does not skip restore on a clean load with no reset signal', () => {
    expect(shouldSkipLastProjectRestore()).toBe(false);
  });

  it('skips restore while ?reset is in the URL without consuming the session flag', () => {
    window.history.pushState({}, '', '/?reset=1');
    sessionStorage.setItem(RESET_FLAG, '1');

    expect(shouldSkipLastProjectRestore()).toBe(true);
    expect(sessionStorage.getItem(RESET_FLAG)).toBe('1');
  });

  it('consumes the one-shot session flag on the clean post-reset load', () => {
    sessionStorage.setItem(RESET_FLAG, '1');

    expect(shouldSkipLastProjectRestore()).toBe(true);
    expect(sessionStorage.getItem(RESET_FLAG)).toBeNull();
    expect(shouldSkipLastProjectRestore()).toBe(false);
  });
});
