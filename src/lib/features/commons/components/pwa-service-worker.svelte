<script lang="ts">
  import { dev } from '$app/environment';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { onDestroy, onMount } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';

  const SW_UPDATE_POLL_INTERVAL_MS = 60 * 60 * 1000;

  let registrationUpdateInterval: ReturnType<typeof setInterval> | null = null;

  useRegisterSW({
    immediate: true,
    onRegistered(registration) {
      if (!registration) return;

      if (registrationUpdateInterval) {
        clearInterval(registrationUpdateInterval);
      }

      registrationUpdateInterval = setInterval(() => {
        registration.update();
      }, SW_UPDATE_POLL_INTERVAL_MS);
    },
    onRegisterError(error) {
      logger.error('SW registration error', LogCategory.SYSTEM, error);
    }
  });

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
        logger.error('Dev SW cleanup failed', LogCategory.SYSTEM, error);
      }
    })();
  });
</script>
