import type { Table } from 'apache-arrow';
import { tableToIPC } from 'apache-arrow';
import { Duck } from './duckdb';
import { logger, LogCategory } from '../../utils/logger';

/**
 * Insert an Apache Arrow table directly into DuckDB
 * This bypasses JSON serialization and uses DuckDB's native Arrow integration
 *
 * @param table - Apache Arrow table to insert
 * @param tableName - Name of the DuckDB table to create
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
    // FIX: DuckDB-WASM's insertArrowTable doesn't persist data properly
    // We need to use IPC stream format instead

    logger.debug('Operation', LogCategory.DUCKDB);
    const ipcStart = performance.now();

    // Serialize Arrow table to IPC format (binary stream)
    const ipcStream = tableToIPC(table);
    logger.debug('Operation', LogCategory.DUCKDB);

    // Convert to Uint8Array if needed
    const ipcBuffer =
      ipcStream instanceof Uint8Array ? ipcStream : new Uint8Array(ipcStream);

    logger.debug('Operation', LogCategory.DUCKDB);
    const insertStart = performance.now();

    // Use insertArrowFromIPCStream which is more reliable for DuckDB-WASM
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
    const errorDuration = performance.now() - startTime;
    logger.error('Operation', LogCategory.DUCKDB);
    logger.error(
      'Failed to insert Arrow table into DuckDB',
      LogCategory.DUCKDB,
      error
    );
    throw error;
  }
}
