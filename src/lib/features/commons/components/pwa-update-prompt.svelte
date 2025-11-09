<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte';
  import { ToastNotification } from 'carbon-components-svelte';
  import { m } from '$lib/paraglide/messages';

  const UPDATE_TIMEOUT = 0;
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
    }
  });

  function handleUpdate() {
    updateServiceWorker(true);
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
    <ToastNotification
      kind="info"
      title={m.pwa_update_title()}
      subtitle={m.pwa_update_subtitle()}
      caption=""
      timeout={UPDATE_TIMEOUT}
      on:close={closeUpdateNotification}
    >
      <button class="update-button" on:click={handleUpdate}>
        {m.pwa_update_action()}
      </button>
    </ToastNotification>
  </div>
{/if}

{#if $offlineReady}
  <div class="pwa-notification-container">
    <ToastNotification
      kind="success"
      title={m.pwa_offline_ready_title()}
      subtitle={m.pwa_offline_ready_subtitle()}
      caption=""
      timeout={OFFLINE_READY_TIMEOUT}
      on:close={closeOfflineNotification}
    />
  </div>
{/if}

<style>
  .pwa-notification-container {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 9999;
    max-width: 400px;
  }

  .update-button {
    margin-top: 8px;
    padding: 8px 16px;
    background-color: var(--cds-interactive-01);
    color: var(--cds-text-04);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: background-color 0.2s ease;
  }

  .update-button:hover {
    background-color: var(--cds-hover-primary);
  }

  .update-button:active {
    background-color: var(--cds-active-primary);
  }
</style>
