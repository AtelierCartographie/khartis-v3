import type { Table } from 'apache-arrow';
import { tableToIPC } from 'apache-arrow';
import { Duck } from './duckdb';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

/**
 * Insert an Arrow table into DuckDB using the IPC stream API so the data persists in WASM.
 */
export async function insertArrowTableIntoDuckDB(
  table: Table,
  tableName: string
): Promise<void> {
  const startTime = performance.now();

  if (!Duck || !Duck.connection) {
    throw new Error('DuckDB not initialized - cannot insert Arrow table');
  }

  logger.debug('Operation', LogCategory.DUCKDB);

  try {
    // insertArrowTable is unreliable in DuckDB-WASM, so stream the IPC payload manually.
    logger.debug('Operation', LogCategory.DUCKDB);
    const ipcStream = tableToIPC(table);
    logger.debug('Operation', LogCategory.DUCKDB);
    const ipcBuffer =
      ipcStream instanceof Uint8Array ? ipcStream : new Uint8Array(ipcStream);

    logger.debug('Operation', LogCategory.DUCKDB);
    await Duck.connection.insertArrowFromIPCStream(ipcBuffer, {
      name: tableName,
      schema: 'main'
    });

    logger.debug('Operation', LogCategory.DUCKDB);

    const duration = performance.now() - startTime;

    logger.success('Arrow table inserted successfully', LogCategory.DUCKDB, {
      tableName,
      rowCount: table.numRows,
      columnCount: table.schema.fields.length,
      durationMs: duration.toFixed(2)
    });

    logger.debug('Operation', LogCategory.DUCKDB);
  } catch (error) {
    logger.error('Operation', LogCategory.DUCKDB);
    logger.error(
      'Failed to insert Arrow table into DuckDB',
      LogCategory.DUCKDB,
      error
    );
    throw error;
  }
}
