import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

interface RecoveryEvent {
  error?: unknown;
  filename?: string;
  message?: unknown;
  preventDefault: ReturnType<typeof vi.fn>;
  reason?: unknown;
  target?: {
    href?: string;
    src?: string;
  };
}

type RecoveryListener = (event: RecoveryEvent) => void;

const appHtml = readFileSync(
  path.resolve(process.cwd(), 'src/app.html'),
  'utf8'
);
const staleRecoveryMatch = appHtml.match(
  /<script id="khartis-stale-asset-recovery">([\s\S]*?)<\/script>/
);
if (!staleRecoveryMatch) {
  throw new Error('Could not find the stale asset recovery bootstrap.');
}
const staleRecoveryScript = staleRecoveryMatch[1];

function recoveryStorageKey(basePath: string, key: string): string {
  const scopePath = basePath.replace(/\/+$/, '') || '/';
  return `khartis:${encodeURIComponent(scopePath)}:${key}`;
}

function createRecoveryHarness({
  basePath = '/cartographie/khartis',
  lastReload,
  lastReset,
  now = 1_000_000,
  storageThrows = false,
  flushBeforeRecovery
}: {
  basePath?: string;
  lastReload?: number;
  lastReset?: number;
  now?: number;
  storageThrows?: boolean;
  flushBeforeRecovery?: () => Promise<boolean>;
} = {}) {
  const listeners = new Map<string, RecoveryListener[]>();
  const storage = new Map<string, string>();
  if (lastReload !== undefined) {
    storage.set(
      recoveryStorageKey(basePath, 'auto-reloaded-at'),
      String(lastReload)
    );
  }
  if (lastReset !== undefined) {
    storage.set(
      recoveryStorageKey(basePath, 'auto-reset-at'),
      String(lastReset)
    );
  }

  const reload = vi.fn();
  const replace = vi.fn();
  const consoleError = vi.fn();
  const window = {
    addEventListener(
      type: string,
      listener: RecoveryListener,
      _options?: unknown
    ) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    location: {
      href: 'https://example.org/cartographie/khartis/?project=1#map',
      reload,
      replace
    },
    __khartisFlushBeforePwaRecovery: flushBeforeRecovery,
    sessionStorage: {
      getItem(key: string) {
        if (storageThrows) throw new Error('storage unavailable');
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        if (storageThrows) throw new Error('storage unavailable');
        storage.set(key, value);
      }
    }
  };

  runInNewContext(
    staleRecoveryScript.replaceAll('%sveltekit.assets%', basePath),
    {
      Date: { now: () => now },
      URL,
      console: { error: consoleError },
      window
    }
  );

  function trigger(
    type: string,
    values: Omit<RecoveryEvent, 'preventDefault'> = {}
  ): RecoveryEvent {
    const event: RecoveryEvent = {
      ...values,
      preventDefault: vi.fn()
    };
    for (const listener of listeners.get(type) ?? []) listener(event);
    return event;
  }

  return { consoleError, reload, replace, storage, trigger };
}

describe('stale asset recovery bootstrap', () => {
  it('should reload exactly once when the first preload error occurs', () => {
    const harness = createRecoveryHarness();

    const event = harness.trigger('vite:preloadError');

    expect(harness.reload).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(harness.replace).not.toHaveBeenCalled();
  });

  it('should reload only once when several stale events occur in one document', () => {
    const harness = createRecoveryHarness();

    const preloadEvent = harness.trigger('vite:preloadError');
    const rejectionEvent = harness.trigger('unhandledrejection', {
      reason: new Error('Failed to fetch dynamically imported module')
    });
    const errorEvent = harness.trigger('error', {
      message: 'Loading chunk 42 failed'
    });

    expect(harness.reload).toHaveBeenCalledTimes(1);
    expect(preloadEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(rejectionEvent.preventDefault).not.toHaveBeenCalled();
    expect(errorEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('should run one targeted reset when a reload did not recover the app', () => {
    const now = 1_000_000;
    const harness = createRecoveryHarness({
      lastReload: now - 1_000,
      now
    });

    const event = harness.trigger('vite:preloadError');

    expect(harness.reload).not.toHaveBeenCalled();
    expect(harness.replace).toHaveBeenCalledWith(
      '/cartographie/khartis/?project=1&reset=1#map'
    );
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(harness.consoleError).not.toHaveBeenCalled();
    expect(
      harness.storage.get(
        recoveryStorageKey('/cartographie/khartis', 'auto-reset-at')
      )
    ).toBe(String(now));
  });

  it('should stop after a recent targeted reset to prevent a loop', () => {
    const now = 1_000_000;
    const harness = createRecoveryHarness({
      lastReload: now - 2_000,
      lastReset: now - 1_000,
      now
    });

    const event = harness.trigger('vite:preloadError');

    expect(harness.reload).not.toHaveBeenCalled();
    expect(harness.replace).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(harness.consoleError).toHaveBeenCalledTimes(1);
  });

  it('should disable automatic recovery when session storage is unavailable', () => {
    const harness = createRecoveryHarness({ storageThrows: true });

    const event = harness.trigger('vite:preloadError');

    expect(harness.reload).not.toHaveBeenCalled();
    expect(harness.replace).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(harness.consoleError).toHaveBeenCalledTimes(1);
  });

  it('should allow one new reload when the guard window has expired', () => {
    const now = 1_000_000;
    const harness = createRecoveryHarness({
      lastReload: now - 5 * 60 * 1_000 - 1,
      now
    });

    harness.trigger('vite:preloadError');

    expect(harness.reload).toHaveBeenCalledTimes(1);
    expect(harness.replace).not.toHaveBeenCalled();
  });

  it('should isolate recovery guards between deployment base paths', () => {
    const now = 1_000_000;
    const harness = createRecoveryHarness({
      basePath: '/cartographie/fr/outils/khartis/app',
      now
    });
    harness.storage.set(
      recoveryStorageKey('/cartographie/khartisnewpprd', 'auto-reloaded-at'),
      String(now - 1_000)
    );

    harness.trigger('vite:preloadError');

    expect(harness.reload).toHaveBeenCalledTimes(1);
    expect(harness.replace).not.toHaveBeenCalled();
  });

  it('should ignore unrelated promise failures when the message is not stale', () => {
    const harness = createRecoveryHarness();

    const event = harness.trigger('unhandledrejection', {
      reason: new Error('Unrelated application error')
    });

    expect(harness.reload).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it.each([
    '/cartographie/khartis/_app/immutable/entry/start.abc123.js',
    '/cartographie/khartis/assets/duckdb-browser.worker.js',
    '/cartographie/khartis/assets/duckdb-eh.wasm'
  ])(
    'should recover when a critical bootstrap resource fails to load: %s',
    (src) => {
      const harness = createRecoveryHarness();

      const event = harness.trigger('error', {
        target: { src }
      });

      expect(harness.reload).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    }
  );

  it('should recover when the browser rejects a module because of its MIME type', () => {
    const harness = createRecoveryHarness();

    const event = harness.trigger('error', {
      message:
        'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of text/html.'
    });

    expect(harness.reload).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('should ignore failed resources outside the application bootstrap', () => {
    const harness = createRecoveryHarness();

    const event = harness.trigger('error', {
      target: { src: 'https://example.org/unrelated-image.png' }
    });

    expect(harness.reload).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('should flush the current project before reloading an interactive app', async () => {
    const order: string[] = [];
    const harness = createRecoveryHarness({
      flushBeforeRecovery: async () => {
        order.push('flush');
        return true;
      }
    });
    harness.reload.mockImplementation(() => {
      order.push('reload');
    });

    const event = harness.trigger('vite:preloadError');
    await vi.waitFor(() => expect(harness.reload).toHaveBeenCalledOnce());

    expect(order).toEqual(['flush', 'reload']);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('should not reload when the current project save is not confirmed', async () => {
    const harness = createRecoveryHarness({
      flushBeforeRecovery: async () => false
    });

    const event = harness.trigger('vite:preloadError');
    await vi.waitFor(() => expect(harness.consoleError).toHaveBeenCalledOnce());

    expect(harness.reload).not.toHaveBeenCalled();
    expect(harness.replace).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});
