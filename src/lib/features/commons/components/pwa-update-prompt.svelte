<script lang="ts">
  import { dev } from '$app/environment';
  import { m } from '$lib/paraglide/messages';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import {
    InlineNotification,
    NotificationActionButton
  } from 'carbon-components-svelte';
  import { onDestroy, onMount } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';

  const OFFLINE_READY_TIMEOUT = 5000;
  let isUpdating = $state(false);
  let registrationUpdateInterval: ReturnType<typeof setInterval> | null = null;

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegistered(registration) {
      if (registration) {
        if (registrationUpdateInterval) {
          clearInterval(registrationUpdateInterval);
        }

        registrationUpdateInterval = setInterval(
          () => {
            registration.update();
          },
          60 * 60 * 1000
        );
      }
    },
    onRegisterError(error) {
      logger.error('SW registration error', LogCategory.SYSTEM, error);
    }
  });

  async function handleUpdate() {
    isUpdating = true;

    try {
      await updateServiceWorker(true);
    } finally {
      isUpdating = false;
    }
  }

  function closeUpdateNotification() {
    needRefresh.set(false);
  }

  function closeOfflineNotification() {
    offlineReady.set(false);
  }

  onDestroy(() => {
    if (registrationUpdateInterval) {
      clearInterval(registrationUpdateInterval);
      registrationUpdateInterval = null;
    }
  });

  onMount(() => {
    if (!dev || typeof navigator === 'undefined') {
      return;
    }

    void (async () => {
      try {
        if ('serviceWorker' in navigator) {
          const registrations =
            await navigator.serviceWorker.getRegistrations();
          await Promise.all(
            registrations.map((registration) => registration.unregister())
          );
        }

        if ('caches' in window) {
          const cacheKeys = await window.caches.keys();
          await Promise.all(
            cacheKeys.map((cacheKey) => caches.delete(cacheKey))
          );
        }
      } catch (error) {
        console.error(error);
      }
    })();
  });
</script>

{#if $needRefresh || $offlineReady}
  <div class="pwa-notification-container">
    {#if $needRefresh}
      <InlineNotification
        kind="info"
        title={m.pwa_update_title()}
        subtitle={m.pwa_update_subtitle()}
        hideCloseButton={false}
        lowContrast={false}
        on:close={closeUpdateNotification}
      >
        <svelte:fragment slot="actions">
          <NotificationActionButton
            kind="ghost"
            disabled={isUpdating}
            on:click={handleUpdate}
          >
            {m.pwa_update_action()}
          </NotificationActionButton>
        </svelte:fragment>
      </InlineNotification>
    {/if}

    {#if $offlineReady}
      <InlineNotification
        kind="success"
        title={m.pwa_offline_ready_title()}
        subtitle={m.pwa_offline_ready_subtitle()}
        hideCloseButton={false}
        lowContrast={false}
        timeout={OFFLINE_READY_TIMEOUT}
        on:close={closeOfflineNotification}
      />
    {/if}
  </div>
{/if}

<style>
  .pwa-notification-container {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: var(--z-overlay);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: min(26rem, calc(100vw - 2rem));
  }

  :global(.pwa-notification-container .bx--inline-notification) {
    max-inline-size: 100%;
  }

  @media (max-width: 640px) {
    .pwa-notification-container {
      left: 1rem;
      right: 1rem;
      width: auto;
    }
  }
</style>
