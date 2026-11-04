import type { DescribeResult, DuckDBContext, TableMetadata } from '../types';

export function invalidateTableCache(ctx: DuckDBContext, table: string): void {
  ctx.describeCache.delete(table);
  ctx.rowCountCache.delete(table);
}

export interface TableMutationOptions {
  /**
   * The statement only appended join result columns: source values are
   * unchanged, so the join similarity cache stays valid.
   */
  preserveJoinSimilarity?: boolean;
}

type TableMutationListener = (
  table: string,
  ctx: DuckDBContext,
  options: TableMutationOptions
) => void;

const tableMutationListeners = new Set<TableMutationListener>();

/** Every cache derived from a table subscribes here and nowhere else. */
export function registerTableMutationCallback(
  callback: TableMutationListener
): () => void {
  tableMutationListeners.add(callback);
  return () => tableMutationListeners.delete(callback);
}

export function markTableMutated(
  ctx: DuckDBContext,
  table: string,
  options: TableMutationOptions = {}
): void {
  invalidateTableCache(ctx, table);
  for (const listener of tableMutationListeners) {
    listener(table, ctx, options);
  }
}

export function getTableMetadata(
  ctx: DuckDBContext,
  table: string
): TableMetadata {
  if (!ctx.table_metadata.has(table)) {
    ctx.table_metadata.set(table, {
      analysis: null,
      join: null,
      filters: new Map()
    });
  }
  return ctx.table_metadata.get(table)!;
}

export function getDescribe(
  ctx: DuckDBContext,
  table: string
): DescribeResult | undefined {
  return ctx.describeCache.get(table);
}

export function setDescribe(
  ctx: DuckDBContext,
  table: string,
  data: DescribeResult
): void {
  ctx.describeCache.set(table, data);
}

export function getRowCountFromCache(
  ctx: DuckDBContext,
  table: string
): number | undefined {
  return ctx.rowCountCache.get(table);
}

export function setRowCountCache(
  ctx: DuckDBContext,
  table: string,
  count: number
): void {
  ctx.rowCountCache.set(table, count);
}
