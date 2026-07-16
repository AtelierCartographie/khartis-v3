import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ParseWorkerClient,
  WorkerLike
} from '@ateliercartographie/geoarrow-deck-stream/worker';

const mocks = vi.hoisted(() => ({
  createParseWorkerClient: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('@ateliercartographie/geoarrow-deck-stream/worker', () => ({
  createParseWorkerClient: mocks.createParseWorkerClient
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: { MAP: 'map' },
  logger: { error: mocks.loggerError }
}));

class FakeWorker implements WorkerLike {
  static latest: FakeWorker | null = null;

  readonly terminate = vi.fn();

  private readonly listeners = new Map<
    string,
    Set<(event: ErrorEvent) => void>
  >();

  constructor() {
    FakeWorker.latest = this;
  }

  postMessage(): void {}

  addEventListener(type: string, listener: (event: never) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener as (event: ErrorEvent) => void);
    this.listeners.set(type, listeners);
  }

  emitError(message: string): void {
    const event = new ErrorEvent('error', {
      error: new Error(message),
      message
    });
    for (const listener of this.listeners.get('error') ?? []) {
      listener(event);
    }
  }
}

function createClient(): ParseWorkerClient {
  return {
    parseGeometry: vi.fn(),
    parsePolygonsToSolid: vi.fn(),
    parsePoints: vi.fn(),
    parseSphere: vi.fn(),
    insetBorders: vi.fn(),
    terminate: vi.fn()
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
  localStorage.clear();
  FakeWorker.latest = null;
  mocks.createParseWorkerClient.mockReset();
  mocks.loggerError.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GeoArrow parse worker lifecycle', () => {
  it('should disable the cached client when the worker crashes', async () => {
    const client = createClient();
    mocks.createParseWorkerClient.mockReturnValue(client);
    const workerParse = await import('./worker-parse.svelte');

    expect(workerParse.getParseWorkerClient()).toBe(client);
    FakeWorker.latest?.emitError('worker crashed');

    expect(client.terminate).toHaveBeenCalledOnce();
    expect(workerParse.getParseWorkerClient()).toBeNull();
    expect(workerParse.trackWorkerParseVersion()).toBe(1);
  });

  it('should terminate and disable the worker when a parse request times out', async () => {
    const client = createClient();
    mocks.createParseWorkerClient.mockReturnValue(client);
    const workerParse = await import('./worker-parse.svelte');
    workerParse.getParseWorkerClient();

    const pending = workerParse.withParseWorkerTimeout(
      new Promise<never>(() => {}),
      'parseGeometry'
    );
    const rejection = expect(pending).rejects.toThrow(
      'GeoArrow parse worker timed out'
    );

    await vi.advanceTimersByTimeAsync(workerParse.WORKER_PARSE_TIMEOUT_MS);
    await rejection;

    expect(client.terminate).toHaveBeenCalledOnce();
    expect(workerParse.getParseWorkerClient()).toBeNull();
  });

  it('should keep a healthy worker available when a request completes', async () => {
    const client = createClient();
    mocks.createParseWorkerClient.mockReturnValue(client);
    const workerParse = await import('./worker-parse.svelte');

    expect(workerParse.getParseWorkerClient()).toBe(client);
    await expect(
      workerParse.withParseWorkerTimeout(
        Promise.resolve('parsed'),
        'parseGeometry'
      )
    ).resolves.toBe('parsed');
    await vi.runAllTimersAsync();

    expect(client.terminate).not.toHaveBeenCalled();
    expect(workerParse.getParseWorkerClient()).toBe(client);
  });
});
