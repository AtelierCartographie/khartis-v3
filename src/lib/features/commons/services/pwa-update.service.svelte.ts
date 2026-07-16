import { persistenceRegistry } from '$lib/features/project-management/core';
import { LogCategory, logger } from '../utils/logger';

const UPDATE_CHECK_TIMEOUT_MS = 15_000;
const WORKER_INSTALL_TIMEOUT_MS = 30_000;
const PERSISTENCE_FLUSH_TIMEOUT_MS = 10_000;
const WORKER_ACTIVATION_TIMEOUT_MS = 20_000;

export type PwaUpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'saving'
  | 'installing'
  | 'error';

export type PwaUpdateErrorKind =
  'unsupported' | 'offline' | 'registration' | 'check' | 'save' | 'activation';

export interface PwaUpdateServiceDependencies {
  flushPersistence: () => Promise<void>;
  isPersistenceDirty: () => boolean;
  getServiceWorkerContainer: () => ServiceWorkerContainer | null;
  isOnline: () => boolean;
  reload: () => void;
  updateCheckTimeoutMs: number;
  workerInstallTimeoutMs: number;
  persistenceFlushTimeoutMs: number;
  workerActivationTimeoutMs: number;
}

export interface CheckForUpdateOptions {
  silent?: boolean;
}

function getDefaultServiceWorkerContainer(): ServiceWorkerContainer | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  return navigator.serviceWorker;
}

function reloadWindow(): void {
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

function createTimeoutError(operation: string): Error {
  return new Error(`${operation} timed out`);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(createTimeoutError(operation)),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

function waitForWorkerInstallation(
  worker: ServiceWorker,
  timeoutMs: number
): Promise<void> {
  if (worker.state === 'installed' || worker.state === 'activated') {
    return Promise.resolve();
  }

  if (worker.state === 'redundant') {
    return Promise.reject(new Error('Service worker became redundant'));
  }

  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(createTimeoutError('Service worker installation'));
    }, timeoutMs);

    const handleStateChange = () => {
      if (worker.state === 'installed' || worker.state === 'activated') {
        cleanup();
        resolve();
      } else if (worker.state === 'redundant') {
        cleanup();
        reject(new Error('Service worker became redundant'));
      }
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      worker.removeEventListener('statechange', handleStateChange);
    };

    worker.addEventListener('statechange', handleStateChange);
  });
}

function observeInstallingWorker(registration: ServiceWorkerRegistration): {
  getWorker: () => ServiceWorker | null;
  stop: () => void;
} {
  let detectedWorker = registration.installing;

  const handleUpdateFound = () => {
    detectedWorker = registration.installing ?? detectedWorker;
  };

  registration.addEventListener('updatefound', handleUpdateFound);

  return {
    getWorker: () => detectedWorker ?? registration.installing,
    stop: () => {
      registration.removeEventListener('updatefound', handleUpdateFound);
    }
  };
}

export function createPwaUpdateService(
  dependencyOverrides: Partial<PwaUpdateServiceDependencies> = {}
) {
  const dependencies: PwaUpdateServiceDependencies = {
    flushPersistence: () => persistenceRegistry.flush(),
    isPersistenceDirty: () => persistenceRegistry.isDirty,
    getServiceWorkerContainer: getDefaultServiceWorkerContainer,
    isOnline: () =>
      typeof navigator === 'undefined' || navigator.onLine !== false,
    reload: reloadWindow,
    updateCheckTimeoutMs: UPDATE_CHECK_TIMEOUT_MS,
    workerInstallTimeoutMs: WORKER_INSTALL_TIMEOUT_MS,
    persistenceFlushTimeoutMs: PERSISTENCE_FLUSH_TIMEOUT_MS,
    workerActivationTimeoutMs: WORKER_ACTIVATION_TIMEOUT_MS,
    ...dependencyOverrides
  };

  let status = $state<PwaUpdateStatus>('idle');
  let errorKind = $state<PwaUpdateErrorKind | null>(null);
  let notificationVisible = $state(false);

  let registration: ServiceWorkerRegistration | null = null;
  let waitingWorker: ServiceWorker | null = null;
  let checkPromise: Promise<void> | null = null;
  let installPromise: Promise<void> | null = null;
  let activationRequested = false;
  let lateActivationReloadAllowed = false;
  let reloadRequested = false;
  let resolveActivation: (() => void) | null = null;
  let cleanupActivationListeners: (() => void) | null = null;
  let externalActivationPromise: Promise<void> | null = null;
  let externalActivationPending = false;

  function setError(kind: PwaUpdateErrorKind, error?: unknown): void {
    status = 'error';
    errorKind = kind;
    notificationVisible = true;

    if (error !== undefined) {
      logger.error('PWA update failed', LogCategory.SYSTEM, {
        kind,
        error
      });
    }
  }

  function setRegistration(nextRegistration: ServiceWorkerRegistration): void {
    registration = nextRegistration;

    if (nextRegistration.waiting) {
      markUpdateAvailable(nextRegistration.waiting);
    }
  }

  function disconnect(): void {
    cleanupActivationListeners?.();
    registration = null;
    waitingWorker = null;
    checkPromise = null;
    installPromise = null;
    activationRequested = false;
    lateActivationReloadAllowed = false;
    resolveActivation = null;
    cleanupActivationListeners = null;
    externalActivationPromise = null;
    externalActivationPending = false;
  }

  function reportRegistrationError(error: unknown): void {
    setError('registration', error);
  }

  function markUpdateAvailable(worker?: ServiceWorker | null): void {
    waitingWorker = worker ?? registration?.waiting ?? waitingWorker;
    status = 'available';
    errorKind = null;
    notificationVisible = true;
  }

  function dismissNotification(): void {
    notificationVisible = false;
  }

  function resolveWaitingWorker(): ServiceWorker | null {
    const worker = registration?.waiting ?? waitingWorker;
    if (!worker || worker.state === 'redundant') {
      return null;
    }

    return worker;
  }

  async function performUpdateCheck(
    options: CheckForUpdateOptions
  ): Promise<void> {
    const silent = options.silent === true;
    const serviceWorkerContainer = dependencies.getServiceWorkerContainer();

    if (!serviceWorkerContainer) {
      if (!silent) {
        setError('unsupported');
      }
      return;
    }

    if (!registration) {
      if (!silent) {
        setError('registration');
      }
      return;
    }

    if (!dependencies.isOnline()) {
      if (!silent) {
        setError('offline');
      }
      return;
    }

    const existingWaitingWorker = resolveWaitingWorker();
    if (existingWaitingWorker) {
      markUpdateAvailable(existingWaitingWorker);
      return;
    }

    if (!silent) {
      status = 'checking';
      errorKind = null;
      notificationVisible = false;
    }

    const installingWorkerObserver = observeInstallingWorker(registration);

    try {
      await withTimeout(
        registration.update(),
        dependencies.updateCheckTimeoutMs,
        'Service worker update check'
      );

      const updatedWaitingWorker = resolveWaitingWorker();
      if (updatedWaitingWorker) {
        markUpdateAvailable(updatedWaitingWorker);
        return;
      }

      const installingWorker = installingWorkerObserver.getWorker();
      if (installingWorker) {
        await waitForWorkerInstallation(
          installingWorker,
          dependencies.workerInstallTimeoutMs
        );

        const installedWorker =
          resolveWaitingWorker() ??
          (serviceWorkerContainer.controller ? installingWorker : null);

        if (installedWorker) {
          markUpdateAvailable(installedWorker);
          return;
        }
      }

      if (!silent) {
        status = 'up-to-date';
        errorKind = null;
        notificationVisible = false;
      }
    } catch (error) {
      if (silent) {
        logger.error(
          'Silent PWA update check failed',
          LogCategory.SYSTEM,
          error
        );
        return;
      }

      setError('check', error);
    } finally {
      installingWorkerObserver.stop();
    }
  }

  function checkForUpdate(options: CheckForUpdateOptions = {}): Promise<void> {
    if (status === 'saving' || status === 'installing') {
      return Promise.resolve();
    }

    if (checkPromise) {
      return checkPromise;
    }

    checkPromise = performUpdateCheck(options).finally(() => {
      checkPromise = null;
    });

    return checkPromise;
  }

  function reloadOnce(): void {
    if (reloadRequested) {
      return;
    }

    reloadRequested = true;
    notificationVisible = false;
    dependencies.reload();
  }

  async function persistBeforeExternalReload(): Promise<void> {
    externalActivationPending = true;
    notificationVisible = false;
    status = 'saving';
    errorKind = null;

    try {
      await withTimeout(
        dependencies.flushPersistence(),
        dependencies.persistenceFlushTimeoutMs,
        'Project persistence flush'
      );

      if (dependencies.isPersistenceDirty()) {
        throw new Error('Project persistence is still dirty');
      }
    } catch (error) {
      setError('save', error);
      return;
    }

    externalActivationPending = false;
    reloadOnce();
  }

  function requestExternalReloadPersistence(): Promise<void> {
    externalActivationPromise ??= persistBeforeExternalReload().finally(() => {
      externalActivationPromise = null;
    });
    return externalActivationPromise;
  }

  function handleActivationSignal(): void {
    if (reloadRequested) {
      return;
    }

    if (activationRequested) {
      resolveActivation?.();
      return;
    }

    if (lateActivationReloadAllowed) {
      lateActivationReloadAllowed = false;
      cleanupActivationListeners?.();
      void requestExternalReloadPersistence();
      return;
    }

    void requestExternalReloadPersistence();
  }

  function activateWaitingWorker(worker: ServiceWorker): Promise<void> {
    const serviceWorkerContainer = dependencies.getServiceWorkerContainer();
    if (!serviceWorkerContainer) {
      return Promise.reject(new Error('Service workers are not supported'));
    }

    cleanupActivationListeners?.();
    activationRequested = true;
    lateActivationReloadAllowed = false;
    reloadRequested = false;

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        clearTimeout(timeoutId);
        serviceWorkerContainer.removeEventListener(
          'controllerchange',
          handleControllerChange
        );
        worker.removeEventListener('statechange', handleStateChange);
        if (resolveActivation === finishActivation) {
          resolveActivation = null;
        }
        if (cleanupActivationListeners === cleanup) {
          cleanupActivationListeners = null;
        }
      };

      const finishActivation = () => {
        if (settled) {
          return;
        }

        settled = true;
        activationRequested = false;
        lateActivationReloadAllowed = false;
        cleanup();
        resolve();
        void requestExternalReloadPersistence();
      };

      const handleConfirmedActivation = () => {
        if (settled) {
          if (!lateActivationReloadAllowed) {
            return;
          }

          lateActivationReloadAllowed = false;
          cleanup();
          void requestExternalReloadPersistence();
          return;
        }

        finishActivation();
      };

      const handleControllerChange = () => {
        handleConfirmedActivation();
      };

      const handleStateChange = () => {
        if (worker.state === 'activated') {
          handleConfirmedActivation();
        } else if (worker.state === 'redundant') {
          if (settled) {
            lateActivationReloadAllowed = false;
            cleanup();
            return;
          }

          settled = true;
          activationRequested = false;
          lateActivationReloadAllowed = false;
          cleanup();
          reject(new Error('Service worker became redundant'));
        }
      };

      const timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        activationRequested = false;
        lateActivationReloadAllowed = true;
        if (resolveActivation === finishActivation) {
          resolveActivation = null;
        }
        reject(createTimeoutError('Service worker activation'));
      }, dependencies.workerActivationTimeoutMs);

      resolveActivation = finishActivation;
      cleanupActivationListeners = cleanup;
      serviceWorkerContainer.addEventListener(
        'controllerchange',
        handleControllerChange
      );
      worker.addEventListener('statechange', handleStateChange);

      try {
        worker.postMessage({
          type: 'SKIP_WAITING',
          persistenceFlushed: true,
          protocolVersion: 1
        });
        if (worker.state === 'activated') {
          finishActivation();
        }
      } catch (error) {
        settled = true;
        activationRequested = false;
        lateActivationReloadAllowed = false;
        cleanup();
        reject(error);
      }
    });
  }

  async function performInstall(): Promise<void> {
    if (!dependencies.isOnline()) {
      setError('offline');
      return;
    }

    let worker = resolveWaitingWorker();
    if (!worker) {
      await checkForUpdate();
      worker = resolveWaitingWorker();
    }

    if (!worker) {
      if (status !== 'up-to-date') {
        setError('check');
      }
      return;
    }

    notificationVisible = false;
    status = 'saving';
    errorKind = null;

    try {
      await withTimeout(
        dependencies.flushPersistence(),
        dependencies.persistenceFlushTimeoutMs,
        'Project persistence flush'
      );

      if (dependencies.isPersistenceDirty()) {
        throw new Error('Project persistence is still dirty');
      }
    } catch (error) {
      setError('save', error);
      return;
    }

    if (!dependencies.isOnline()) {
      setError('offline');
      return;
    }

    status = 'installing';

    try {
      await activateWaitingWorker(worker);
    } catch (error) {
      setError('activation', error);
    }
  }

  function installUpdate(): Promise<void> {
    if (installPromise) {
      return installPromise;
    }

    installPromise = performInstall().finally(() => {
      installPromise = null;
    });

    return installPromise;
  }

  function runPrimaryAction(): Promise<void> {
    if (externalActivationPending) {
      return requestExternalReloadPersistence();
    }

    if (errorKind === 'registration') {
      return requestExternalReloadPersistence();
    }

    if (resolveWaitingWorker()) {
      return installUpdate();
    }

    return checkForUpdate();
  }

  return {
    get status(): PwaUpdateStatus {
      return status;
    },
    get errorKind(): PwaUpdateErrorKind | null {
      return errorKind;
    },
    get notificationVisible(): boolean {
      return notificationVisible;
    },
    setRegistration,
    disconnect,
    reportRegistrationError,
    markUpdateAvailable,
    dismissNotification,
    checkForUpdate,
    installUpdate,
    runPrimaryAction,
    handleActivationSignal
  };
}

export const pwaUpdateService = createPwaUpdateService();
