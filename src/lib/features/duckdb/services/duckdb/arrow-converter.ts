import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Table, tableToIPC, vectorFromArray, type Vector } from 'apache-arrow';
import { Duck } from './duckdb';

/**
 * Converts an array of objects (TabularData) to an Arrow Table.
 */
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

/**
 * Insert an Arrow table into DuckDB using the IPC stream API so the data persists in WASM.
 */
export async function insertArrowTableIntoDuckDB(
  table: Table,
  tableName: string
): Promise<void> {
  const startTime = performance.now();
  logger.info('Inserting Arrow table into DuckDB', LogCategory.DUCKDB, {
    tableName,
    rows: table.numRows
  });

  if (!Duck) {
    throw new Error('DuckDB not initialized - Duck instance is null');
  }

  if (!Duck.connection) {
    throw new Error('DuckDB connection not established - connection is null');
  }

  try {
    // insertArrowTable is unreliable in DuckDB-WASM, so stream the IPC payload manually.
    const ipcStream = tableToIPC(table);
    const ipcBuffer =
      ipcStream instanceof Uint8Array ? ipcStream : new Uint8Array(ipcStream);

    await Duck.connection.insertArrowFromIPCStream(ipcBuffer, {
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
