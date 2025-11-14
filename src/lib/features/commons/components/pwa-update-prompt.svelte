<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { InlineNotification, Button } from 'carbon-components-svelte';
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
    <InlineNotification
      kind="info"
      title={m.pwa_update_title()}
      subtitle={m.pwa_update_subtitle()}
      hideCloseButton={false}
      lowContrast={false}
      on:close={closeUpdateNotification}
    >
      <div slot="actions" class="notification-actions">
        <button class="update-btn" on:click={handleUpdate}>
          {m.pwa_update_action()}
        </button>
      </div>
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
    z-index: 9999;
    max-width: 400px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  .notification-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .update-btn {
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    text-decoration: underline;
    transition: opacity 0.2s ease;
  }

  .update-btn:hover {
    opacity: 0.8;
  }

  .update-btn:active {
    opacity: 0.6;
  }
</style>
