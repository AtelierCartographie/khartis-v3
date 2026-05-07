/// <reference lib="webworker" />
/// <reference types="vite/client" />

import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
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

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const navigationHandler = createHandlerBoundToURL(
  resolveNavigationFallbackUrl()
);
const navigationRoute = new NavigationRoute(navigationHandler, {
  denylist: [/^\/api\//, /\.[^/]+$/]
});
registerRoute(navigationRoute);

registerRoute(
  ({ url }) => /.*duckdb.*\.wasm$/.test(url.pathname),
  new CacheFirst({
    cacheName: 'duckdb-wasm-core',
    matchOptions: { ignoreSearch: true },
    plugins: [
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
  ({ url }) =>
    url.pathname.includes('/basemaps/projection-presets.json') ||
    url.pathname.includes('/basemaps/style-presets.json'),
  new CacheFirst({
    cacheName: PRESETS_CACHE,
    plugins: [
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
        } catch (error) {
          console.warn(
            '[sw] failed to clear cache during factory reset',
            name,
            error
          );
        }
      })
    );
  } catch (error) {
    console.warn('[sw] factory reset cache enumeration failed', error);
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
      } catch (error) {
        console.warn('[sw] failed to clear cache', name, error);
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
  } catch (error) {
    console.warn('[sw] broadcast failed', error);
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
        console.warn('[sw] backgroundfetchsuccess persist failed', error);
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
  } catch (error) {
    console.warn('[sw] periodic sync revalidation failed', error);
  }
}
