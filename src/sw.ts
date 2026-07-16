/// <reference lib="webworker" />
/// <reference types="vite/client" />

import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { setCacheNameDetails } from 'workbox-core';
import type { WorkboxPlugin } from 'workbox-core/types';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  matchPrecache,
  precacheAndRoute
} from 'workbox-precaching';
import {
  NavigationRoute,
  registerRoute,
  setCatchHandler
} from 'workbox-routing';
import {
  CacheFirst,
  NetworkFirst,
  StaleWhileRevalidate
} from 'workbox-strategies';
import type {
  ClientToSwMessage,
  SwToClientMessage
} from '$lib/types/sw-messages';
import {
  createPwaCachePrefix,
  isPwaCacheForScope
} from '$lib/features/commons/utils/pwa-cache';
import { retryTransientResponse } from '$lib/features/commons/utils/pwa-transient-retry';
import { canonicalizeWorkboxPrecacheRequest } from '$lib/features/commons/utils/pwa-precache-request';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>;
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const NINETY_DAYS_SECONDS = 60 * 60 * 24 * 90;
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

const PWA_SCOPE_URL = self.registration.scope;
const PWA_CACHE_PREFIX = createPwaCachePrefix(PWA_SCOPE_URL);
const scopedCacheName = (name: string): string => `${PWA_CACHE_PREFIX}${name}`;
const APP_VERSION_CACHE_KEY =
  (import.meta.env.VITE_APP_VERSION ?? 'dev')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_') || 'dev';

setCacheNameDetails({ prefix: PWA_CACHE_PREFIX });

const APP_SHELL_CACHE_PREFIX = scopedCacheName('app-shell-');
const LEGACY_APP_SHELL_CACHE = scopedCacheName('app-shell');
const APP_SHELL_CACHE = `${APP_SHELL_CACHE_PREFIX}${APP_VERSION_CACHE_KEY}`;
const PREVIOUS_IMMUTABLE_CACHE_PREFIX = scopedCacheName('previous-immutable-');
const PREVIOUS_IMMUTABLE_CACHE = `${PREVIOUS_IMMUTABLE_CACHE_PREFIX}${APP_VERSION_CACHE_KEY}`;
const DUCKDB_WASM_CORE_CACHE = scopedCacheName('duckdb-wasm-core');
const DUCKDB_EXTENSIONS_CDN_CACHE = scopedCacheName('duckdb-extensions-cdn');
const DUCKDB_EXTENSIONS_LOCAL_CACHE = scopedCacheName(
  'duckdb-extensions-local'
);
const WORKERS_CACHE = scopedCacheName('workers');
const IMAGES_CACHE = scopedCacheName('images');
const PRESETS_CACHE = scopedCacheName('presets');
const GEOPF_TILES_CACHE = scopedCacheName('geopf-vector-tiles');
const OPENMAPTILES_CACHE = scopedCacheName('openmaptiles');
const FONTS_CACHE = scopedCacheName('fonts');

function isImmutableShellAsset(request: Request): boolean {
  try {
    const pathname = new URL(request.url).pathname;
    return (
      pathname.includes('/_app/immutable/') &&
      /\.(?:css|js|wasm)$/.test(pathname)
    );
  } catch {
    return false;
  }
}

async function snapshotPreviousImmutableAssets(): Promise<void> {
  try {
    const cacheNames = await caches.keys();
    const sourceCacheNames = cacheNames.filter(
      (cacheName) =>
        isPwaCacheForScope(cacheName, PWA_SCOPE_URL) &&
        (cacheName.includes('precache') || cacheName === DUCKDB_WASM_CORE_CACHE)
    );
    if (sourceCacheNames.length === 0) {
      return;
    }

    const targetCache = await caches.open(PREVIOUS_IMMUTABLE_CACHE);
    for (const cacheName of sourceCacheNames) {
      const sourceCache = await caches.open(cacheName);
      const requests = await sourceCache.keys();
      for (const request of requests) {
        if (!isImmutableShellAsset(request)) {
          continue;
        }

        const response = await sourceCache.match(request);
        if (response) {
          await targetCache.put(
            canonicalizeWorkboxPrecacheRequest(request),
            response
          );
        }
      }
    }
  } catch {
    // The N-1 snapshot is best-effort and must never block worker installation.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(snapshotPreviousImmutableAssets());
});

const retryTransientErrorsPlugin: WorkboxPlugin = {
  fetchDidSucceed: async ({ request, response }) =>
    retryTransientResponse(request, response)
};

const bypassHttpCachePlugin: WorkboxPlugin = {
  requestWillFetch: async ({ request }) =>
    new Request(request, { cache: 'no-store' })
};

const HASHED_RUNTIME_CACHES_TO_RESET = [FONTS_CACHE, IMAGES_CACHE];

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const obsoleteVersionedCaches = cacheNames.filter(
          (name) =>
            isPwaCacheForScope(name, PWA_SCOPE_URL) &&
            name !== APP_SHELL_CACHE &&
            name !== PREVIOUS_IMMUTABLE_CACHE &&
            (name === LEGACY_APP_SHELL_CACHE ||
              name.startsWith(APP_SHELL_CACHE_PREFIX) ||
              name.startsWith(PREVIOUS_IMMUTABLE_CACHE_PREFIX))
        );
        await Promise.allSettled(
          [...HASHED_RUNTIME_CACHES_TO_RESET, ...obsoleteVersionedCaches].map(
            (name) => caches.delete(name)
          )
        );
      } catch {
        // Cache reset is best-effort; failure must not block activation.
      }
    })()
  );
});

registerRoute(
  ({ url }) =>
    url.pathname.endsWith('/_app/version.json') ||
    url.pathname.endsWith('/sw.js'),
  async ({ request }) => {
    try {
      return await fetch(request.url, {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'cache-control': 'no-cache', pragma: 'no-cache' }
      });
    } catch {
      return Response.error();
    }
  }
);

const navigationHandler = new NetworkFirst({
  cacheName: APP_SHELL_CACHE,
  networkTimeoutSeconds: 10,
  plugins: [
    bypassHttpCachePlugin,
    retryTransientErrorsPlugin,
    new CacheableResponsePlugin({ statuses: [0, 200] }),
    new ExpirationPlugin({
      maxEntries: 4,
      maxAgeSeconds: THIRTY_DAYS_SECONDS,
      purgeOnQuotaError: true
    })
  ]
});

registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api\//, /\.[^/]+$/]
  })
);

registerRoute(
  ({ request }) => isImmutableShellAsset(request),
  async ({ request }) => {
    const currentResponse = await matchPrecache(request);
    if (currentResponse) {
      return currentResponse;
    }

    const previousResponse = await caches.match(request, {
      cacheName: PREVIOUS_IMMUTABLE_CACHE
    });
    if (previousResponse) {
      return previousResponse;
    }

    return fetch(request);
  }
);

// Register the navigation route before Workbox's precache route so the canonical
// app URL remains network-first instead of being served cache-first forever.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

setCatchHandler(async ({ request }) => {
  if (request.destination === 'document') {
    const fallback = await matchPrecache(resolveNavigationFallbackUrl());
    if (fallback) return fallback;
  }
  return Response.error();
});

registerRoute(
  ({ url }) => /.*duckdb.*\.wasm$/.test(url.pathname),
  new CacheFirst({
    cacheName: DUCKDB_WASM_CORE_CACHE,
    matchOptions: { ignoreSearch: true },
    plugins: [
      retryTransientErrorsPlugin,
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 5,
        maxAgeSeconds: ONE_YEAR_SECONDS,
        purgeOnQuotaError: true
      })
    ]
  })
);

registerRoute(
  ({ url }) => url.origin === 'https://extensions.duckdb.org',
  new CacheFirst({
    cacheName: DUCKDB_EXTENSIONS_CDN_CACHE,
    plugins: [
      retryTransientErrorsPlugin,
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: ONE_YEAR_SECONDS,
        purgeOnQuotaError: true
      })
    ]
  })
);

registerRoute(
  ({ url }) =>
    url.pathname.includes('/duckdb-extensions/') &&
    url.pathname.endsWith('.wasm'),
  new CacheFirst({
    cacheName: DUCKDB_EXTENSIONS_LOCAL_CACHE,
    plugins: [
      retryTransientErrorsPlugin,
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 12,
        maxAgeSeconds: ONE_YEAR_SECONDS,
        purgeOnQuotaError: true
      })
    ]
  })
);

registerRoute(
  ({ url }) => url.pathname.endsWith('.worker.js'),
  new CacheFirst({
    cacheName: WORKERS_CACHE,
    plugins: [
      retryTransientErrorsPlugin,
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: NINETY_DAYS_SECONDS,
        purgeOnQuotaError: true
      })
    ]
  })
);

registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: IMAGES_CACHE,
    plugins: [
      retryTransientErrorsPlugin,
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: THIRTY_DAYS_SECONDS,
        purgeOnQuotaError: true
      })
    ]
  })
);

registerRoute(
  ({ request }) => request.destination === 'font',
  new CacheFirst({
    cacheName: FONTS_CACHE,
    plugins: [
      retryTransientErrorsPlugin,
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 80,
        maxAgeSeconds: ONE_YEAR_SECONDS,
        purgeOnQuotaError: true
      })
    ]
  })
);

registerRoute(
  ({ url }) =>
    url.pathname.includes('/basemaps/projection-presets.json') ||
    url.pathname.includes('/basemaps/style-presets.json'),
  new CacheFirst({
    cacheName: PRESETS_CACHE,
    plugins: [
      retryTransientErrorsPlugin,
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 4,
        maxAgeSeconds: ONE_YEAR_SECONDS,
        purgeOnQuotaError: true
      })
    ]
  })
);

registerRoute(
  ({ url }) =>
    url.origin === 'https://data.geopf.fr' &&
    /\/tms\/.+\.pbf$/.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: GEOPF_TILES_CACHE,
    plugins: [
      retryTransientErrorsPlugin,
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: THIRTY_DAYS_SECONDS,
        purgeOnQuotaError: true
      })
    ]
  })
);

registerRoute(
  ({ url }) => url.origin === 'https://openmaptiles.geo.data.gouv.fr',
  new StaleWhileRevalidate({
    cacheName: OPENMAPTILES_CACHE,
    plugins: [
      retryTransientErrorsPlugin,
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: THIRTY_DAYS_SECONDS,
        purgeOnQuotaError: true
      })
    ]
  })
);

function resolveNavigationFallbackUrl(): string {
  const scope = self.registration?.scope ?? '/';
  try {
    return new URL('.', scope).pathname;
  } catch {
    return '/';
  }
}

self.addEventListener('message', (event) => {
  const message = event.data as ClientToSwMessage | undefined;
  if (!message || typeof message !== 'object') return;

  if (
    message.type === 'SKIP_WAITING' &&
    message.protocolVersion === 1 &&
    message.persistenceFlushed === true
  ) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (message.type === 'FACTORY_RESET') {
    event.waitUntil(handleFactoryReset());
  }
});

async function handleFactoryReset(): Promise<void> {
  const cleared: string[] = [];
  try {
    const allCaches = await caches.keys();
    await Promise.all(
      allCaches
        .filter((name) => isPwaCacheForScope(name, PWA_SCOPE_URL))
        .map(async (name) => {
          try {
            const deleted = await caches.delete(name);
            if (deleted) cleared.push(name);
          } catch {
            // Cache cleanup should not block reset completion.
          }
        })
    );
  } catch {
    // Reset can still notify clients even when cache enumeration fails.
  }

  await broadcastToClients({
    type: 'PWA_RESET_DONE',
    clearedCaches: cleared
  });
}

async function broadcastToClients(message: SwToClientMessage): Promise<void> {
  try {
    const clients = await self.clients.matchAll({
      includeUncontrolled: true,
      type: 'window'
    });
    for (const client of clients) {
      client.postMessage(message);
    }
  } catch {
    // Client notification is best-effort from the service worker.
  }
}
