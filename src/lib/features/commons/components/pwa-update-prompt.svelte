<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import {
    InlineNotification,
    NotificationActionButton
  } from 'carbon-components-svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';

  const OFFLINE_READY_TIMEOUT = 5000;

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegistered(registration) {
      if (registration) {
        setInterval(
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
    await updateServiceWorker(true);
    window.location.reload();
  }

  function closeUpdateNotification() {
    needRefresh.set(false);
  }

  function closeOfflineNotification() {
    offlineReady.set(false);
  }
</script>

{#if $needRefresh}
  <div class="pwa-notification-container">
    <InlineNotification
      kind="info"
      subtitle={m.pwa_update_subtitle()}
      hideCloseButton={false}
      lowContrast={false}
      on:close={closeUpdateNotification}
    >
      <NotificationActionButton kind="ghost" on:click={handleUpdate}>
        {m.pwa_update_title()}
      </NotificationActionButton>
    </InlineNotification>
  </div>
{/if}

{#if $offlineReady}
  <div class="pwa-notification-container">
    <InlineNotification
      kind="success"
      title={m.pwa_offline_ready_title()}
      subtitle={m.pwa_offline_ready_subtitle()}
      hideCloseButton={false}
      lowContrast={false}
      timeout={OFFLINE_READY_TIMEOUT}
      on:close={closeOfflineNotification}
    />
  </div>
{/if}

<style>
  .pwa-notification-container {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: var(--z-overlay);
    max-width: 400px;
  }
</style>
