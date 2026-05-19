<script lang="ts">
  import { dev } from '$app/environment';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { connectivityStore } from '$lib/features/commons/stores/connectivity.store.svelte';
  import { factoryResetPwa } from '$lib/features/commons/utils/pwa-offline';
  import { startProgressiveWarmup } from '$lib/features/commons/utils/offline-warmup-scheduler';
  import { isSwToClientMessage } from '$lib/types/sw-messages';
  import { onDestroy, onMount } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';

  const BYTES_PER_MIB = 1024 * 1024;
  const AUTO_RELOAD_GUARD_KEY = 'khartis:auto-reloaded-at';
  const AUTO_RELOAD_GUARD_WINDOW_MS = 10 * 1000;

  let warmupAbortController: AbortController | null = null;
  let swMessageHandler: ((event: MessageEvent) => void) | null = null;
  let preloadErrorHandler: ((event: Event) => void) | null = null;

  useRegisterSW({
    immediate: true,
    onRegisterError(error) {
      logger.error('SW registration error', LogCategory.SYSTEM, error);
    }
  });

  function recordAutoReload(): boolean {
    try {
      const last = Number(sessionStorage.getItem(AUTO_RELOAD_GUARD_KEY) ?? '0');
      if (
        Number.isFinite(last) &&
        Date.now() - last < AUTO_RELOAD_GUARD_WINDOW_MS
      ) {
        return false;
      }
      sessionStorage.setItem(AUTO_RELOAD_GUARD_KEY, String(Date.now()));
      return true;
    } catch {
      return true;
    }
  }

  async function recoverFromStaleAssets(): Promise<void> {
    logger.warn(
      'Stale dynamic import detected, recovering',
      LogCategory.SYSTEM
    );
    if (recordAutoReload()) {
      window.location.reload();
      return;
    }
    logger.error(
      'Auto-reload loop detected, performing factory reset',
      LogCategory.SYSTEM
    );
    await factoryResetPwa({ reload: true });
  }

  function attachStaleAssetRecovery(): void {
    preloadErrorHandler = (event: Event) => {
      event.preventDefault();
      void recoverFromStaleAssets();
    };
    window.addEventListener('vite:preloadError', preloadErrorHandler);
  }

  function detachStaleAssetRecovery(): void {
    if (preloadErrorHandler) {
      window.removeEventListener('vite:preloadError', preloadErrorHandler);
      preloadErrorHandler = null;
    }
  }

  async function requestPersistentStorage(): Promise<void> {
    if (
      typeof navigator === 'undefined' ||
      !('storage' in navigator) ||
      typeof navigator.storage.persist !== 'function'
    ) {
      return;
    }

    try {
      const isPersisted =
        typeof navigator.storage.persisted === 'function'
          ? await navigator.storage.persisted()
          : false;

      if (isPersisted) {
        return;
      }

      const granted = await navigator.storage.persist();
      logger.debug('Persistent storage request', LogCategory.SYSTEM, {
        granted
      });
    } catch (error) {
      logger.warn(
        'Persistent storage request failed',
        LogCategory.SYSTEM,
        error
      );
    }
  }

  async function logStorageUsage(): Promise<void> {
    if (
      typeof navigator === 'undefined' ||
      !('storage' in navigator) ||
      typeof navigator.storage.estimate !== 'function'
    ) {
      return;
    }

    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      logger.info('PWA storage estimate', LogCategory.SYSTEM, {
        usageMiB: (usage / BYTES_PER_MIB).toFixed(1),
        quotaMiB: (quota / BYTES_PER_MIB).toFixed(1),
        usageRatio: quota > 0 ? (usage / quota).toFixed(3) : '0'
      });
    } catch (error) {
      logger.warn('Storage estimate failed', LogCategory.SYSTEM, error);
    }
  }

  function attachSwMessageListener(): void {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    swMessageHandler = (event: MessageEvent) => {
      if (isSwToClientMessage(event.data)) {
        connectivityStore.handleSwMessage(event.data);
      }
    };
    navigator.serviceWorker.addEventListener('message', swMessageHandler);
  }

  function detachSwMessageListener(): void {
    if (
      swMessageHandler &&
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator
    ) {
      navigator.serviceWorker.removeEventListener('message', swMessageHandler);
      swMessageHandler = null;
    }
  }

  async function bootstrapOfflineWarmup(): Promise<void> {
    try {
      await connectivityStore.refreshStorageEstimate();
      await connectivityStore.refreshCachedBasemaps();
    } catch (error) {
      logger.debug(
        'Initial offline state refresh failed',
        LogCategory.SYSTEM,
        error
      );
    }

    warmupAbortController = new AbortController();
    startProgressiveWarmup({
      store: connectivityStore,
      signal: warmupAbortController.signal
    });
  }

  onDestroy(() => {
    if (warmupAbortController) {
      warmupAbortController.abort();
      warmupAbortController = null;
    }
    detachSwMessageListener();
    detachStaleAssetRecovery();
  });

  onMount(() => {
    if (dev || typeof navigator === 'undefined') {
      void cleanupDevServiceWorker();
      return;
    }

    void requestPersistentStorage();
    void logStorageUsage();
    attachSwMessageListener();
    attachStaleAssetRecovery();
    void bootstrapOfflineWarmup();
  });

  async function cleanupDevServiceWorker(): Promise<void> {
    if (!dev || typeof navigator === 'undefined') {
      return;
    }

    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map((registration) => registration.unregister())
        );
      }

      if ('caches' in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
      }
    } catch (error) {
      logger.error('Dev SW cleanup failed', LogCategory.SYSTEM, error);
    }
  }
</script>
