<script lang="ts">
  import { dev } from '$app/environment';
  import { LogCategory, logger } from '$lib/features/commons/utils/logger';
  import { onDestroy, onMount } from 'svelte';
  import { useRegisterSW } from 'virtual:pwa-register/svelte';

  const SW_UPDATE_POLL_INTERVAL_MS = 60 * 60 * 1000;
  const BYTES_PER_MIB = 1024 * 1024;

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

  onDestroy(() => {
    if (registrationUpdateInterval) {
      clearInterval(registrationUpdateInterval);
      registrationUpdateInterval = null;
    }
  });

  onMount(() => {
    if (dev || typeof navigator === 'undefined') {
      void cleanupDevServiceWorker();
      return;
    }

    void requestPersistentStorage();
    void logStorageUsage();
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
