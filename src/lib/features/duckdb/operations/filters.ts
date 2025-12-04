import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { executeQuery } from '../core/query';
import { getTableMetadata } from '../cache/cache-manager';
import type { DuckDBContext } from '../types';

export function addFilter(
  ctx: DuckDBContext,
  table: string,
  keyIndex: number,
  filter: string
): void {
  const table_metadata = getTableMetadata(ctx, table);
  table_metadata.filters.set(keyIndex, filter);
}

export async function applyFilters(
  ctx: DuckDBContext,
  table: string
): Promise<unknown> {
  try {
    let query = `SELECT * FROM "${table}"`;
    const { filters } = getTableMetadata(ctx, table);

    if (filters.size > 0) {
      const filterConditions = Array.from(filters.values()).join(' AND ');
      query += ` WHERE ${filterConditions}`;
    }

    const result = await executeQuery(ctx.connection, query);
    return result;
  } catch (error) {
    logger.error('Failed to apply filters', LogCategory.DUCKDB, error);
    throw error;
  }
}
