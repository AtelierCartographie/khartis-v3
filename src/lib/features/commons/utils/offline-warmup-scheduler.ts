import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { resolveStaticAssetUrl } from '$lib/features/commons/utils/static-asset-url';
import {
  buildEssentialDownloadEntries,
  buildExtendedDownloadEntries,
  type BasemapDownloadEntry
} from '$lib/features/commons/utils/offline-basemap-sets';
import {
  ensurePeriodicBasemapRevalidation,
  isOnSlowConnection,
  prepareBasemapForOffline
} from '$lib/features/commons/utils/pwa-offline';
import type { ConnectivityStore } from '$lib/features/commons/stores/connectivity.store.svelte';

const PHASE_A_RESOURCES = [
  '/basemaps/projection-presets.json',
  '/basemaps/style-presets.json',
  '/basemaps/all-basemaps-attributes.parquet'
];

const PHASE_B_DELAY_MS = 5_000;
const PHASE_B_CONCURRENCY = 2;
const PHASE_C_CONCURRENCY = 1;
const LOW_BATTERY_THRESHOLD = 0.2;

const OFFLINE_DISABLED_STORAGE_KEY = 'khartis.offline.disabled';
const OFFLINE_FEATURE_FLAG_DISABLED = '0';

interface BatteryLike {
  level?: number;
  charging?: boolean;
}

interface NavigatorWithBattery extends Navigator {
  getBattery?: () => Promise<BatteryLike>;
}

interface WarmupContext {
  store: ConnectivityStore;
  signal: AbortSignal;
}

let warmupRunning = false;

function isFeatureFlagEnabled(): boolean {
  const value = import.meta.env.VITE_OFFLINE_PROGRESSIVE_DOWNLOAD ?? '1';
  return value !== OFFLINE_FEATURE_FLAG_DISABLED;
}

function isUserDisabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(OFFLINE_DISABLED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function shouldSkipWarmup(): boolean {
  if (!isFeatureFlagEnabled()) return true;
  if (isUserDisabled()) return true;
  if (typeof navigator === 'undefined') return true;
  if (navigator.onLine === false) return true;
  if (isOnSlowConnection()) return true;
  return false;
}

async function checkBatteryAllowsWarmup(): Promise<boolean> {
  const navWithBattery = navigator as NavigatorWithBattery;
  if (typeof navWithBattery.getBattery !== 'function') return true;
  try {
    const battery = await navWithBattery.getBattery();
    if (
      typeof battery.level === 'number' &&
      battery.level < LOW_BATTERY_THRESHOLD &&
      battery.charging === false
    ) {
      return false;
    }
  } catch {
    return true;
  }
  return true;
}

function scheduleIdle(callback: () => void): number {
  if (typeof window === 'undefined') return 0;

  const win = window as Window & {
    requestIdleCallback?: (
      cb: () => void,
      opts?: { timeout?: number }
    ) => number;
  };
  if (typeof win.requestIdleCallback === 'function') {
    return win.requestIdleCallback(callback, { timeout: 2_000 });
  }
  return window.setTimeout(callback, 0);
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    }

    signal.addEventListener('abort', onAbort);
  });
}

async function runPhaseA(ctx: WarmupContext): Promise<void> {
  ctx.store.setWarmupPhase('A');

  const urls = PHASE_A_RESOURCES.map((p) => resolveStaticAssetUrl(p));
  await Promise.allSettled(
    urls.map(async (url) => {
      try {
        await fetch(url, { signal: ctx.signal });
      } catch (error) {
        if (ctx.signal.aborted) return;
        logger.debug('Phase A warmup fetch failed', LogCategory.SYSTEM, {
          url,
          error
        });
      }
    })
  );

  if (ctx.signal.aborted) return;
  ctx.store.setWarmupPhase('A-done');
}

async function downloadEntryWithFallback(
  entry: BasemapDownloadEntry,
  ctx: WarmupContext
): Promise<void> {
  if (ctx.signal.aborted) return;

  ctx.store.setBasemapStatus(entry.basemapId, 'downloading', 0);

  const result = await prepareBasemapForOffline({
    basemapId: entry.basemapId,
    urls: entry.urls,
    title: entry.title
  });

  if (result.status === 'started' || result.status === 'already-running') {
    return;
  }

  if (result.status === 'unsupported' || result.status === 'failed') {
    await fallbackFetch(entry, ctx);
  }
}

async function fallbackFetch(
  entry: BasemapDownloadEntry,
  ctx: WarmupContext
): Promise<void> {
  let totalBytes = 0;
  for (const url of entry.urls) {
    if (ctx.signal.aborted) return;
    try {
      const response = await fetch(url, { signal: ctx.signal });
      if (response.ok) {
        const contentLength = Number(
          response.headers.get('content-length') ?? 0
        );
        if (Number.isFinite(contentLength) && contentLength > 0) {
          totalBytes += contentLength;
        }
      }
    } catch (error) {
      if (ctx.signal.aborted) return;
      logger.debug('Fallback fetch failed', LogCategory.SYSTEM, {
        basemapId: entry.basemapId,
        url,
        error
      });
      ctx.store.setBasemapStatus(entry.basemapId, 'failed', 0);
      return;
    }
  }
  ctx.store.setBasemapStatus(entry.basemapId, 'cached', 1, totalBytes);
}

async function runConcurrent(
  entries: BasemapDownloadEntry[],
  concurrency: number,
  ctx: WarmupContext
): Promise<void> {
  let index = 0;

  async function worker() {
    while (index < entries.length) {
      if (ctx.signal.aborted) return;
      const current = entries[index++];
      await downloadEntryWithFallback(current, ctx);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () =>
    worker()
  );
  await Promise.all(workers);
}

async function runPhaseB(ctx: WarmupContext): Promise<void> {
  ctx.store.setWarmupPhase('B');

  const entries = await buildEssentialDownloadEntries();
  if (entries.length === 0 || ctx.signal.aborted) {
    return;
  }

  await runConcurrent(entries, PHASE_B_CONCURRENCY, ctx);

  if (ctx.signal.aborted) return;

  ctx.store.setWarmupPhase('B-done');
  void ensurePeriodicBasemapRevalidation();
}

async function runPhaseC(ctx: WarmupContext): Promise<void> {
  ctx.store.setWarmupPhase('C');

  const allEntries = await buildExtendedDownloadEntries();
  const essentialIds = new Set(
    (await buildEssentialDownloadEntries()).map((e) => e.basemapId)
  );
  const remaining = allEntries.filter((e) => !essentialIds.has(e.basemapId));

  if (remaining.length === 0 || ctx.signal.aborted) {
    return;
  }

  await runConcurrent(remaining, PHASE_C_CONCURRENCY, ctx);
}

export function startProgressiveWarmup(ctx: WarmupContext): void {
  if (warmupRunning) return;
  if (shouldSkipWarmup()) {
    ctx.store.setWarmupPhase('disabled');
    return;
  }

  warmupRunning = true;

  scheduleIdle(() => {
    void (async () => {
      try {
        await runPhaseA(ctx);
        if (ctx.signal.aborted) return;

        await delay(PHASE_B_DELAY_MS, ctx.signal);
        if (ctx.signal.aborted) return;

        const batteryOk = await checkBatteryAllowsWarmup();
        if (!batteryOk || ctx.signal.aborted) return;

        await runPhaseB(ctx);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        logger.warn('Progressive warmup failed', LogCategory.SYSTEM, error);
      } finally {
        warmupRunning = false;
      }
    })();
  });
}

export async function startExtendedWarmup(ctx: WarmupContext): Promise<void> {
  if (shouldSkipWarmup()) return;
  try {
    await runPhaseC(ctx);
  } catch (error) {
    if ((error as Error).name === 'AbortError') return;
    logger.warn('Extended warmup failed', LogCategory.SYSTEM, error);
  }
}

export function setOfflineDownloadsDisabled(disabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (disabled) {
      localStorage.setItem(OFFLINE_DISABLED_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(OFFLINE_DISABLED_STORAGE_KEY);
    }
  } catch {
    /* ignore storage errors */
  }
}

export function areOfflineDownloadsDisabled(): boolean {
  return isUserDisabled();
}

export function _resetWarmupRunningForTests(): void {
  warmupRunning = false;
}
