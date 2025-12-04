import type {
  CacheState,
  DescribeResult,
  QueryCacheEntry,
  TableMetadata
} from './types';

export interface CacheContext {
  table_geoparquet_cache: Map<string, Uint8Array>;
  queryCache: Map<string, QueryCacheEntry>;
  describeCache: Map<string, DescribeResult>;
  rowCountCache: Map<string, number>;
  cacheState: CacheState;
}

export function evictGeoParquetEntry(ctx: CacheContext, table: string): void {
  if (!ctx.table_geoparquet_cache.has(table)) {
    return;
  }

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

export function invalidateTableCache(ctx: CacheContext, table: string): void {
  ctx.describeCache.delete(table);
  ctx.rowCountCache.delete(table);
}

export function invalidateCacheForTable(
  ctx: CacheContext,
  table: string
): void {
  for (const [key, cached] of ctx.queryCache.entries()) {
    if (cached.tableVersions.has(table)) {
      ctx.queryCache.delete(key);
    }
  }
}

export function markTableMutated(ctx: CacheContext, table: string): void {
  invalidateTableCache(ctx, table);
  evictGeoParquetEntry(ctx, table);
  invalidateCacheForTable(ctx, table);
}

export function clearQueryCache(ctx: CacheContext): void {
  ctx.queryCache.clear();
}

export function clearGeoParquetCache(ctx: CacheContext): void {
  ctx.table_geoparquet_cache.clear();
  ctx.cacheState.accessOrder = [];
  ctx.cacheState.size = 0;
}

export function getTableMetadata(
  table_metadata: Map<string, TableMetadata>,
  table: string
): TableMetadata {
  if (!table_metadata.has(table)) {
    table_metadata.set(table, {
      analysis: null,
      join: null,
      filters: new Map()
    });
  }
  return table_metadata.get(table)!;
}
