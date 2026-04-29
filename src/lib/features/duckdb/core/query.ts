import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { tableFromIPC } from '@uwdata/flechette';
import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
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

  const table = tableFromIPC(buffer, {
    useBigInt: true,
    useDate: true,
    useDecimalInt: false,
    useMap: true,
    useProxy
  });

  if (format === DUCK_CONST.QUERY_FORMAT.ARROW_TABLE) {
    return table;
  }

  if (format === DUCK_CONST.QUERY_FORMAT.ARRAY) {
    return table.toArray();
  }

  return table;
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
  query: string
): Promise<Uint8Array> {
  try {
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    await connection.useUnsafe(
      async (bindings: DuckDBStreamingBindings, conn: unknown) => {
        let header = await bindings.startPendingQuery(conn, query, true);
        while (header === null) {
          if (bindings.isDetached?.()) {
            throw new Error(m.error_worker_detached_query());
          }
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
              throw new Error(m.error_worker_detached_results());
            }
            result = await bindings.fetchQueryResults(conn);
          }

          if (result.byteLength === 0) break;
          const chunk = new Uint8Array(result);
          chunks.push(chunk);
          totalLength += chunk.byteLength;
        }
      }
    );

    if (chunks.length === 1 && ipcBufferHasRows(chunks[0])) {
      return chunks[0];
    }

    // Concatenate IPC chunks into a single contiguous buffer
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }

    if (chunks.length > 1 || ipcBufferHasRows(combined)) {
      return combined;
    }

    const fallbackBuffer = (await executeQuery(connection, query, {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    })) as Uint8Array | ArrayBuffer;
    return toUint8Array(fallbackBuffer);
  } catch (error) {
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

function toUint8Array(buffer: Uint8Array | ArrayBuffer): Uint8Array {
  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
}

function ipcBufferHasRows(buffer: Uint8Array): boolean {
  try {
    const table = tableFromIPC(buffer, {
      useBigInt: true,
      useDate: true,
      useDecimalInt: false,
      useMap: true
    });
    return table.numRows > 0;
  } catch {
    return false;
  }
}
