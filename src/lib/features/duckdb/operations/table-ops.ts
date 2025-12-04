import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import {
  markTableMutated,
  getDescribe,
  setDescribe,
  setRowCountCache,
  getRowCountFromCache
} from '../cache/cache-manager';
import type { DescribeResult, DuckDBContext } from '../types';

export async function describeTable(
  ctx: DuckDBContext,
  table: string
): Promise<{ name: string[]; type: string[] }> {
  const cached = getDescribe(ctx, table);
  if (cached) return cached;

  try {
    const escapedTableForDescribe = escapeSqlString(table);
    const records = (await executeQuery(
      ctx.connection,
      `SELECT column_name, data_type AS column_type
       FROM information_schema.columns
       WHERE table_name = '${escapedTableForDescribe}' COLLATE NOCASE
       ORDER BY ordinal_position`,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
    )) as Array<{ column_name: string; column_type: string }>;

    const names = records.map((row) => row.column_name);
    const types = records.map((row) => row.column_type);

    const describe: DescribeResult = { name: names, type: types };
    setDescribe(ctx, table, describe);
    return describe;
  } catch (error) {
    logger.error('Failed to describe table', LogCategory.DUCKDB, {
      table,
      error
    });
    throw error;
  }
}

export async function getRowCount(
  ctx: DuckDBContext,
  table: string
): Promise<number> {
  const cached = getRowCountFromCache(ctx, table);
  if (cached !== undefined) return cached;

  try {
    const result = (await executeQuery(
      ctx.connection,
      `SELECT CAST(COUNT(*) AS DOUBLE) as num_rows FROM "${table}"`,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
    )) as Array<{ num_rows: number }>;

    const count = Number(result[0]?.num_rows ?? 0);
    setRowCountCache(ctx, table, count);
    return count;
  } catch (error) {
    logger.error('Failed to get row count', LogCategory.DUCKDB, {
      table,
      error
    });
    throw error;
  }
}

export async function dropRows(
  ctx: DuckDBContext,
  table: string,
  rowsId: number[]
): Promise<void> {
  await executeQuery(
    ctx.connection,
    `DELETE FROM "${table}" WHERE __id IN (${rowsId.toString()})`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );
  markTableMutated(ctx, table);
}
