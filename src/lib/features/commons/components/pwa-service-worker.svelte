<script lang="ts">
  import { dev } from '$app/environment';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { connectivityStore } from '$lib/features/commons/stores/connectivity.store.svelte';
  import { factoryResetPwa } from '$lib/features/commons/utils/pwa-offline';
  import { startProgressiveWarmup } from '$lib/features/commons/utils/offline-warmup-scheduler';
  import { isSwToClientMessage } from '$lib/types/sw-messages';
  import { onDestroy, onMount } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import {
    NotificationActionButton,
    ToastNotification
  } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';

  const AUTO_RELOAD_GUARD_KEY = 'khartis:auto-reloaded-at';
  const AUTO_RELOAD_GUARD_WINDOW_MS = 10 * 1000;
  const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

  let warmupAbortController: AbortController | null = null;
  let swMessageHandler: ((event: MessageEvent) => void) | null = null;
  let preloadErrorHandler: ((event: Event) => void) | null = null;
  let updateCheckIntervalId: ReturnType<typeof setInterval> | null = null;

  const { needRefresh, updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisterError(error) {
      logger.error('SW registration error', LogCategory.SYSTEM, error);
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      updateCheckIntervalId = setInterval(async () => {
        if (registration.installing || !navigator.onLine) return;
        try {
          const response = await fetch(swUrl, {
            cache: 'no-store',
            headers: { 'cache-control': 'no-cache' }
          });
          if (response.status === 200) {
            await registration.update();
          }
        } catch (error) {
          logger.error('SW update check failed', LogCategory.SYSTEM, error);
        }
      }, UPDATE_CHECK_INTERVAL_MS);
    }
  });

  let updatePromptVisible = $derived($needRefresh);

  async function applyUpdate(): Promise<void> {
    updatePromptVisible = false;
    try {
      await updateServiceWorker(true);
    } catch (error) {
      logger.error('Failed to apply SW update', LogCategory.SYSTEM, error);
      window.location.reload();
    }
  }

  function dismissUpdate(): void {
    updatePromptVisible = false;
  }

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
    } catch (error) {
      logger.error(
        'Failed to update auto-reload session guard',
        LogCategory.SYSTEM,
        error
      );
      return true;
    }
  }

  async function recoverFromStaleAssets(): Promise<void> {
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

      await navigator.storage.persist();
    } catch (error) {
      logger.error(
        'Failed to request persistent browser storage',
        LogCategory.SYSTEM,
        error
      );
      return;
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
    await Promise.allSettled([
      connectivityStore.refreshStorageEstimate(),
      connectivityStore.refreshCachedBasemaps()
    ]);

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
    if (updateCheckIntervalId !== null) {
      clearInterval(updateCheckIntervalId);
      updateCheckIntervalId = null;
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

{#if updatePromptVisible}
  <div class="pwa-update-toast">
    <ToastNotification
      kind="info"
      lowContrast
      title={m.pwa_update_available_title()}
      subtitle={m.pwa_update_available_subtitle()}
      closeButtonDescription={m.pwa_update_close_aria()}
      statusIconDescription={m.pwa_update_status_icon_aria()}
      timeout={0}
      on:close={dismissUpdate}
    >
      <NotificationActionButton on:click={applyUpdate}>
        {m.pwa_update_reload_button()}
      </NotificationActionButton>
    </ToastNotification>
  </div>
{/if}

<style>
  .pwa-update-toast {
    position: fixed;
    bottom: calc(16px + var(--safe-area-bottom, 0px));
    right: calc(16px + var(--safe-area-right, 0px));
    z-index: var(--z-notification);
    max-width: 400px;
    pointer-events: none;
  }

  .pwa-update-toast :global(.bx--toast-notification) {
    pointer-events: auto;
    margin: 0;
  }
</style>
