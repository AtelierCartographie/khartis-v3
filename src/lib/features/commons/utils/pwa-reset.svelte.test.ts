import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPwaCachePrefix, resolvePwaScopeUrl } from './pwa-cache';
import {
  buildLastProjectRestoreFallbackUrl,
  clearLastProjectRestoreQuarantine,
  factoryResetPwa,
  isLastProjectRestoreQuarantined,
  quarantineLastProjectRestore,
  shouldSkipLastProjectRestore
} from './pwa-reset';

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

  it('should persist and remove a restore fallback URL when storage works', () => {
    window.history.pushState(
      {},
      '',
      '/cartographie/khartis/?restoreFallback=project-1#map'
    );

    expect(shouldSkipLastProjectRestore()).toBe(true);
    expect(isLastProjectRestoreQuarantined('project-1')).toBe(true);
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#map');
  });

  it('should build a scoped restore fallback URL without changing other parameters', () => {
    expect(
      buildLastProjectRestoreFallbackUrl(
        'https://example.org/cartographie/khartis/?kh=demo#map',
        'project-1'
      )
    ).toBe('/cartographie/khartis/?kh=demo&restoreFallback=project-1#map');
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

describe('last project restore quarantine', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should keep a failed project quarantined for the current tab session', () => {
    quarantineLastProjectRestore('project-1');

    expect(isLastProjectRestoreQuarantined('project-1')).toBe(true);
    expect(isLastProjectRestoreQuarantined('project-2')).toBe(false);
    expect(isLastProjectRestoreQuarantined('project-1')).toBe(true);
  });

  it('should clear the quarantine after a successful manual reopen', () => {
    quarantineLastProjectRestore('project-1');

    clearLastProjectRestoreQuarantine('project-1');

    expect(isLastProjectRestoreQuarantined('project-1')).toBe(false);
  });

  it('should quarantine every automatic restore when the project id is unknown', () => {
    quarantineLastProjectRestore();

    expect(isLastProjectRestoreQuarantined()).toBe(true);
    expect(isLastProjectRestoreQuarantined('project-1')).toBe(true);
  });

  it('should report when session storage cannot persist the quarantine', () => {
    const originalSessionStorage = Object.getOwnPropertyDescriptor(
      window,
      'sessionStorage'
    );
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        removeItem: () => {},
        setItem: () => {
          throw new DOMException('Storage disabled', 'SecurityError');
        }
      }
    });

    try {
      expect(quarantineLastProjectRestore('project-1')).toBe(false);
    } finally {
      if (originalSessionStorage) {
        Object.defineProperty(window, 'sessionStorage', originalSessionStorage);
      }
    }
  });

  it('should clear an older fallback URL after another project opens successfully', () => {
    window.history.pushState(
      {},
      '',
      '/cartographie/khartis/?restoreFallback=project-1'
    );

    clearLastProjectRestoreQuarantine('project-2');

    expect(window.location.search).toBe('');
  });
});
