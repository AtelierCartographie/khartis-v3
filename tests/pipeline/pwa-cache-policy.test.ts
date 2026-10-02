import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPwaCachePrefix,
  isPwaCacheForScope,
  resolvePwaScopeUrl
} from '../../src/lib/features/commons/utils/pwa-cache';

vi.mock('workbox-cacheable-response', () => ({
  CacheableResponsePlugin: class CacheableResponsePlugin {}
}));
vi.mock('workbox-core', () => ({
  setCacheNameDetails: vi.fn()
}));
vi.mock('workbox-expiration', () => ({
  ExpirationPlugin: class ExpirationPlugin {}
}));
vi.mock('workbox-precaching', () => ({
  cleanupOutdatedCaches: vi.fn(),
  matchPrecache: vi.fn(),
  precacheAndRoute: vi.fn()
}));
vi.mock('workbox-routing', () => ({
  NavigationRoute: class NavigationRoute {},
  registerRoute: vi.fn(),
  setCatchHandler: vi.fn()
}));
vi.mock('workbox-strategies', () => ({
  CacheFirst: class CacheFirst {},
  NetworkFirst: class NetworkFirst {},
  StaleWhileRevalidate: class StaleWhileRevalidate {}
}));

const serviceWorkerSource = readFileSync(
  path.resolve(process.cwd(), 'src/sw.ts'),
  'utf8'
);
const pwaComponentSource = readFileSync(
  path.resolve(
    process.cwd(),
    'src/lib/features/commons/components/pwa-service-worker.svelte'
  ),
  'utf8'
);
const viteConfigSource = readFileSync(
  path.resolve(process.cwd(), 'vite.config.ts'),
  'utf8'
);
const pwaUpdateServiceSource = readFileSync(
  path.resolve(
    process.cwd(),
    'src/lib/features/commons/services/pwa-update.service.svelte.ts'
  ),
  'utf8'
);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('PWA cache and retry policy', () => {
  it('should create different cache prefixes when deployment scopes differ', () => {
    const pprdScope = 'https://example.org/cartographie/khartis-pprd/';
    const prodScope = 'https://example.org/cartographie/fr/outils/khartis/app/';

    expect(createPwaCachePrefix(pprdScope)).not.toBe(
      createPwaCachePrefix(prodScope)
    );
  });

  it('should match only caches belonging to the current scope', () => {
    const scope = 'https://example.org/cartographie/khartis/';
    const adjacentScope = 'https://example.org/cartographie/khartis-other/';
    const cacheName = `${createPwaCachePrefix(scope)}images`;

    expect(isPwaCacheForScope(cacheName, scope)).toBe(true);
    expect(isPwaCacheForScope(cacheName, adjacentScope)).toBe(false);
  });

  it('should resolve the service worker scope when the document base has a file-like route', () => {
    expect(
      resolvePwaScopeUrl(
        'https://example.org/cartographie/fr/outils/khartis/app/'
      )
    ).toBe('https://example.org/cartographie/fr/outils/khartis/app/');
  });

  it('should wait for explicit approval from the persistence-safe client protocol', () => {
    expect(viteConfigSource).toContain("registerType: 'prompt'");
    expect(serviceWorkerSource).not.toContain('clientsClaim');
    expect(serviceWorkerSource).not.toMatch(/\nself\.skipWaiting\(\);\s*\n/);
    expect(serviceWorkerSource).toContain('message.protocolVersion === 1');
    expect(serviceWorkerSource).toContain(
      'message.persistenceFlushed === true'
    );
    expect(serviceWorkerSource).toContain("message.type === 'SKIP_WAITING'");
    expect(pwaComponentSource).toContain("updateViaCache: 'none'");
    expect(pwaComponentSource).toContain(
      "'controllerchange',\n        handleControllerChange"
    );
  });

  it('should keep worker installation successful when the generated WASM snapshot exceeds cache quota', async () => {
    const scope = 'https://example.org/cartographie/fr/outils/khartis/app/';
    const sourceCacheName = `${createPwaCachePrefix(scope)}duckdb-wasm-core`;
    const immutableRequest = new Request(
      `${scope}_app/immutable/assets/duckdb-eh.old-hash.wasm`
    );
    const immutableResponse = new Response('immutable asset');
    const targetCachePut = vi
      .fn()
      .mockRejectedValue(
        new DOMException('Cache quota exceeded', 'QuotaExceededError')
      );
    const sourceCache = {
      keys: vi.fn().mockResolvedValue([immutableRequest]),
      match: vi.fn().mockResolvedValue(immutableResponse)
    };
    const targetCache = {
      put: targetCachePut
    };
    const cacheStorage = {
      delete: vi.fn().mockResolvedValue(true),
      keys: vi.fn().mockResolvedValue([sourceCacheName]),
      match: vi.fn().mockResolvedValue(undefined),
      open: vi.fn(async (cacheName: string) =>
        cacheName.includes('previous-immutable') ? targetCache : sourceCache
      )
    };
    let installHandler:
      | ((event: { waitUntil(promise: Promise<void>): void }) => void)
      | undefined;

    vi.stubGlobal('caches', cacheStorage);
    vi.stubGlobal('self', {
      __WB_MANIFEST: [],
      addEventListener: vi.fn(
        (
          type: string,
          handler: (event: { waitUntil(promise: Promise<void>): void }) => void
        ) => {
          if (type === 'install') {
            installHandler = handler;
          }
        }
      ),
      clients: {
        matchAll: vi.fn().mockResolvedValue([])
      },
      registration: { scope },
      skipWaiting: vi.fn().mockResolvedValue(undefined)
    });

    await import('../../src/sw');

    if (!installHandler) {
      throw new Error('Service worker install handler was not registered.');
    }

    let installationPromise: Promise<void> | undefined;
    installHandler({
      waitUntil(promise) {
        installationPromise = promise;
      }
    });
    if (!installationPromise) {
      throw new Error('Service worker installation promise was not captured.');
    }

    await expect(installationPromise).resolves.toBeUndefined();
    expect(targetCachePut).toHaveBeenCalledOnce();
  });

  it('should never delete project storage during the normal update flow', () => {
    expect(pwaUpdateServiceSource).not.toContain('indexedDB.deleteDatabase');
    expect(pwaUpdateServiceSource).not.toContain('factoryResetPwa');
    expect(pwaUpdateServiceSource).not.toContain('.unregister()');
    expect(pwaUpdateServiceSource).not.toContain('caches.delete');
  });
});
