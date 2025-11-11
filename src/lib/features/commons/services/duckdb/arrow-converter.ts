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

  console.log(
    `💾 [${new Date().toISOString()}] [Arrow:insert] Inserting Arrow table into DuckDB`,
    {
      tableName,
      numRows: table.numRows,
      numColumns: table.schema.fields.length,
      columns: table.schema.fields.map((f) => ({
        name: f.name,
        type: f.type.toString()
      }))
    }
  );

  try {
    // FIX: DuckDB-WASM's insertArrowTable doesn't persist data properly
    // We need to use IPC stream format instead

    console.log(
      `🔧 [${new Date().toISOString()}] [Arrow:insert] Converting Arrow table to IPC stream...`
    );
    const ipcStart = performance.now();

    // Serialize Arrow table to IPC format (binary stream)
    const ipcStream = tableToIPC(table);
    console.log(
      `✅ [${new Date().toISOString()}] [Arrow:insert] IPC stream created in ${(performance.now() - ipcStart).toFixed(2)}ms`
    );

    // Convert to Uint8Array if needed
    const ipcBuffer =
      ipcStream instanceof Uint8Array ? ipcStream : new Uint8Array(ipcStream);

    console.log(
      `🔧 [${new Date().toISOString()}] [Arrow:insert] Inserting IPC stream into DuckDB...`
    );
    const insertStart = performance.now();

    // Use insertArrowFromIPCStream which is more reliable for DuckDB-WASM
    await Duck.connection.insertArrowFromIPCStream(ipcBuffer, {
      name: tableName,
      schema: 'main'
    });

    console.log(
      `✅ [${new Date().toISOString()}] [Arrow:insert] IPC stream inserted in ${(performance.now() - insertStart).toFixed(2)}ms`
    );

    const duration = performance.now() - startTime;

    logger.success('Arrow table inserted successfully', LogCategory.DUCKDB, {
      tableName,
      rowCount: table.numRows,
      columnCount: table.schema.fields.length,
      durationMs: duration.toFixed(2)
    });

    console.log(`🎉 [${new Date().toISOString()}] [Arrow:insert] COMPLETE`, {
      tableName,
      duration: `${duration.toFixed(2)}ms`,
      rows: table.numRows
    });
  } catch (error) {
    const errorDuration = performance.now() - startTime;
    console.error(
      `❌ [${new Date().toISOString()}] [Arrow:insert] FAILED after ${errorDuration.toFixed(2)}ms`,
      error
    );
    logger.error(
      'Failed to insert Arrow table into DuckDB',
      LogCategory.DUCKDB,
      error
    );
    throw error;
  }
}
