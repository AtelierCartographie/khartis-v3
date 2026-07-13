import { LogCategory, logger } from './logger';
import {
  createPwaCachePrefix,
  isPwaCacheForScope,
  resolvePwaScopeUrl
} from './pwa-cache';

const FACTORY_RESET_QUERY_PARAM = 'reset';
const RESET_SKIP_RESTORE_STORAGE_KEY_SUFFIX = 'reset-skip-restore';

function resetSkipRestoreStorageKey(): string {
  const scopeUrl = resolvePwaScopeUrl(document.baseURI);
  return `${createPwaCachePrefix(scopeUrl)}${RESET_SKIP_RESTORE_STORAGE_KEY_SUFFIX}`;
}

function postFactoryResetMessage(controller: ServiceWorker): void {
  try {
    controller.postMessage({
      type: 'FACTORY_RESET'
    });
  } catch (error) {
    logger.error(
      'Failed to notify service worker before factory reset',
      LogCategory.SYSTEM,
      error
    );
  }
}

export interface FactoryResetOptions {
  reload?: boolean;
}

export function buildPwaResetUrl(currentHref: string): string {
  const url = new URL(currentHref);
  url.searchParams.set(FACTORY_RESET_QUERY_PARAM, '1');
  return `${url.pathname}${url.search}${url.hash}`;
}

export function shouldSkipLastProjectRestore(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const urlHasReset = new URLSearchParams(window.location.search).has(
    FACTORY_RESET_QUERY_PARAM
  );
  if (urlHasReset) {
    return true;
  }
  try {
    const storageKey = resetSkipRestoreStorageKey();
    if (window.sessionStorage.getItem(storageKey) === '1') {
      window.sessionStorage.removeItem(storageKey);
      return true;
    }
  } catch (error) {
    logger.error(
      'Failed to read factory reset restore flag',
      LogCategory.SYSTEM,
      error
    );
  }
  return false;
}

export async function factoryResetPwa(
  options: FactoryResetOptions = {}
): Promise<void> {
  const { reload = true } = options;
  const scopeUrl =
    typeof document !== 'undefined'
      ? resolvePwaScopeUrl(document.baseURI)
      : null;

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    if (navigator.serviceWorker.controller) {
      postFactoryResetMessage(navigator.serviceWorker.controller);
    }

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => registration.scope === scopeUrl)
          .map((registration) => registration.unregister())
      );
    } catch (error) {
      logger.error(
        'Failed to unregister service workers during factory reset',
        LogCategory.SYSTEM,
        error
      );
    }
  }

  if (typeof caches !== 'undefined' && scopeUrl) {
    try {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => isPwaCacheForScope(name, scopeUrl))
          .map((name) => caches.delete(name))
      );
    } catch (error) {
      logger.error(
        'Failed to clear caches during factory reset',
        LogCategory.SYSTEM,
        error
      );
    }
  }

  if (reload && typeof window !== 'undefined') {
    window.location.replace(buildPwaResetUrl(window.location.href));
  }
}
