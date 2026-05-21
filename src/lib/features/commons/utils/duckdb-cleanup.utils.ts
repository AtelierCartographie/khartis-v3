import { Duck } from '$lib/features/duckdb';
import { LogCategory, logger } from './logger';

export async function cleanupDuckDBResources(tableName: string): Promise<void> {
  try {
    Duck?.cleanupTableResources(tableName);
  } catch (error) {
    logger.error(
      'Failed to cleanup DuckDB table resources',
      LogCategory.DUCKDB,
      error
    );
  }
}
