import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  localforageGetItem: vi.fn<(key: string) => Promise<string | null>>(),
  localforageRemoveItem: vi.fn<(key: string) => Promise<void>>(),
  loggerError: vi.fn()
}));

vi.mock('localforage', () => ({
  default: {
    getItem: mocks.localforageGetItem,
    removeItem: mocks.localforageRemoveItem
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: {
    error: mocks.loggerError
  },
  LogCategory: {
    PERSISTENCE: 'PERSISTENCE'
  }
}));

vi.mock('$lib/paraglide/messages', () => ({
  m: {
    error_failed_open_indexeddb: () => 'Failed to open IndexedDB',
    error_storage_load_failed: () => 'Failed to load storage'
  }
}));

interface ControlledOpenRequest {
  result: IDBDatabase;
  error: DOMException | null;
  onblocked: (() => void) | null;
  onerror: (() => void) | null;
  onsuccess: (() => void) | null;
  onupgradeneeded: ((event: { target: ControlledOpenRequest }) => void) | null;
}

function createDatabase() {
  const stores = new Set<string>();
  const close = vi.fn();
  const database = {
    close,
    createObjectStore: vi.fn((name: string) => {
      stores.add(name);
      return {
        createIndex: vi.fn()
      };
    }),
    objectStoreNames: {
      contains: (name: string) => stores.has(name)
    },
    onversionchange: null
  } as unknown as IDBDatabase;

  return { close, database };
}

function createOpenRequest(database: IDBDatabase): ControlledOpenRequest {
  return {
    result: database,
    error: null,
    onblocked: null,
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null
  };
}

function installIndexedDbRequests(
  requests: ControlledOpenRequest[]
): ReturnType<typeof vi.fn> {
  const open = vi.fn(() => {
    const request = requests.shift();
    if (!request) {
      throw new Error('Missing controlled IndexedDB request');
    }
    return request as unknown as IDBOpenDBRequest;
  });

  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    writable: true,
    value: { open }
  });

  return open;
}

describe('database access', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
    mocks.localforageGetItem.mockResolvedValue(null);
    mocks.localforageRemoveItem.mockResolvedValue();
  });

  it('should reject a blocked open and allow a later retry', async () => {
    const first = createDatabase();
    const second = createDatabase();
    const firstRequest = createOpenRequest(first.database);
    const secondRequest = createOpenRequest(second.database);
    const open = installIndexedDbRequests([firstRequest, secondRequest]);
    const { openDatabase } = await import('./database-access.service');

    const blockedOpen = openDatabase();
    const blockedExpectation = expect(blockedOpen).rejects.toThrow(
      'Failed to open IndexedDB'
    );
    firstRequest.onblocked?.();
    await blockedExpectation;

    firstRequest.onsuccess?.();
    expect(first.close).toHaveBeenCalledTimes(1);

    const retry = openDatabase();
    secondRequest.onupgradeneeded?.({ target: secondRequest });
    secondRequest.onsuccess?.();

    await expect(retry).resolves.toBe(second.database);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('should close a database that opens after the timeout', async () => {
    vi.useFakeTimers();
    const late = createDatabase();
    const lateRequest = createOpenRequest(late.database);
    installIndexedDbRequests([lateRequest]);
    const { openDatabase } = await import('./database-access.service');

    const pendingOpen = openDatabase();
    const timeoutExpectation = expect(pendingOpen).rejects.toThrow(
      'Failed to open IndexedDB'
    );

    await vi.advanceTimersByTimeAsync(10_000);
    await timeoutExpectation;

    lateRequest.onsuccess?.();
    expect(late.close).toHaveBeenCalledTimes(1);
  });

  it('should finish opening when legacy metadata migration stalls', async () => {
    vi.useFakeTimers();
    const current = createDatabase();
    const request = createOpenRequest(current.database);
    installIndexedDbRequests([request]);
    mocks.localforageGetItem.mockImplementation(
      () => new Promise<string | null>(() => {})
    );
    const { openDatabase } = await import('./database-access.service');

    const pendingOpen = openDatabase();
    request.onsuccess?.();
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(pendingOpen).resolves.toBe(current.database);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to migrate localforage project metadata',
      'PERSISTENCE',
      expect.objectContaining({
        message: 'Legacy project metadata migration timed out'
      })
    );
  });
});
