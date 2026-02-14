import type { DescribeResult, DuckDBContext, TableMetadata } from '../types';

export function invalidateTableCache(ctx: DuckDBContext, table: string): void {
  ctx.describeCache.delete(table);
  ctx.rowCountCache.delete(table);
}

function evictGeoParquetEntry(ctx: DuckDBContext, table: string): void {
  if (!ctx.table_geoparquet_cache.has(table)) return;

  const cachedBuffer = ctx.table_geoparquet_cache.get(table);
  if (cachedBuffer) {
    ctx.cacheState.size -= cachedBuffer.byteLength;
  }

  ctx.table_geoparquet_cache.delete(table);
  const index = ctx.cacheState.accessOrder.indexOf(table);
  if (index > -1) {
    ctx.cacheState.accessOrder.splice(index, 1);
  }
}

let onTableMutatedCallback: ((table: string) => void) | null = null;

export function registerTableMutationCallback(
  callback: (table: string) => void
): void {
  onTableMutatedCallback = callback;
}

export function markTableMutated(ctx: DuckDBContext, table: string): void {
  invalidateTableCache(ctx, table);
  evictGeoParquetEntry(ctx, table);
  onTableMutatedCallback?.(table);
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
