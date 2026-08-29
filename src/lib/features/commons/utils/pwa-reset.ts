import { replaceState } from '$app/navigation';
import { resolve } from '$app/paths';
import { LogCategory, logger } from './logger';
import {
  createPwaCachePrefix,
  isPwaCacheForScope,
  resolvePwaScopeUrl
} from './pwa-cache';

const FACTORY_RESET_QUERY_PARAM = 'reset';
const FAILED_RESTORE_QUERY_PARAM = 'restoreFallback';
const RESET_SKIP_RESTORE_STORAGE_KEY_SUFFIX = 'reset-skip-restore';
const LAST_PROJECT_RESTORE_QUARANTINE_KEY_SUFFIX =
  'last-project-restore-quarantine';
const UNKNOWN_PROJECT_RESTORE_QUARANTINE = '*';

function resetSkipRestoreStorageKey(): string {
  const scopeUrl = resolvePwaScopeUrl(document.baseURI);
  return `${createPwaCachePrefix(scopeUrl)}${RESET_SKIP_RESTORE_STORAGE_KEY_SUFFIX}`;
}

function lastProjectRestoreQuarantineStorageKey(): string {
  const scopeUrl = resolvePwaScopeUrl(document.baseURI);
  return `${createPwaCachePrefix(scopeUrl)}${LAST_PROJECT_RESTORE_QUARANTINE_KEY_SUFFIX}`;
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
  const params = new URLSearchParams(window.location.search);
  const urlHasReset = params.has(FACTORY_RESET_QUERY_PARAM);
  if (urlHasReset) {
    return true;
  }

  const failedRestoreProjectId = params.get(FAILED_RESTORE_QUERY_PARAM);
  if (failedRestoreProjectId !== null) {
    const quarantinePersisted = quarantineLastProjectRestore(
      failedRestoreProjectId === UNKNOWN_PROJECT_RESTORE_QUARANTINE
        ? undefined
        : failedRestoreProjectId
    );
    if (quarantinePersisted) {
      clearLastProjectRestoreFallbackUrl();
    }
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

export function buildLastProjectRestoreFallbackUrl(
  currentHref: string,
  projectId?: string
): string {
  const url = new URL(currentHref);
  url.searchParams.set(
    FAILED_RESTORE_QUERY_PARAM,
    projectId ?? UNKNOWN_PROJECT_RESTORE_QUARANTINE
  );
  return `${url.pathname}${url.search}${url.hash}`;
}

function clearLastProjectRestoreFallbackUrl(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  if (!url.searchParams.has(FAILED_RESTORE_QUERY_PARAM)) {
    return;
  }

  url.searchParams.delete(FAILED_RESTORE_QUERY_PARAM);
  if (url.search) {
    replaceState(
      resolve(`/?${url.searchParams.toString()}${url.hash}`),
      window.history.state
    );
  } else if (url.hash) {
    replaceState(resolve(`/#${url.hash.slice(1)}`), window.history.state);
  } else {
    replaceState(resolve('/'), window.history.state);
  }
}

export function isLastProjectRestoreQuarantined(projectId?: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const quarantinedProjectId = window.sessionStorage.getItem(
      lastProjectRestoreQuarantineStorageKey()
    );
    return (
      quarantinedProjectId === UNKNOWN_PROJECT_RESTORE_QUARANTINE ||
      (projectId !== undefined && quarantinedProjectId === projectId)
    );
  } catch (error) {
    logger.error(
      'Failed to read project restore quarantine',
      LogCategory.SYSTEM,
      error
    );
    return false;
  }
}

export function quarantineLastProjectRestore(projectId?: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.sessionStorage.setItem(
      lastProjectRestoreQuarantineStorageKey(),
      projectId ?? UNKNOWN_PROJECT_RESTORE_QUARANTINE
    );
    return true;
  } catch (error) {
    logger.error(
      'Failed to persist project restore quarantine',
      LogCategory.SYSTEM,
      error
    );
    return false;
  }
}

export function clearLastProjectRestoreQuarantine(projectId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const storageKey = lastProjectRestoreQuarantineStorageKey();
    const quarantinedProjectId = window.sessionStorage.getItem(storageKey);
    if (
      quarantinedProjectId === UNKNOWN_PROJECT_RESTORE_QUARANTINE ||
      quarantinedProjectId === projectId
    ) {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch (error) {
    logger.error(
      'Failed to clear project restore quarantine',
      LogCategory.SYSTEM,
      error
    );
  }

  clearLastProjectRestoreFallbackUrl();
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
