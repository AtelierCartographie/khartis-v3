<script lang="ts">
  import { dev } from '$app/environment';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import {
    isPwaCacheForScope,
    resolvePwaScopeUrl
  } from '$lib/features/commons/utils/pwa-cache';
  import { pwaUpdateService } from '$lib/features/commons/services/pwa-update.service.svelte';
  import { onDestroy, onMount } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import {
    NotificationActionButton,
    ToastNotification
  } from 'carbon-components-svelte';
  import * as m from '$lib/paraglide/messages';

  const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

  let updateCheckIntervalId: ReturnType<typeof setInterval> | null = null;
  let observedServiceWorkerContainer: ServiceWorkerContainer | null = null;

  const handleControllerChange = () => {
    pwaUpdateService.handleActivationSignal();
  };

  useRegisterSW({
    immediate: true,
    onNeedReload() {
      pwaUpdateService.handleActivationSignal();
    },
    onNeedRefresh() {
      pwaUpdateService.markUpdateAvailable();
    },
    onRegisterError(error) {
      logger.error('SW registration error', LogCategory.SYSTEM, error);
      pwaUpdateService.reportRegistrationError(error);
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      void configureRegistration(swUrl, registration);
    }
  });

  const updatePromptVisible = $derived(
    pwaUpdateService.notificationVisible &&
      (pwaUpdateService.status === 'available' ||
        pwaUpdateService.status === 'error')
  );

  const updateNotificationKind = $derived(
    pwaUpdateService.status === 'error' ? 'error' : 'info'
  );

  const updateNotificationTitle = $derived.by(() => {
    if (pwaUpdateService.status !== 'error') {
      return m.pwa_update_available_title();
    }

    return pwaUpdateService.errorKind === 'save'
      ? m.pwa_update_save_error_title()
      : m.pwa_update_error_title();
  });

  const updateNotificationSubtitle = $derived.by(() => {
    if (pwaUpdateService.status !== 'error') {
      return m.pwa_update_available_subtitle();
    }

    switch (pwaUpdateService.errorKind) {
      case 'save':
        return m.pwa_update_save_error_subtitle();
      case 'offline':
        return m.pwa_update_offline_error_subtitle();
      case 'unsupported':
        return m.pwa_update_unsupported_error_subtitle();
      case 'registration':
        return m.pwa_update_registration_error_subtitle();
      case 'activation':
        return m.pwa_update_activation_error_subtitle();
      default:
        return m.pwa_update_check_error_subtitle();
    }
  });

  const updateNotificationAction = $derived(
    pwaUpdateService.status === 'available'
      ? m.pwa_update_install_button()
      : m.pwa_update_retry_button()
  );

  async function configureRegistration(
    swUrl: string,
    initialRegistration: ServiceWorkerRegistration
  ): Promise<void> {
    if (dev) {
      await cleanupDevServiceWorker();
      return;
    }

    let registration = initialRegistration;

    try {
      registration = await navigator.serviceWorker.register(swUrl, {
        scope: initialRegistration.scope,
        updateViaCache: 'none'
      });
    } catch (error) {
      logger.error(
        'SW no-cache re-registration failed',
        LogCategory.SYSTEM,
        error
      );
    }

    pwaUpdateService.setRegistration(registration);

    if (updateCheckIntervalId !== null) {
      clearInterval(updateCheckIntervalId);
    }

    updateCheckIntervalId = setInterval(() => {
      if (registration.installing || !navigator.onLine) return;
      void pwaUpdateService.checkForUpdate({ silent: true });
    }, UPDATE_CHECK_INTERVAL_MS);
  }

  async function applyUpdate(): Promise<void> {
    await pwaUpdateService.runPrimaryAction();
  }

  function dismissUpdate(): void {
    pwaUpdateService.dismissNotification();
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

  onDestroy(() => {
    if (updateCheckIntervalId !== null) {
      clearInterval(updateCheckIntervalId);
      updateCheckIntervalId = null;
    }
    observedServiceWorkerContainer?.removeEventListener(
      'controllerchange',
      handleControllerChange
    );
    observedServiceWorkerContainer = null;
    pwaUpdateService.disconnect();
  });

  onMount(() => {
    if (dev || typeof navigator === 'undefined') {
      void cleanupDevServiceWorker();
      return;
    }

    if ('serviceWorker' in navigator) {
      observedServiceWorkerContainer = navigator.serviceWorker;
      observedServiceWorkerContainer.addEventListener(
        'controllerchange',
        handleControllerChange
      );
    }

    void requestPersistentStorage();
  });

  async function cleanupDevServiceWorker(): Promise<void> {
    if (
      !dev ||
      typeof navigator === 'undefined' ||
      typeof document === 'undefined'
    ) {
      return;
    }

    try {
      const scopeUrl = resolvePwaScopeUrl(document.baseURI);
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations
            .filter((registration) => registration.scope === scopeUrl)
            .map((registration) => registration.unregister())
        );
      }

      if ('caches' in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(
          cacheKeys
            .filter((cacheKey) => isPwaCacheForScope(cacheKey, scopeUrl))
            .map((cacheKey) => caches.delete(cacheKey))
        );
      }
    } catch (error) {
      logger.error('Dev SW cleanup failed', LogCategory.SYSTEM, error);
    }
  }
</script>

{#if updatePromptVisible}
  <div class="pwa-update-toast">
    <ToastNotification
      kind={updateNotificationKind}
      lowContrast
      title={updateNotificationTitle}
      subtitle={updateNotificationSubtitle}
      closeButtonDescription={m.pwa_update_close_aria()}
      statusIconDescription={m.pwa_update_status_icon_aria()}
      timeout={0}
      on:close={dismissUpdate}
    >
      <NotificationActionButton on:click={applyUpdate}>
        {updateNotificationAction}
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
