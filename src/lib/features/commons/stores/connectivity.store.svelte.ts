import type {
  OfflineCacheScope,
  SwToClientMessage
} from '$lib/types/sw-messages';
import { SvelteMap } from 'svelte/reactivity';

export type OfflineBasemapStatus =
  | 'unknown'
  | 'cached'
  | 'downloading'
  | 'failed'
  | 'evicted';

export interface OfflineBasemapEntry {
  id: string;
  status: OfflineBasemapStatus;
  progress: number;
  bytes?: number;
}

export type WarmupPhase =
  | 'idle'
  | 'A'
  | 'A-done'
  | 'B'
  | 'B-done'
  | 'C'
  | 'disabled';

export interface StorageEstimateSnapshot {
  usage: number;
  quota: number;
  ratio: number;
}

interface ConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

const SLOW_EFFECTIVE_TYPES = new Set(['slow-2g', '2g']);

function readNavigatorOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function readSlowConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  const connection = (navigator as Navigator & { connection?: ConnectionLike })
    .connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return SLOW_EFFECTIVE_TYPES.has(connection.effectiveType ?? '');
}

function createConnectivityStore() {
  const state = $state<{
    isOnline: boolean;
    isSlowConnection: boolean;
    storage: StorageEstimateSnapshot | null;
    warmupPhase: WarmupPhase;
    quotaExceeded: boolean;
  }>({
    isOnline: readNavigatorOnline(),
    isSlowConnection: readSlowConnection(),
    storage: null,
    warmupPhase: 'idle',
    quotaExceeded: false
  });

  const basemaps = new SvelteMap<string, OfflineBasemapEntry>();

  let listenersAttached = false;

  function attachListeners(): void {
    if (listenersAttached || typeof window === 'undefined') return;
    listenersAttached = true;

    window.addEventListener('online', () => {
      state.isOnline = true;
    });

    window.addEventListener('offline', () => {
      state.isOnline = false;
    });

    const navigatorWithConnection = navigator as Navigator & {
      connection?: ConnectionLike & {
        addEventListener?: (type: 'change', handler: () => void) => void;
      };
    };
    const connection = navigatorWithConnection.connection;
    if (connection?.addEventListener) {
      connection.addEventListener('change', () => {
        state.isSlowConnection = readSlowConnection();
      });
    }
  }

  attachListeners();

  async function refreshStorageEstimate(): Promise<void> {
    if (
      typeof navigator === 'undefined' ||
      !navigator.storage ||
      typeof navigator.storage.estimate !== 'function'
    ) {
      return;
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage ?? 0;
      const quota = estimate.quota ?? 0;
      state.storage = {
        usage,
        quota,
        ratio: quota > 0 ? usage / quota : 0
      };
    } catch {
      state.storage = null;
    }
  }

  async function refreshCachedBasemaps(): Promise<void> {
    if (typeof caches === 'undefined') return;

    try {
      const cache = await caches.open('basemaps-data');
      const requests = await cache.keys();
      const cachedIds = new Set<string>();
      for (const request of requests) {
        const url = new URL(request.url);
        const match = url.pathname.match(
          /\/basemaps\/geometry\/([^/]+)\.parquet$/
        );
        if (match) {
          cachedIds.add(match[1]);
        }
      }

      for (const id of cachedIds) {
        const existing = basemaps.get(id);
        if (existing?.status === 'downloading') continue;
        basemaps.set(id, {
          id,
          status: 'cached',
          progress: 1,
          bytes: existing?.bytes
        });
      }

      for (const [id, entry] of basemaps) {
        if (entry.status === 'cached' && !cachedIds.has(id)) {
          basemaps.set(id, { ...entry, status: 'evicted', progress: 0 });
        }
      }
    } catch {
      return;
    }
  }

  function setBasemapStatus(
    id: string,
    status: OfflineBasemapStatus,
    progress = 0,
    bytes?: number
  ): void {
    const existing = basemaps.get(id);
    basemaps.set(id, {
      id,
      status,
      progress,
      bytes: bytes ?? existing?.bytes
    });
  }

  function setWarmupPhase(phase: WarmupPhase): void {
    state.warmupPhase = phase;
  }

  function setQuotaExceeded(value: boolean): void {
    state.quotaExceeded = value;
  }

  function handleSwMessage(message: SwToClientMessage): void {
    switch (message.type) {
      case 'BG_FETCH_PROGRESS':
        setBasemapStatus(
          message.basemapId,
          'downloading',
          message.progress,
          message.downloadTotal
        );
        break;
      case 'BG_FETCH_DONE':
        setBasemapStatus(message.basemapId, 'cached', 1, message.bytes);
        void refreshStorageEstimate();
        break;
      case 'BG_FETCH_FAIL':
        setBasemapStatus(message.basemapId, 'failed', 0);
        break;
      case 'CACHE_CLEARED':
        if (message.scope === 'all' || message.scope === 'basemaps') {
          for (const [id, entry] of basemaps) {
            if (entry.status === 'cached') {
              basemaps.set(id, { ...entry, status: 'evicted', progress: 0 });
            }
          }
        }
        void refreshStorageEstimate();
        break;
      case 'QUOTA_EXCEEDED':
        setQuotaExceeded(true);
        break;
    }
  }

  async function clearOfflineCache(scope: OfflineCacheScope): Promise<void> {
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

  function reset(): void {
    state.warmupPhase = 'idle';
    state.quotaExceeded = false;
    state.storage = null;
    basemaps.clear();
  }

  return {
    get isOnline(): boolean {
      return state.isOnline;
    },
    get isSlowConnection(): boolean {
      return state.isSlowConnection;
    },
    get storage(): StorageEstimateSnapshot | null {
      return state.storage;
    },
    get warmupPhase(): WarmupPhase {
      return state.warmupPhase;
    },
    get quotaExceeded(): boolean {
      return state.quotaExceeded;
    },
    get basemaps(): ReadonlyMap<string, OfflineBasemapEntry> {
      return basemaps;
    },
    get cachedBasemapCount(): number {
      let count = 0;
      for (const entry of basemaps.values()) {
        if (entry.status === 'cached') count += 1;
      }
      return count;
    },
    refreshStorageEstimate,
    refreshCachedBasemaps,
    setBasemapStatus,
    setWarmupPhase,
    setQuotaExceeded,
    handleSwMessage,
    clearOfflineCache,
    reset
  };
}

export type ConnectivityStore = ReturnType<typeof createConnectivityStore>;

export const connectivityStore: ConnectivityStore = createConnectivityStore();
