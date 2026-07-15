import { tableToIPC, type Table as ArrowTable } from 'apache-arrow/Arrow';
import { createParseWorkerClient } from '@ateliercartographie/geoarrow-deck-stream/worker';
import type {
  ParseWorkerClient,
  WorkerLike
} from '@ateliercartographie/geoarrow-deck-stream/worker';

import { LogCategory, logger } from '$lib/features/commons/utils/logger';

const state = $state({ version: 0 });

export function trackWorkerParseVersion(): number {
  return state.version;
}

export function bumpWorkerParseVersion(): void {
  state.version += 1;
}

let client: ParseWorkerClient | null = null;
let workerUnavailable = false;

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
    client = createParseWorkerClient(worker as unknown as WorkerLike);
  } catch (error) {
    workerUnavailable = true;
    logger.error(
      'GeoArrow parse worker unavailable; falling back to main-thread parsing',
      LogCategory.MAP,
      error
    );
  }
  return client;
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
