import { describe, expect, it, vi } from 'vitest';
import { createPwaUpdateService } from './pwa-update.service.svelte';

class FakeServiceWorker extends EventTarget {
  state: ServiceWorkerState = 'installed';

  readonly messages: unknown[] = [];

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  setState(state: ServiceWorkerState): void {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeServiceWorkerRegistration extends EventTarget {
  readonly scope = 'https://example.org/cartographie/khartis/';

  installing: ServiceWorker | null = null;

  waiting: ServiceWorker | null = null;

  updateHandler: () => Promise<void> = async () => {};

  async update(): Promise<ServiceWorkerRegistration> {
    await this.updateHandler();
    return this as unknown as ServiceWorkerRegistration;
  }
}

class FakeServiceWorkerContainer extends EventTarget {
  controller: ServiceWorker | null = null;
}

function toServiceWorker(worker: FakeServiceWorker): ServiceWorker {
  return worker as unknown as ServiceWorker;
}

function toRegistration(
  registration: FakeServiceWorkerRegistration
): ServiceWorkerRegistration {
  return registration as unknown as ServiceWorkerRegistration;
}

function toContainer(
  container: FakeServiceWorkerContainer
): ServiceWorkerContainer {
  return container as unknown as ServiceWorkerContainer;
}

function createTestService(
  options: {
    container?: FakeServiceWorkerContainer;
    flushPersistence?: () => Promise<void>;
    isPersistenceDirty?: () => boolean;
    isOnline?: () => boolean;
    reload?: () => void;
    clearRuntime?: () => Promise<void>;
    updateCheckTimeoutMs?: number;
    workerInstallTimeoutMs?: number;
    persistenceFlushTimeoutMs?: number;
    workerActivationTimeoutMs?: number;
    runtimeRefreshTimeoutMs?: number;
  } = {}
) {
  const container = options.container ?? new FakeServiceWorkerContainer();

  return createPwaUpdateService({
    flushPersistence: options.flushPersistence ?? (async () => {}),
    isPersistenceDirty: options.isPersistenceDirty ?? (() => false),
    getServiceWorkerContainer: () => toContainer(container),
    isOnline: options.isOnline ?? (() => true),
    reload: options.reload ?? (() => {}),
    clearRuntime: options.clearRuntime ?? (async () => {}),
    updateCheckTimeoutMs: options.updateCheckTimeoutMs ?? 25,
    workerInstallTimeoutMs: options.workerInstallTimeoutMs ?? 25,
    persistenceFlushTimeoutMs: options.persistenceFlushTimeoutMs ?? 25,
    workerActivationTimeoutMs: options.workerActivationTimeoutMs ?? 500,
    runtimeRefreshTimeoutMs: options.runtimeRefreshTimeoutMs ?? 25
  });
}

describe('pwaUpdateService', () => {
  it('should report the app as up to date when the registration finds no worker', async () => {
    const registration = new FakeServiceWorkerRegistration();
    const updateSpy = vi.spyOn(registration, 'update');
    const service = createTestService();
    service.setRegistration(toRegistration(registration));

    await service.checkForUpdate();

    expect(updateSpy).toHaveBeenCalledOnce();
    expect(service.status).toBe('up-to-date');
    expect(service.errorKind).toBeNull();
  });

  it('should expose an available update when a worker is already waiting', async () => {
    const worker = new FakeServiceWorker();
    const registration = new FakeServiceWorkerRegistration();
    registration.waiting = toServiceWorker(worker);
    const updateSpy = vi.spyOn(registration, 'update');
    const service = createTestService();
    service.setRegistration(toRegistration(registration));

    await service.checkForUpdate();

    expect(updateSpy).not.toHaveBeenCalled();
    expect(service.status).toBe('available');
    expect(service.notificationVisible).toBe(true);
  });

  it('should wait for the installing worker captured by updatefound', async () => {
    const worker = new FakeServiceWorker();
    worker.state = 'installing';
    const registration = new FakeServiceWorkerRegistration();
    registration.updateHandler = async () => {
      registration.installing = toServiceWorker(worker);
      registration.dispatchEvent(new Event('updatefound'));
      registration.installing = null;
    };
    const service = createTestService();
    service.setRegistration(toRegistration(registration));

    const checkPromise = service.checkForUpdate();
    await vi.waitFor(() => expect(service.status).toBe('checking'));

    registration.waiting = toServiceWorker(worker);
    worker.setState('installed');
    await checkPromise;

    expect(service.status).toBe('available');
    expect(service.notificationVisible).toBe(true);
  });

  it('should keep the update waiting when project persistence remains dirty', async () => {
    const worker = new FakeServiceWorker();
    const registration = new FakeServiceWorkerRegistration();
    registration.waiting = toServiceWorker(worker);
    const flushPersistence = vi.fn().mockResolvedValue(undefined);
    const service = createTestService({
      flushPersistence,
      isPersistenceDirty: () => true
    });
    service.setRegistration(toRegistration(registration));

    await service.installUpdate();

    expect(flushPersistence).toHaveBeenCalledOnce();
    expect(worker.messages).toEqual([]);
    expect(service.status).toBe('error');
    expect(service.errorKind).toBe('save');
  });

  it('should keep a waiting update inactive while the browser is offline', async () => {
    const worker = new FakeServiceWorker();
    const registration = new FakeServiceWorkerRegistration();
    registration.waiting = toServiceWorker(worker);
    const flushPersistence = vi.fn().mockResolvedValue(undefined);
    const service = createTestService({
      flushPersistence,
      isOnline: () => false
    });
    service.setRegistration(toRegistration(registration));

    await service.installUpdate();

    expect(flushPersistence).not.toHaveBeenCalled();
    expect(worker.messages).toEqual([]);
    expect(service.status).toBe('error');
    expect(service.errorKind).toBe('offline');
  });

  it('should stop activation when connectivity is lost during the save', async () => {
    const worker = new FakeServiceWorker();
    const registration = new FakeServiceWorkerRegistration();
    registration.waiting = toServiceWorker(worker);
    let online = true;
    const service = createTestService({
      flushPersistence: async () => {
        online = false;
      },
      isOnline: () => online
    });
    service.setRegistration(toRegistration(registration));

    await service.installUpdate();

    expect(worker.messages).toEqual([]);
    expect(service.status).toBe('error');
    expect(service.errorKind).toBe('offline');
  });

  it('should wait for a confirmed controller change after the activation timeout', async () => {
    const worker = new FakeServiceWorker();
    const registration = new FakeServiceWorkerRegistration();
    registration.waiting = toServiceWorker(worker);
    const container = new FakeServiceWorkerContainer();
    const reload = vi.fn();
    const flushPersistence = vi.fn().mockResolvedValue(undefined);
    const service = createTestService({
      container,
      flushPersistence,
      reload,
      workerActivationTimeoutMs: 5
    });
    service.setRegistration(toRegistration(registration));

    await service.installUpdate();

    expect(service.status).toBe('error');
    expect(service.errorKind).toBe('activation');
    expect(reload).not.toHaveBeenCalled();

    container.dispatchEvent(new Event('controllerchange'));
    worker.setState('activated');

    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(flushPersistence).toHaveBeenCalledTimes(2);
  });

  it('should reload once when Workbox confirms a late activation', async () => {
    const worker = new FakeServiceWorker();
    const registration = new FakeServiceWorkerRegistration();
    registration.waiting = toServiceWorker(worker);
    const reload = vi.fn();
    const flushPersistence = vi.fn().mockResolvedValue(undefined);
    const service = createTestService({
      flushPersistence,
      reload,
      workerActivationTimeoutMs: 5
    });
    service.setRegistration(toRegistration(registration));

    await service.installUpdate();
    expect(reload).not.toHaveBeenCalled();

    service.handleActivationSignal();
    service.handleActivationSignal();

    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(flushPersistence).toHaveBeenCalledTimes(2);
  });

  it('should save this tab before reloading after another tab activates the update', async () => {
    const order: string[] = [];
    const reload = vi.fn(() => {
      order.push('reload');
    });
    const service = createTestService({
      flushPersistence: async () => {
        order.push('flush');
      },
      reload
    });

    service.handleActivationSignal();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());

    expect(order).toEqual(['flush', 'reload']);
  });

  it('should keep this tab open when its project cannot be saved after an external activation', async () => {
    const reload = vi.fn();
    let dirty = true;
    const flushPersistence = vi.fn().mockResolvedValue(undefined);
    const service = createTestService({
      flushPersistence,
      isPersistenceDirty: () => dirty,
      reload
    });

    service.handleActivationSignal();
    await vi.waitFor(() => expect(service.status).toBe('error'));

    expect(service.errorKind).toBe('save');
    expect(reload).not.toHaveBeenCalled();

    dirty = false;
    await service.runPrimaryAction();

    expect(flushPersistence).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('should save and reload when retrying a transient registration error', async () => {
    const order: string[] = [];
    const service = createTestService({
      flushPersistence: async () => {
        order.push('flush');
      },
      reload: () => {
        order.push('reload');
      }
    });

    service.reportRegistrationError(new Error('Temporary registration error'));
    await service.runPrimaryAction();

    expect(order).toEqual(['flush', 'reload']);
  });

  it('should send SKIP_WAITING only after project persistence is flushed', async () => {
    const order: string[] = [];
    const worker = new FakeServiceWorker();
    worker.postMessage = (message: unknown) => {
      order.push('message');
      worker.messages.push(message);
    };
    const registration = new FakeServiceWorkerRegistration();
    registration.waiting = toServiceWorker(worker);
    const container = new FakeServiceWorkerContainer();
    const reload = vi.fn();
    const service = createTestService({
      container,
      flushPersistence: async () => {
        order.push('flush');
      },
      reload
    });
    service.setRegistration(toRegistration(registration));

    const installPromise = service.installUpdate();
    await vi.waitFor(() => expect(service.status).toBe('installing'));

    expect(order).toEqual(['flush', 'message']);
    expect(worker.messages).toEqual([
      {
        type: 'SKIP_WAITING',
        persistenceFlushed: true,
        protocolVersion: 1
      }
    ]);

    container.dispatchEvent(new Event('controllerchange'));
    worker.setState('activated');
    await installPromise;

    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(order).toEqual(['flush', 'message', 'flush']);
  });

  it('should reload once when Safari only reports the worker activation state', async () => {
    const worker = new FakeServiceWorker();
    const registration = new FakeServiceWorkerRegistration();
    registration.waiting = toServiceWorker(worker);
    const container = new FakeServiceWorkerContainer();
    const reload = vi.fn();
    const service = createTestService({ container, reload });
    service.setRegistration(toRegistration(registration));

    const installPromise = service.installUpdate();
    await vi.waitFor(() => expect(service.status).toBe('installing'));

    worker.setState('activated');
    await installPromise;
    container.dispatchEvent(new Event('controllerchange'));

    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });

  it('should stop before activation when the persistence flush times out', async () => {
    const worker = new FakeServiceWorker();
    const registration = new FakeServiceWorkerRegistration();
    registration.waiting = toServiceWorker(worker);
    const service = createTestService({
      flushPersistence: () => new Promise<void>(() => {}),
      persistenceFlushTimeoutMs: 5
    });
    service.setRegistration(toRegistration(registration));

    await service.installUpdate();

    expect(worker.messages).toEqual([]);
    expect(service.status).toBe('error');
    expect(service.errorKind).toBe('save');
  });

  it('should refresh the runtime and reload when the full flow finds no update', async () => {
    const registration = new FakeServiceWorkerRegistration();
    const clearRuntime = vi.fn(async () => {});
    const reload = vi.fn();
    const service = createTestService({ clearRuntime, reload });
    service.setRegistration(toRegistration(registration));

    await service.runFullUpdateFlow();

    expect(clearRuntime).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('should refresh the runtime and reload when no registration is available', async () => {
    const clearRuntime = vi.fn(async () => {});
    const reload = vi.fn();
    const service = createTestService({ clearRuntime, reload });

    await service.runFullUpdateFlow();

    expect(clearRuntime).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('should refresh the runtime and reload when the update check times out', async () => {
    const registration = new FakeServiceWorkerRegistration();
    registration.updateHandler = () => new Promise(() => {});
    const clearRuntime = vi.fn(async () => {});
    const reload = vi.fn();
    const service = createTestService({ clearRuntime, reload });
    service.setRegistration(toRegistration(registration));

    await service.runFullUpdateFlow();

    expect(clearRuntime).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('should still reload when the runtime refresh itself fails', async () => {
    const registration = new FakeServiceWorkerRegistration();
    const clearRuntime = vi.fn(async () => {
      throw new Error('cache clear failed');
    });
    const reload = vi.fn();
    const service = createTestService({ clearRuntime, reload });
    service.setRegistration(toRegistration(registration));

    await service.runFullUpdateFlow();

    expect(clearRuntime).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('should not refresh the runtime while the browser is offline', async () => {
    const registration = new FakeServiceWorkerRegistration();
    const clearRuntime = vi.fn(async () => {});
    const reload = vi.fn();
    const service = createTestService({
      clearRuntime,
      reload,
      isOnline: () => false
    });
    service.setRegistration(toRegistration(registration));

    await service.runFullUpdateFlow();

    expect(clearRuntime).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(service.status).toBe('error');
    expect(service.errorKind).toBe('offline');
  });

  it('should not refresh the runtime when the project cannot be saved', async () => {
    const registration = new FakeServiceWorkerRegistration();
    const clearRuntime = vi.fn(async () => {});
    const reload = vi.fn();
    const service = createTestService({
      clearRuntime,
      reload,
      isPersistenceDirty: () => true
    });
    service.setRegistration(toRegistration(registration));

    await service.runFullUpdateFlow();

    expect(clearRuntime).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(service.status).toBe('error');
    expect(service.errorKind).toBe('save');
  });

  it('should install the waiting update without refreshing the runtime', async () => {
    const worker = new FakeServiceWorker();
    const registration = new FakeServiceWorkerRegistration();
    registration.waiting = toServiceWorker(worker);
    const clearRuntime = vi.fn(async () => {});
    const reload = vi.fn();
    const service = createTestService({ clearRuntime, reload });
    service.setRegistration(toRegistration(registration));

    const flowPromise = service.runFullUpdateFlow();
    await vi.waitFor(() => expect(worker.messages.length).toBe(1));
    worker.setState('activated');
    await flowPromise;

    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(clearRuntime).not.toHaveBeenCalled();
    expect(worker.messages[0]).toMatchObject({ type: 'SKIP_WAITING' });
  });

  it('should leave the checking state when registration update times out', async () => {
    const registration = new FakeServiceWorkerRegistration();
    registration.updateHandler = () => new Promise<void>(() => {});
    const service = createTestService({ updateCheckTimeoutMs: 5 });
    service.setRegistration(toRegistration(registration));

    await service.checkForUpdate();

    expect(service.status).toBe('error');
    expect(service.errorKind).toBe('check');
  });
});
