import { tableToIPC, type Table as ArrowTable } from 'apache-arrow/Arrow';
import { createParseWorkerClient } from '@ateliercartographie/geoarrow-deck-stream/worker';
import type {
  ParseWorkerClient,
  WorkerLike
} from '@ateliercartographie/geoarrow-deck-stream/worker';

import { LogCategory, logger } from '$lib/features/commons/utils/logger';

const state = $state({ version: 0 });

export const WORKER_PARSE_TIMEOUT_MS = 30_000;

export function trackWorkerParseVersion(): number {
  return state.version;
}

export function bumpWorkerParseVersion(): void {
  state.version += 1;
}

let client: ParseWorkerClient | null = null;
let activeWorker: Worker | null = null;
let workerUnavailable = false;

export function disableParseWorker(error: unknown): void {
  if (workerUnavailable) return;

  workerUnavailable = true;
  const currentClient = client;
  const currentWorker = activeWorker;
  client = null;
  activeWorker = null;

  if (currentClient) {
    currentClient.terminate();
  } else {
    currentWorker?.terminate();
  }

  bumpWorkerParseVersion();
  logger.error(
    'GeoArrow parse worker disabled; falling back to main-thread parsing',
    LogCategory.MAP,
    error
  );
}

export function getParseWorkerClient(): ParseWorkerClient | null {
  if (workerUnavailable) return null;
  try {
    if (localStorage.getItem('khartis:disable-parse-worker')) return null;
  } catch {
    /* storage unavailable: keep worker enabled */
  }
  if (client) return client;
  if (typeof Worker === 'undefined') {
    workerUnavailable = true;
    return null;
  }
  try {
    const worker = new Worker(
      new URL('../workers/geoarrow-parse.worker.ts', import.meta.url),
      { type: 'module' }
    );
    activeWorker = worker;
    worker.addEventListener('error', (event) => {
      disableParseWorker(
        event.error ??
          new Error(event.message || 'GeoArrow parse worker crashed')
      );
    });
    client = createParseWorkerClient(worker as unknown as WorkerLike);
  } catch (error) {
    disableParseWorker(error);
  }
  return client;
}

export function withParseWorkerTimeout<T>(
  request: Promise<T>,
  method: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(
        `GeoArrow parse worker timed out after ${WORKER_PARSE_TIMEOUT_MS}ms (${method})`
      );
      reject(error);
      disableParseWorker(error);
    }, WORKER_PARSE_TIMEOUT_MS);
  });

  return Promise.race([request, timeout]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

const ipcCache = new WeakMap<ArrowTable, Uint8Array>();

export function ipcBytesForTable(table: ArrowTable): Uint8Array {
  let bytes = ipcCache.get(table);
  if (!bytes) {
    bytes = tableToIPC(table);
    ipcCache.set(table, bytes);
  }
  return bytes;
}
