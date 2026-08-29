import { DuckDBError } from '$lib/features/commons/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import * as m from '$lib/paraglide/messages';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

function createTransactionMutex() {
  const queue: Array<() => void> = [];
  let locked = false;

  async function acquire(): Promise<void> {
    if (!locked) {
      locked = true;
      return;
    }
    await new Promise<void>((resolve) => {
      queue.push(resolve);
    });
  }

  function release(): void {
    const next = queue.shift();
    if (next) {
      next();
      return;
    }
    locked = false;
  }

  return {
    acquire,
    release
  };
}

const transactionMutex = createTransactionMutex();

interface TransactionOptions {
  logRollback?: boolean;
}

export async function runInTransaction(
  connection: AsyncDuckDBConnection | null,
  callback: () => Promise<void>,
  context = 'transaction',
  options: TransactionOptions = {}
): Promise<void> {
  if (!connection) {
    throw new DuckDBError(m.error_connection_not_established());
  }
  const start = performance.now();

  await transactionMutex.acquire();

  try {
    await connection.query('BEGIN TRANSACTION;');
    try {
      await callback();
      await connection.query('COMMIT;');
    } catch (error) {
      await connection.query('ROLLBACK;');
      if (options.logRollback !== false) {
        logger.error('DuckDB transaction rolled back', LogCategory.DUCKDB, {
          context,
          durationMs: (performance.now() - start).toFixed(2),
          error
        });
      }
      throw error;
    }
  } finally {
    transactionMutex.release();
  }
}
