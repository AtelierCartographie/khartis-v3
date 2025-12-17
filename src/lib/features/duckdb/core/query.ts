import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { tableFromIPC } from '@uwdata/flechette';
import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { DUCK_CONST } from '../constants';
import type { DuckDBUnsafeBindings, QueryOptions } from '../types';

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
