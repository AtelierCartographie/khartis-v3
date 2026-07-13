import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPwaCachePrefix, resolvePwaScopeUrl } from './pwa-cache';
import { factoryResetPwa, shouldSkipLastProjectRestore } from './pwa-reset';

function resetFlag(baseUri = document.baseURI): string {
  return `${createPwaCachePrefix(resolvePwaScopeUrl(baseUri))}reset-skip-restore`;
}

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
    sessionStorage.setItem(resetFlag(), '1');

    expect(shouldSkipLastProjectRestore()).toBe(true);
    expect(sessionStorage.getItem(resetFlag())).toBe('1');
  });

  it('consumes the one-shot session flag on the clean post-reset load', () => {
    sessionStorage.setItem(resetFlag(), '1');

    expect(shouldSkipLastProjectRestore()).toBe(true);
    expect(sessionStorage.getItem(resetFlag())).toBeNull();
    expect(shouldSkipLastProjectRestore()).toBe(false);
  });

  it('ignores a one-shot reset flag from another deployment scope', () => {
    sessionStorage.setItem(
      resetFlag('https://example.org/cartographie/khartisnewpprd/'),
      '1'
    );

    expect(shouldSkipLastProjectRestore()).toBe(false);
  });
});

describe('factoryResetPwa', () => {
  let originalServiceWorker: PropertyDescriptor | undefined;
  let baseElement: HTMLBaseElement;

  beforeEach(() => {
    originalServiceWorker = Object.getOwnPropertyDescriptor(
      navigator,
      'serviceWorker'
    );
    baseElement = document.createElement('base');
    baseElement.href = 'https://example.org/cartographie/khartis-prod/';
    document.head.prepend(baseElement);
  });

  afterEach(() => {
    baseElement.remove();
    vi.unstubAllGlobals();
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
    } else {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });

  it('should clear only the current Khartis scope when a factory reset runs', async () => {
    const currentScope = 'https://example.org/cartographie/khartis-prod/';
    const otherScope = 'https://example.org/cartographie/khartis-pprd/';
    const unregisterCurrent = vi.fn().mockResolvedValue(true);
    const unregisterOther = vi.fn().mockResolvedValue(true);
    const postMessage = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: { postMessage },
        getRegistrations: vi.fn().mockResolvedValue([
          { scope: currentScope, unregister: unregisterCurrent },
          { scope: otherScope, unregister: unregisterOther }
        ])
      }
    });

    const currentCache = `${createPwaCachePrefix(currentScope)}images`;
    const otherCache = `${createPwaCachePrefix(otherScope)}images`;
    const deleteCache = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', {
      delete: deleteCache,
      keys: vi
        .fn()
        .mockResolvedValue([currentCache, otherCache, 'unrelated-cache'])
    });

    await factoryResetPwa({ reload: false });

    expect(postMessage).toHaveBeenCalledWith({ type: 'FACTORY_RESET' });
    expect(unregisterCurrent).toHaveBeenCalledTimes(1);
    expect(unregisterOther).not.toHaveBeenCalled();
    expect(deleteCache).toHaveBeenCalledTimes(1);
    expect(deleteCache).toHaveBeenCalledWith(currentCache);
  });
});
