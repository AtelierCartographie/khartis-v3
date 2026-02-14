import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { tableFromIPC } from '@uwdata/flechette';
import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { DUCK_CONST } from '../constants';
import type { DuckDBUnsafeBindings, QueryOptions } from '../types';

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
      error instanceof Error ? error.message : 'Unknown DuckDB error';
    const truncatedQuery =
      query.length > 200 ? query.substring(0, 200) + '...' : query;
    throw new DuckDBError(
      `Query execution failed: ${message}`,
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
