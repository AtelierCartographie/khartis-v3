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
  OfflineCacheScope,
  SwToClientMessage
} from '$lib/types/sw-messages';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>;
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const NINETY_DAYS_SECONDS = 60 * 60 * 24 * 90;
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

const BASEMAPS_DATA_CACHE = 'basemaps-data';
const PRESETS_CACHE = 'presets';
const GEOPF_TILES_CACHE = 'geopf-vector-tiles';
const OPENMAPTILES_CACHE = 'openmaptiles';
const FONTS_CACHE = 'fonts';

const OFFLINE_CACHE_NAMES_BY_SCOPE: Record<OfflineCacheScope, string[]> = {
  basemaps: [BASEMAPS_DATA_CACHE, PRESETS_CACHE],
  tiles: [GEOPF_TILES_CACHE, OPENMAPTILES_CACHE],
  all: [
    BASEMAPS_DATA_CACHE,
    PRESETS_CACHE,
    GEOPF_TILES_CACHE,
    OPENMAPTILES_CACHE
  ]
};

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
  ({ url }) => isBasemapDataUrl(url),
  ({ event, request }) => handleBasemapDataRequest(event as FetchEvent, request)
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

const basemapDataStrategy = new CacheFirst({
  cacheName: BASEMAPS_DATA_CACHE,
  plugins: [
    retryTransientErrorsPlugin,
    new CacheableResponsePlugin({ statuses: [0, 200] }),
    new ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: ONE_YEAR_SECONDS,
      purgeOnQuotaError: true
    })
  ]
});

const basemapDataSlowStrategy = new StaleWhileRevalidate({
  cacheName: BASEMAPS_DATA_CACHE,
  plugins: [
    retryTransientErrorsPlugin,
    new CacheableResponsePlugin({ statuses: [0, 200] }),
    new ExpirationPlugin({
      maxEntries: 100,
      maxAgeSeconds: ONE_YEAR_SECONDS,
      purgeOnQuotaError: true
    })
  ]
});

function isBasemapDataUrl(url: URL): boolean {
  if (!url.pathname.includes('/basemaps/')) return false;
  return /\.(parquet|geojson|json)$/.test(url.pathname);
}

function shouldUseSlowConnectionStrategy(): boolean {
  const conn = (
    self as ServiceWorkerGlobalScope & {
      navigator: Navigator & {
        connection?: {
          saveData?: boolean;
          effectiveType?: string;
        };
      };
    }
  ).navigator?.connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return ['slow-2g', '2g'].includes(conn.effectiveType ?? '');
}

async function handleBasemapDataRequest(
  event: FetchEvent,
  request: Request
): Promise<Response> {
  const strategy = shouldUseSlowConnectionStrategy()
    ? basemapDataSlowStrategy
    : basemapDataStrategy;
  return strategy.handle({ event, request });
}

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

  if (message.type === 'CLEAR_OFFLINE_CACHE') {
    event.waitUntil(handleClearOfflineCache(message.scope));
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

async function handleClearOfflineCache(
  scope: OfflineCacheScope
): Promise<void> {
  const targetCaches = OFFLINE_CACHE_NAMES_BY_SCOPE[scope] ?? [];
  const cleared: string[] = [];

  await Promise.all(
    targetCaches.map(async (name) => {
      try {
        const deleted = await caches.delete(name);
        if (deleted) cleared.push(name);
      } catch {
        // Best-effort offline cleanup.
      }
    })
  );

  await broadcastToClients({
    type: 'CACHE_CLEARED',
    scope,
    cleared
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

const BASEMAP_FETCH_PREFIX = 'khartis-basemap-';
const PERIODIC_SYNC_TAG_BASEMAPS = 'khartis-basemaps-revalidate';

interface BackgroundFetchRecord {
  request: Request;
  responseReady: Promise<Response>;
}

interface BackgroundFetchRegistrationLike {
  id: string;
  matchAll(): Promise<BackgroundFetchRecord[]>;
}

interface BackgroundFetchEvent extends ExtendableEvent {
  registration: BackgroundFetchRegistrationLike;
  updateUI?: (options: { title?: string }) => Promise<void>;
}

self.addEventListener('backgroundfetchsuccess', ((
  event: BackgroundFetchEvent
) => {
  const { registration } = event;
  if (!registration.id.startsWith(BASEMAP_FETCH_PREFIX)) {
    return;
  }

  const basemapId = registration.id.slice(BASEMAP_FETCH_PREFIX.length);

  event.waitUntil(
    (async () => {
      let totalBytes = 0;
      try {
        const records = await registration.matchAll();
        const cache = await caches.open(BASEMAPS_DATA_CACHE);
        await Promise.all(
          records.map(async (record) => {
            const response = await record.responseReady;
            if (response && response.ok) {
              await cache.put(record.request, response.clone());
              const size = Number(response.headers.get('content-length') ?? 0);
              if (Number.isFinite(size) && size > 0) totalBytes += size;
            }
          })
        );
        await event.updateUI?.({
          title: 'Carte téléchargée pour usage hors ligne'
        });
        await broadcastToClients({
          type: 'BG_FETCH_DONE',
          basemapId,
          bytes: totalBytes
        });
      } catch (error) {
        await broadcastToClients({
          type: 'BG_FETCH_FAIL',
          basemapId,
          reason: error instanceof Error ? error.message : 'persist failed'
        });
      }
    })()
  );
}) as EventListener);

self.addEventListener('backgroundfetchfail', ((event: BackgroundFetchEvent) => {
  const { registration } = event;
  if (!registration.id.startsWith(BASEMAP_FETCH_PREFIX)) {
    return;
  }

  const basemapId = registration.id.slice(BASEMAP_FETCH_PREFIX.length);

  event.waitUntil(
    (async () => {
      await event.updateUI?.({
        title: 'Téléchargement de la carte interrompu'
      });
      await broadcastToClients({
        type: 'BG_FETCH_FAIL',
        basemapId
      });
    })()
  );
}) as EventListener);

self.addEventListener('backgroundfetchclick', ((
  event: BackgroundFetchEvent
) => {
  if (!event.registration.id.startsWith(BASEMAP_FETCH_PREFIX)) {
    return;
  }

  const fallbackUrl = resolveNavigationFallbackUrl();
  event.waitUntil(self.clients.openWindow(fallbackUrl));
}) as EventListener);

interface PeriodicSyncEvent extends ExtendableEvent {
  tag: string;
}

self.addEventListener('periodicsync', ((event: PeriodicSyncEvent) => {
  if (event.tag !== PERIODIC_SYNC_TAG_BASEMAPS) {
    return;
  }

  event.waitUntil(revalidateBasemapsCache());
}) as EventListener);

async function revalidateBasemapsCache(): Promise<void> {
  try {
    const cache = await caches.open(BASEMAPS_DATA_CACHE);
    const requests = await cache.keys();
    await Promise.all(
      requests.map(async (request) => {
        try {
          const fresh = await fetch(request, { cache: 'no-cache' });
          if (fresh.ok) {
            await cache.put(request, fresh.clone());
          }
        } catch {
          // ignore individual failures so others still revalidate
        }
      })
    );
  } catch {
    // Periodic sync failures are retried by the browser.
  }
}
