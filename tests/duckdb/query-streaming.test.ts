import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { tableFromArrays, tableToIPC } from 'apache-arrow';
import { describe, expect, it, vi } from 'vitest';
import { executeQueryStreaming } from '$lib/features/duckdb/core/query';
import type { DuckDBStreamingBindings } from '$lib/features/duckdb/types';

function toIpcBuffer(table: ReturnType<typeof tableFromArrays>): Uint8Array {
  const ipc = tableToIPC(table);
  return ipc instanceof Uint8Array ? ipc : new Uint8Array(ipc);
}

function createConnection(bindings: DuckDBStreamingBindings) {
  return {
    useUnsafe<R>(
      callback: (bindings: DuckDBStreamingBindings, conn: unknown) => R
    ): R {
      return callback(bindings, 'connection-id');
    }
  } as AsyncDuckDBConnection;
}

describe('executeQueryStreaming', () => {
  it('waits for pending headers and result batches before ending the stream', async () => {
    const streamedBuffer = toIpcBuffer(
      tableFromArrays({
        value: [1]
      })
    );
    const splitIndex = Math.floor(streamedBuffer.byteLength / 2);
    const headerChunk = streamedBuffer.slice(0, splitIndex);
    const resultChunk = streamedBuffer.slice(splitIndex);

    const bindings: DuckDBStreamingBindings = {
      runQuery: vi.fn().mockResolvedValue(new Uint8Array()),
      startPendingQuery: vi.fn().mockResolvedValueOnce(null),
      pollPendingQuery: vi.fn().mockResolvedValueOnce(headerChunk),
      fetchQueryResults: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(resultChunk)
        .mockResolvedValueOnce(new Uint8Array()),
      cancelPendingQuery: vi.fn().mockResolvedValue(false),
      isDetached: vi.fn().mockReturnValue(false)
    };

    const result = await executeQueryStreaming(
      createConnection(bindings),
      'SELECT * FROM dataset'
    );

    expect([...result]).toEqual([...streamedBuffer]);
    expect(bindings.pollPendingQuery).toHaveBeenCalledWith('connection-id');
    expect(bindings.fetchQueryResults).toHaveBeenCalledTimes(3);
    expect(bindings.runQuery).not.toHaveBeenCalled();
  });

  it('falls back to a buffered query when streaming returns only the schema', async () => {
    const emptyValues: number[] = [];
    const schemaOnlyBuffer = toIpcBuffer(
      tableFromArrays({
        value: emptyValues
      })
    );
    const fallbackBuffer = toIpcBuffer(
      tableFromArrays({
        value: [1]
      })
    );

    const bindings: DuckDBStreamingBindings = {
      runQuery: vi.fn().mockResolvedValue(fallbackBuffer),
      startPendingQuery: vi.fn().mockResolvedValueOnce(schemaOnlyBuffer),
      pollPendingQuery: vi.fn(),
      fetchQueryResults: vi.fn().mockResolvedValueOnce(new Uint8Array()),
      cancelPendingQuery: vi.fn().mockResolvedValue(false),
      isDetached: vi.fn().mockReturnValue(false)
    };

    const result = await executeQueryStreaming(
      createConnection(bindings),
      'SELECT * FROM dataset'
    );

    expect([...result]).toEqual([...fallbackBuffer]);
    expect(bindings.runQuery).toHaveBeenCalledWith(
      'connection-id',
      'SELECT * FROM dataset'
    );
  });
});
