import { Duck } from '$lib/features/duckdb';
import { LogCategory, logger } from './logger';

export async function cleanupDuckDBResources(tableName: string): Promise<void> {
  try {
    Duck?.cleanupTableResources(tableName);
  } catch (error) {
    logger.warn(
      'Failed to cleanup DuckDB resources',
      LogCategory.DUCKDB,
      error
    );
  }
}
