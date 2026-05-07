import { LogCategory, logger } from '$lib/features/commons/utils/logger';

interface BackgroundFetchIcon {
  src: string;
  sizes?: string;
  type?: string;
}

interface BackgroundFetchOptions {
  title: string;
  icons?: BackgroundFetchIcon[];
  downloadTotal?: number;
}

interface BackgroundFetchRegistrationLike {
  id: string;
  uploadTotal: number;
  uploaded: number;
  downloadTotal: number;
  downloaded: number;
  result: string;
  failureReason: string;
  recordsAvailable: boolean;
  abort(): Promise<boolean>;
  match(request: RequestInfo): Promise<unknown>;
  matchAll(request?: RequestInfo): Promise<unknown[]>;
  addEventListener(type: 'progress', listener: () => void): void;
  removeEventListener(type: 'progress', listener: () => void): void;
}

interface BackgroundFetchManagerLike {
  fetch(
    id: string,
    requests: RequestInfo[],
    options?: BackgroundFetchOptions
  ): Promise<BackgroundFetchRegistrationLike>;
  get(id: string): Promise<BackgroundFetchRegistrationLike | null>;
  getIds(): Promise<string[]>;
}

interface PeriodicSyncManagerLike {
  register(tag: string, options?: { minInterval?: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

interface ExtendedRegistration extends ServiceWorkerRegistration {
  backgroundFetch?: BackgroundFetchManagerLike;
  periodicSync?: PeriodicSyncManagerLike;
}

interface ConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

const PERIODIC_SYNC_TAG_BASEMAPS = 'khartis-basemaps-revalidate';
const PERIODIC_SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

async function getRegistration(): Promise<ExtendedRegistration | null> {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const swContainer = (navigator as Navigator & { serviceWorker?: unknown })
    .serviceWorker as ServiceWorkerContainer | undefined;
  if (!swContainer || !swContainer.ready) {
    return null;
  }

  try {
    const ready = await swContainer.ready;
    return ready as ExtendedRegistration;
  } catch (error) {
    logger.warn(
      'Service worker registration unavailable',
      LogCategory.SYSTEM,
      error
    );
    return null;
  }
}

export function isBackgroundFetchSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'BackgroundFetchManager' in self
  );
}

export function isPeriodicSyncSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PeriodicSyncManager' in self
  );
}

export function isOnSlowConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as Navigator & { connection?: ConnectionLike })
    .connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return ['slow-2g', '2g'].includes(connection.effectiveType ?? '');
}

export interface PrepareBasemapForOfflineOptions {
  basemapId: string;
  urls: string[];
  title: string;
  totalBytes?: number;
  iconUrl?: string;
}

export interface PrepareBasemapResult {
  status: 'started' | 'unsupported' | 'already-running' | 'failed';
  registration?: BackgroundFetchRegistrationLike;
  reason?: unknown;
}

export async function prepareBasemapForOffline(
  options: PrepareBasemapForOfflineOptions
): Promise<PrepareBasemapResult> {
  const registration = await getRegistration();
  if (!registration?.backgroundFetch) {
    return { status: 'unsupported' };
  }

  const fetchId = `khartis-basemap-${options.basemapId}`;
  try {
    const existing = await registration.backgroundFetch.get(fetchId);
    if (existing) {
      return { status: 'already-running', registration: existing };
    }

    const bgFetchOptions: BackgroundFetchOptions = {
      title: options.title
    };
    if (options.iconUrl) {
      bgFetchOptions.icons = [
        {
          src: options.iconUrl,
          sizes: '192x192',
          type: 'image/png'
        }
      ];
    }
    if (typeof options.totalBytes === 'number' && options.totalBytes > 0) {
      bgFetchOptions.downloadTotal = options.totalBytes;
    }

    const bgFetch = await registration.backgroundFetch.fetch(
      fetchId,
      options.urls,
      bgFetchOptions
    );
    return { status: 'started', registration: bgFetch };
  } catch (error) {
    logger.warn('Background fetch start failed', LogCategory.SYSTEM, error);
    return { status: 'failed', reason: error };
  }
}

export async function getOfflineBasemapIds(): Promise<string[]> {
  const registration = await getRegistration();
  if (!registration?.backgroundFetch) {
    return [];
  }

  try {
    const ids = await registration.backgroundFetch.getIds();
    return ids
      .filter((id) => id.startsWith('khartis-basemap-'))
      .map((id) => id.replace('khartis-basemap-', ''));
  } catch (error) {
    logger.warn(
      'Failed to retrieve background fetch ids',
      LogCategory.SYSTEM,
      error
    );
    return [];
  }
}

export async function cancelOfflineBasemap(
  basemapId: string
): Promise<boolean> {
  const registration = await getRegistration();
  if (!registration?.backgroundFetch) {
    return false;
  }

  try {
    const bgFetch = await registration.backgroundFetch.get(
      `khartis-basemap-${basemapId}`
    );
    if (!bgFetch) return false;
    return await bgFetch.abort();
  } catch (error) {
    logger.warn('Background fetch abort failed', LogCategory.SYSTEM, error);
    return false;
  }
}

export async function getCachedBasemapIds(): Promise<string[]> {
  if (typeof caches === 'undefined') return [];

  try {
    const cache = await caches.open('basemaps-data');
    const requests = await cache.keys();
    const ids = new Set<string>();
    for (const req of requests) {
      try {
        const url = new URL(req.url);
        const match = url.pathname.match(
          /\/basemaps\/geometry\/([^/]+)\.parquet$/
        );
        if (match) ids.add(match[1]);
      } catch {
        /* ignore unparseable urls */
      }
    }
    return Array.from(ids);
  } catch (error) {
    logger.warn(
      'Failed to enumerate cached basemap ids',
      LogCategory.SYSTEM,
      error
    );
    return [];
  }
}

export async function clearOfflineCacheViaSw(
  scope: 'all' | 'basemaps' | 'tiles'
): Promise<void> {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !navigator.serviceWorker.controller
  ) {
    return;
  }

  navigator.serviceWorker.controller.postMessage({
    type: 'CLEAR_OFFLINE_CACHE',
    scope
  });
}

export interface FactoryResetOptions {
  reload?: boolean;
}

export async function factoryResetPwa(
  options: FactoryResetOptions = {}
): Promise<void> {
  const { reload = true } = options;

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    if (navigator.serviceWorker.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'FACTORY_RESET'
        });
      } catch (error) {
        logger.warn(
          'Failed to message SW for factory reset',
          LogCategory.SYSTEM,
          error
        );
      }
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    } catch (error) {
      logger.warn(
        'Failed to unregister service workers',
        LogCategory.SYSTEM,
        error
      );
    }
  }

  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    } catch (error) {
      logger.warn(
        'Failed to delete caches client-side during factory reset',
        LogCategory.SYSTEM,
        error
      );
    }
  }

  if (reload && typeof window !== 'undefined') {
    window.location.reload();
  }
}

export async function ensurePeriodicBasemapRevalidation(): Promise<void> {
  if (!isPeriodicSyncSupported()) {
    return;
  }

  const registration = await getRegistration();
  if (!registration?.periodicSync) {
    return;
  }

  try {
    const status = await navigator.permissions.query({
      name: 'periodic-background-sync' as PermissionName
    });
    if (status.state !== 'granted') {
      return;
    }

    const tags = await registration.periodicSync.getTags();
    if (tags.includes(PERIODIC_SYNC_TAG_BASEMAPS)) {
      return;
    }

    await registration.periodicSync.register(PERIODIC_SYNC_TAG_BASEMAPS, {
      minInterval: PERIODIC_SYNC_INTERVAL_MS
    });
  } catch (error) {
    logger.debug(
      'Periodic sync registration skipped',
      LogCategory.SYSTEM,
      error
    );
  }
}
