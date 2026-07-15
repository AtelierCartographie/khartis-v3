import { Table, tableToIPC, vectorFromArray, type Vector } from 'apache-arrow';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { DuckDBError } from '$lib/features/commons/pipeline.errors';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import * as m from '$lib/paraglide/messages';
import { markTableMutated } from '../cache/cache-manager';
import { executeQuery } from '../core/query';
import { getContext, isInitialized } from '../core/engine';

export function convertTabularDataToArrow(
  data: Record<string, unknown>[],
  options: { addRowId?: boolean } = {}
): Table {
  if (data.length === 0) return new Table({});

  const columns = Object.keys(data[0]);
  const vectors: Record<string, Vector> = {};

  if (options.addRowId) {
    const ids = new Int32Array(data.length);
    for (let i = 0; i < data.length; i++) ids[i] = i + 1;
    vectors[INTERNAL_COLUMN.ID] = vectorFromArray(ids);
  }

  for (const col of columns) {
    const values = data.map((row) => row[col]);
    vectors[col] = vectorFromArray(values);
  }

  return new Table(vectors);
}

export async function insertArrowTableIntoDuckDB(
  table: Table,
  tableName: string
): Promise<void> {
  if (!isInitialized()) {
    throw new DuckDBError(m.error_duckdb_not_initialized_arrow());
  }

  const ctx = getContext();

  if (!ctx.connection) {
    throw new DuckDBError(m.error_duckdb_connection_null());
  }

  const ipcStream = tableToIPC(table);
  const ipcBuffer =
    ipcStream instanceof Uint8Array ? ipcStream : new Uint8Array(ipcStream);

  // Deterministic table names make name reuse the nominal replay case; the
  // Arrow insert creates the table, so an existing one must be dropped first.
  await executeQuery(
    ctx.connection,
    `DROP TABLE IF EXISTS "${escapeIdentifier(tableName)}"`
  );

  await ctx.connection.insertArrowFromIPCStream(ipcBuffer, {
    name: tableName,
    schema: 'main'
  });
  markTableMutated(ctx, tableName);
}
