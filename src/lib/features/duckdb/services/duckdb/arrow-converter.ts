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

  if (!Duck) {
    throw new Error('DuckDB not initialized - Duck instance is null');
  }

  if (!Duck.connection) {
    throw new Error('DuckDB connection not established - connection is null');
  }

  logger.debug('Inserting Arrow table into DuckDB', LogCategory.DUCKDB, {
    tableName,
    rowCount: table.numRows,
    columnCount: table.schema.fields.length
  });

  try {
    // insertArrowTable is unreliable in DuckDB-WASM, so stream the IPC payload manually.
    const ipcStream = tableToIPC(table);
    const ipcBuffer =
      ipcStream instanceof Uint8Array ? ipcStream : new Uint8Array(ipcStream);

    logger.debug(
      'IPC stream created, inserting into DuckDB',
      LogCategory.DUCKDB,
      {
        bufferSizeKB: (ipcBuffer.byteLength / 1024).toFixed(2)
      }
    );

    await Duck.connection.insertArrowFromIPCStream(ipcBuffer, {
      name: tableName,
      schema: 'main'
    });

    const duration = performance.now() - startTime;

    logger.success('Arrow table inserted successfully', LogCategory.DUCKDB, {
      tableName,
      rowCount: table.numRows,
      columnCount: table.schema.fields.length,
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
