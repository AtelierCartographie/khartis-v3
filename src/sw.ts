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

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string }>;
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const NINETY_DAYS_SECONDS = 60 * 60 * 24 * 90;
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

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

const basemapDataStrategy = new CacheFirst({
  cacheName: 'basemaps-data',
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
  cacheName: 'basemaps-data',
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
  if (!event.data || typeof event.data !== 'object') return;
  if (event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

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

  event.waitUntil(
    (async () => {
      try {
        const records = await registration.matchAll();
        const cache = await caches.open('basemaps-data');
        await Promise.all(
          records.map(async (record) => {
            const response = await record.responseReady;
            if (response && response.ok) {
              await cache.put(record.request, response.clone());
            }
          })
        );
        await event.updateUI?.({
          title: 'Carte téléchargée pour usage hors ligne'
        });
      } catch (error) {
        console.warn('[sw] backgroundfetchsuccess persist failed', error);
      }
    })()
  );
}) as EventListener);

self.addEventListener('backgroundfetchfail', ((event: BackgroundFetchEvent) => {
  const { registration } = event;
  if (!registration.id.startsWith(BASEMAP_FETCH_PREFIX)) {
    return;
  }

  event.waitUntil(
    (async () => {
      await event.updateUI?.({
        title: 'Téléchargement de la carte interrompu'
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
    const cache = await caches.open('basemaps-data');
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
