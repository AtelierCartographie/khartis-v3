import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { tableFromIPC } from '@uwdata/flechette';
import { DUCK_CONST } from '../constants';
import type { DuckDBUnsafeBindings, QueryOptions } from '../types';

export async function executeQuery(
  connection: AsyncDuckDBConnection,
  query: string,
  options: QueryOptions = {}
): Promise<unknown> {
  const { format = DUCK_CONST.QUERY_FORMAT.ARROW_TABLE, useProxy = true } =
    options;

  const buffer = await connection.useUnsafe(
    async (bindings: DuckDBUnsafeBindings, conn: unknown) => {
      return await bindings.runQuery(conn, query);
    }
  );

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
