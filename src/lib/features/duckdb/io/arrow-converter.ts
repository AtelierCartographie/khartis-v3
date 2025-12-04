import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Table, tableToIPC, vectorFromArray, type Vector } from 'apache-arrow';
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
    vectors['__id'] = vectorFromArray(ids);
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
  const startTime = performance.now();
  logger.info('Inserting Arrow table into DuckDB', LogCategory.DUCKDB, {
    tableName,
    rows: table.numRows
  });

  if (!isInitialized()) {
    throw new Error('DuckDB not initialized - call initDuckDB() first');
  }

  const ctx = getContext();

  if (!ctx.connection) {
    throw new Error('DuckDB connection not established - connection is null');
  }

  try {
    const ipcStream = tableToIPC(table);
    const ipcBuffer =
      ipcStream instanceof Uint8Array ? ipcStream : new Uint8Array(ipcStream);

    await ctx.connection.insertArrowFromIPCStream(ipcBuffer, {
      name: tableName,
      schema: 'main'
    });

    const duration = performance.now() - startTime;
    logger.success('Arrow table inserted into DuckDB', LogCategory.DUCKDB, {
      tableName,
      rows: table.numRows,
      durationMs: duration.toFixed(2)
    });
  } catch (error) {
    logger.error(
      'Failed to insert Arrow table into DuckDB',
      LogCategory.DUCKDB,
      error
    );
    throw error;
  }
}
