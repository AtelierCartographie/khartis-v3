import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { tableFromArrays, tableToIPC } from 'apache-arrow';
import { describe, expect, it, vi } from 'vitest';
import { executeQueryStreaming } from '$lib/features/duckdb/core/query';
import type { DuckDBStreamingBindings } from '$lib/features/duckdb/types';
import { DuckDBError } from '$lib/features/commons/pipeline.errors';

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
  it('throws a DuckDBError when the worker detaches before the header arrives', async () => {
    const bindings: DuckDBStreamingBindings = {
      runQuery: vi.fn().mockResolvedValue(new Uint8Array()),
      startPendingQuery: vi.fn().mockResolvedValueOnce(null),
      pollPendingQuery: vi.fn(),
      fetchQueryResults: vi.fn(),
      cancelPendingQuery: vi.fn().mockResolvedValue(false),
      isDetached: vi.fn().mockReturnValue(true)
    };

    const request = executeQueryStreaming(
      createConnection(bindings),
      'SELECT * FROM dataset'
    );

    await expect(request).rejects.toMatchObject({
      name: 'DuckDBError',
      code: 'DUCKDB_ERROR',
      query: 'SELECT * FROM dataset',
      details: {
        query: 'SELECT * FROM dataset'
      }
    });
    await expect(request).rejects.toBeInstanceOf(DuckDBError);
  });

  it('throws a DuckDBError when the worker detaches while fetching results', async () => {
    const streamedBuffer = toIpcBuffer(
      tableFromArrays({
        value: [1]
      })
    );
    const bindings: DuckDBStreamingBindings = {
      runQuery: vi.fn().mockResolvedValue(new Uint8Array()),
      startPendingQuery: vi.fn().mockResolvedValueOnce(streamedBuffer),
      pollPendingQuery: vi.fn(),
      fetchQueryResults: vi.fn().mockResolvedValueOnce(null),
      cancelPendingQuery: vi.fn().mockResolvedValue(false),
      isDetached: vi.fn().mockReturnValue(true)
    };

    await expect(
      executeQueryStreaming(createConnection(bindings), 'SELECT * FROM dataset')
    ).rejects.toBeInstanceOf(DuckDBError);
  });

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

  it('returns the schema-only stream without re-running the query when the result is empty', async () => {
    const emptyValues: number[] = [];
    const schemaOnlyBuffer = toIpcBuffer(
      tableFromArrays({
        value: emptyValues
      })
    );

    const bindings: DuckDBStreamingBindings = {
      runQuery: vi.fn(),
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

    expect([...result]).toEqual([...schemaOnlyBuffer]);
    expect(bindings.runQuery).not.toHaveBeenCalled();
  });

  it('cancels the pending query and throws an AbortError when the signal aborts during polling', async () => {
    const abortController = new AbortController();
    const bindings: DuckDBStreamingBindings = {
      runQuery: vi.fn(),
      startPendingQuery: vi.fn().mockResolvedValue(null),
      pollPendingQuery: vi.fn().mockImplementation(async () => {
        abortController.abort();
        return null;
      }),
      fetchQueryResults: vi.fn(),
      cancelPendingQuery: vi.fn().mockResolvedValue(true),
      isDetached: vi.fn().mockReturnValue(false)
    };

    const request = executeQueryStreaming(
      createConnection(bindings),
      'SELECT * FROM dataset',
      { signal: abortController.signal }
    );

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(bindings.cancelPendingQuery).toHaveBeenCalledWith('connection-id');
    expect(bindings.runQuery).not.toHaveBeenCalled();
  });

  it('throws an AbortError without starting the query when the signal is already aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();

    const bindings: DuckDBStreamingBindings = {
      runQuery: vi.fn(),
      startPendingQuery: vi.fn(),
      pollPendingQuery: vi.fn(),
      fetchQueryResults: vi.fn(),
      cancelPendingQuery: vi.fn(),
      isDetached: vi.fn().mockReturnValue(false)
    };

    await expect(
      executeQueryStreaming(createConnection(bindings), 'SELECT 1', {
        signal: abortController.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(bindings.startPendingQuery).not.toHaveBeenCalled();
    expect(bindings.cancelPendingQuery).not.toHaveBeenCalled();
  });
});
