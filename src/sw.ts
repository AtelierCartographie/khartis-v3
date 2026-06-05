/// <reference lib="webworker" />
/// <reference types="vite/client" />

import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import type { WorkboxPlugin } from 'workbox-core/types';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  addPlugins,
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

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>;
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const NINETY_DAYS_SECONDS = 60 * 60 * 24 * 90;
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

const PRESETS_CACHE = 'presets';
const GEOPF_TILES_CACHE = 'geopf-vector-tiles';
const OPENMAPTILES_CACHE = 'openmaptiles';
const FONTS_CACHE = 'fonts';

self.skipWaiting();
clientsClaim();

const RETRY_STATUS_CODES = new Set([403, 408, 425, 429, 500, 502, 503, 504]);
const MAX_TRANSIENT_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 500;
const RETRY_JITTER_MS = 500;

const retryTransientErrorsPlugin: WorkboxPlugin = {
  fetchDidSucceed: async ({ request, response }) => {
    if (!RETRY_STATUS_CODES.has(response.status)) {
      return response;
    }
    let latest = response;
    for (let attempt = 0; attempt < MAX_TRANSIENT_RETRIES; attempt += 1) {
      const delayMs =
        BASE_RETRY_DELAY_MS * Math.pow(2, attempt) +
        Math.random() * RETRY_JITTER_MS;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      try {
        const retried = await fetch(request.clone());
        if (retried.ok) {
          return retried;
        }
        if (!RETRY_STATUS_CODES.has(retried.status)) {
          return retried;
        }
        latest = retried;
      } catch {
        break;
      }
    }
    return latest;
  }
};

addPlugins([retryTransientErrorsPlugin]);
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const APP_SHELL_CACHE = 'app-shell';
const HASHED_RUNTIME_CACHES_TO_RESET = ['fonts', 'images'];

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        await Promise.allSettled(
          HASHED_RUNTIME_CACHES_TO_RESET.map((name) => caches.delete(name))
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
  networkTimeoutSeconds: 3,
  plugins: [
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
    cacheName: 'duckdb-wasm-core',
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
    cacheName: 'duckdb-extensions-cdn',
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
    cacheName: 'duckdb-extensions-local',
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
    cacheName: 'workers',
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
    cacheName: 'images',
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
    return new URL('index.html', scope).pathname;
  } catch {
    return '/index.html';
  }
}

self.addEventListener('message', (event) => {
  const message = event.data as ClientToSwMessage | undefined;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'SKIP_WAITING') {
    void self.skipWaiting();
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
      allCaches.map(async (name) => {
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
