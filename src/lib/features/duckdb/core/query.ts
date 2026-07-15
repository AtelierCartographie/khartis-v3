import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { tableFromIPC } from '@uwdata/flechette';
import { DuckDBError } from '$lib/features/commons/pipeline.errors';
import * as m from '$lib/paraglide/messages';
import { DUCK_CONST } from '../constants';
import type {
  DuckDBStreamingBindings,
  DuckDBUnsafeBindings,
  QueryOptions
} from '../types';

/**
 * Executes a SQL query and returns the result in the specified format.
 * Default format is an Arrow table (via @uwdata/flechette IPC conversion).
 *
 * @param connection - The DuckDB connection to use.
 * @param query - The SQL query to execute.
 * @param options.format - Result format: 'arrow-table' (default), 'arrow-ipc', or 'array'.
 * @param options.useProxy - Whether to use Proxy objects for performance optimization (default true).
 * @returns The query result in the specified format.
 */
export async function executeQuery(
  connection: AsyncDuckDBConnection,
  query: string,
  options: QueryOptions = {}
): Promise<unknown> {
  const { format = DUCK_CONST.QUERY_FORMAT.ARROW_TABLE, useProxy = true } =
    options;

  let buffer: Uint8Array | ArrayBuffer;
  try {
    buffer = await connection.useUnsafe(
      async (bindings: DuckDBUnsafeBindings, conn: unknown) => {
        return await bindings.runQuery(conn, query);
      }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : m.error_unknown_duckdb();
    const truncatedQuery =
      query.length > 200 ? query.substring(0, 200) + '...' : query;
    throw new DuckDBError(
      m.error_query_execution_failed({ message }),
      truncatedQuery,
      {
        originalError: error instanceof Error ? error.name : String(error)
      }
    );
  }

  if (format === DUCK_CONST.QUERY_FORMAT.ARROW_IPC) {
    return buffer;
  }

  return materializeIpcBuffer(buffer, format, useProxy);
}

function materializeIpcBuffer(
  buffer: Uint8Array | ArrayBuffer,
  format: QueryOptions['format'],
  useProxy: boolean
): unknown {
  const table = tableFromIPC(buffer, {
    useBigInt: true,
    useDate: true,
    useDecimalInt: false,
    useMap: true,
    useProxy
  });

  if (format === DUCK_CONST.QUERY_FORMAT.ARRAY) {
    return table.toArray();
  }

  return table;
}

export function isQueryAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function createQueryAbortError(): DOMException {
  return new DOMException('DuckDB query aborted', 'AbortError');
}

/**
 * Executes a query on the cancellable pending-query path: when the signal
 * aborts mid-execution, the worker-side query is cancelled via
 * cancelPendingQuery instead of running to completion.
 */
export async function executeCancellableQuery(
  connection: AsyncDuckDBConnection,
  query: string,
  options: QueryOptions & { signal?: AbortSignal } = {}
): Promise<unknown> {
  const {
    signal,
    format = DUCK_CONST.QUERY_FORMAT.ARROW_TABLE,
    useProxy = true
  } = options;

  const buffer = await executeQueryStreaming(connection, query, { signal });

  if (format === DUCK_CONST.QUERY_FORMAT.ARROW_IPC) {
    return buffer;
  }

  return materializeIpcBuffer(buffer, format, useProxy);
}

/**
 * Executes a SQL query in streaming mode, collecting IPC chunks incrementally.
 * Reduces peak memory compared to executeQuery() for large result sets.
 *
 * Returns a single concatenated IPC buffer (Uint8Array). The caller converts
 * it to an Arrow table with tableFromIPC as needed.
 *
 * This is opt-in — use only for queries known to return large datasets
 * (e.g., full table exports with geometry columns).
 */
export async function executeQueryStreaming(
  connection: AsyncDuckDBConnection,
  query: string,
  options: { signal?: AbortSignal } = {}
): Promise<Uint8Array> {
  const { signal } = options;
  try {
    if (signal?.aborted) {
      throw createQueryAbortError();
    }

    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    await connection.useUnsafe(
      async (bindings: DuckDBStreamingBindings, conn: unknown) => {
        const cancelIfAborted = async (): Promise<void> => {
          if (!signal?.aborted) return;
          await bindings.cancelPendingQuery(conn);
          throw createQueryAbortError();
        };

        let header = await bindings.startPendingQuery(conn, query, true);
        while (header === null) {
          if (bindings.isDetached?.()) {
            throw new DuckDBError(m.error_worker_detached_query(), query);
          }
          await cancelIfAborted();
          header = await bindings.pollPendingQuery(conn);
        }

        if (header && header.byteLength > 0) {
          const chunk = new Uint8Array(header);
          chunks.push(chunk);
          totalLength += chunk.byteLength;
        }

        // Collect result batches until exhausted
        while (true) {
          let result = await bindings.fetchQueryResults(conn);
          while (result === null) {
            if (bindings.isDetached?.()) {
              throw new DuckDBError(m.error_worker_detached_results(), query);
            }
            await cancelIfAborted();
            result = await bindings.fetchQueryResults(conn);
          }

          if (result.byteLength === 0) break;
          const chunk = new Uint8Array(result);
          chunks.push(chunk);
          totalLength += chunk.byteLength;
        }
      }
    );

    if (chunks.length === 1) {
      return chunks[0];
    }

    if (totalLength === 0) {
      throw new Error('Streaming query returned an empty IPC stream');
    }

    // Concatenate IPC chunks into a single contiguous buffer
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return combined;
  } catch (error) {
    if (isQueryAbortError(error)) {
      throw error;
    }
    const message =
      error instanceof Error ? error.message : m.error_unknown_duckdb();
    const truncatedQuery =
      query.length > 200 ? query.substring(0, 200) + '...' : query;
    throw new DuckDBError(
      m.error_streaming_query_failed({ message }),
      truncatedQuery,
      { originalError: error instanceof Error ? error.name : String(error) }
    );
  }
}
