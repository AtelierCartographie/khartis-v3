<script lang="ts">
  import { dev } from '$app/environment';
  import { m } from '$lib/paraglide/messages';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { onDestroy, onMount } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';

  let isUpdating = $state(false);
  let registrationUpdateInterval: ReturnType<typeof setInterval> | null = null;

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    immediate: false,
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

  // Dev-only cleanup
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

<!-- Update toast — Carbon-inspired, never auto-dismisses -->
{#if $needRefresh}
  <div class="pwa-toast pwa-toast--info" role="alert" aria-live="polite">
    <div class="pwa-toast__accent"></div>

    <div class="pwa-toast__icon">
      <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
        <path
          d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm3 16.5h-6v-1.5h1.5V14H13v-1.5h4.5v9H19v1.5z"
          fill="currentColor"
        />
      </svg>
    </div>

    <div class="pwa-toast__body">
      <div class="pwa-toast__text">
        <p class="pwa-toast__title">{m.pwa_update_title()}</p>
        <p class="pwa-toast__subtitle">{m.pwa_update_subtitle()}</p>
      </div>
      <div class="pwa-toast__actions">
        <button
          class="pwa-toast__btn"
          disabled={isUpdating}
          onclick={handleUpdate}
        >
          {isUpdating ? 'Mise à jour…' : m.pwa_update_action()}
        </button>
      </div>
    </div>

    <button
      class="pwa-toast__close"
      aria-label="Fermer la notification"
      onclick={closeUpdateNotification}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M12 4L4 12M4 4L12 12"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </div>
{/if}

<!-- Offline ready toast — auto-dismisses after timeout -->
{#if $offlineReady}
  <div class="pwa-toast pwa-toast--success" role="alert" aria-live="polite">
    <div class="pwa-toast__accent"></div>
    <div class="pwa-toast__icon">
      <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
        <path
          d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm-2 19.59L9.41 17l-1.18 1.18L14 24l10-10-1.18-1.18L14 21.59z"
          fill="currentColor"
        />
      </svg>
    </div>
    <div class="pwa-toast__body">
      <div class="pwa-toast__text">
        <p class="pwa-toast__title">{m.pwa_offline_ready_title()}</p>
        <p class="pwa-toast__subtitle">{m.pwa_offline_ready_subtitle()}</p>
      </div>
    </div>
    <button
      class="pwa-toast__close"
      aria-label="Fermer la notification"
      onclick={closeOfflineNotification}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M12 4L4 12M4 4L12 12"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </div>
{/if}

<style>
  .pwa-toast {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: var(--z-overlay);
    display: flex;
    align-items: flex-start;
    gap: 0;
    width: min(28rem, calc(100vw - 2rem));
    min-height: 3.5rem;
    background: #ffffff;
    border: 1px solid #e0e0e0;
    border-radius: 0;
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.08),
      0 4px 16px rgba(0, 0, 0, 0.06);
    font-family: inherit;
    font-size: 0.875rem;
    line-height: 1.28572;
    color: #161616;
    animation: pwa-toast-slide-in 0.18s cubic-bezier(0, 0, 0.38, 0.9);
  }

  .pwa-toast--info ~ .pwa-toast--success {
    bottom: 7rem;
  }

  @keyframes pwa-toast-slide-in {
    from {
      opacity: 0;
      transform: translateX(1rem);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .pwa-toast__accent {
    flex-shrink: 0;
    width: 3px;
    align-self: stretch;
  }

  .pwa-toast--info .pwa-toast__accent {
    background: #0f62fe;
  }

  .pwa-toast--success .pwa-toast__accent {
    background: #24a148;
  }

  .pwa-toast__icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    min-height: 3.5rem;
    padding-left: 0.5rem;
  }

  .pwa-toast--info .pwa-toast__icon {
    color: #0f62fe;
  }

  .pwa-toast--success .pwa-toast__icon {
    color: #24a148;
  }

  .pwa-toast__body {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0;
    min-width: 0;
  }

  .pwa-toast__text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .pwa-toast__title {
    margin: 0;
    font-weight: 600;
    font-size: 0.875rem;
    line-height: 1.28572;
    color: #161616;
    letter-spacing: 0.01em;
  }

  .pwa-toast__subtitle {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.28572;
    color: #525252;
  }

  .pwa-toast__actions {
    flex-shrink: 0;
    padding-right: 0.5rem;
  }

  .pwa-toast__btn {
    display: inline-flex;
    align-items: center;
    height: 2rem;
    padding: 0 1rem;
    background: transparent;
    border: none;
    color: #0f62fe;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.28572;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: background-color 0.11s cubic-bezier(0, 0, 0.38, 0.9);
    white-space: nowrap;
  }

  .pwa-toast__btn:hover:not(:disabled) {
    background: #e8f0fe;
  }

  .pwa-toast__btn:active:not(:disabled) {
    background: #d0e2ff;
  }

  .pwa-toast__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pwa-toast__close {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    margin: 0;
    padding: 0;
    background: transparent;
    border: none;
    color: #161616;
    cursor: pointer;
    transition: background-color 0.11s cubic-bezier(0, 0, 0.38, 0.9);
  }

  .pwa-toast__close:hover {
    background: #e8e8e8;
  }

  .pwa-toast__close:active {
    background: #d1d1d1;
  }

  @media (max-width: 640px) {
    .pwa-toast {
      left: 1rem;
      right: 1rem;
      width: auto;
    }

    .pwa-toast__body {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .pwa-toast__actions {
      padding-right: 0;
    }
  }
</style>
