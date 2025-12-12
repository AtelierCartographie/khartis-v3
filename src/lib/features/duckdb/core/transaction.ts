import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

class TransactionMutex {
  private queue: Array<() => void> = [];

  private locked = false;

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.locked = false;
    }
  }
}

const transactionMutex = new TransactionMutex();

export async function runInTransaction(
  connection: AsyncDuckDBConnection | null,
  callback: () => Promise<void>,
  context = 'transaction'
): Promise<void> {
  if (!connection) {
    throw new DuckDBError('Connection not established');
  }
  const start = performance.now();

  await transactionMutex.acquire();

  try {
    logger.debug('Starting DuckDB transaction', LogCategory.DUCKDB, {
      context
    });
    await connection.query('BEGIN TRANSACTION;');
    try {
      await callback();
      await connection.query('COMMIT;');
      logger.info('DuckDB transaction committed', LogCategory.DUCKDB, {
        context,
        durationMs: (performance.now() - start).toFixed(2)
      });
    } catch (error) {
      await connection.query('ROLLBACK;');
      logger.error('DuckDB transaction rolled back', LogCategory.DUCKDB, {
        context,
        durationMs: (performance.now() - start).toFixed(2),
        error
      });
      throw error;
    }
  } finally {
    transactionMutex.release();
  }
}
