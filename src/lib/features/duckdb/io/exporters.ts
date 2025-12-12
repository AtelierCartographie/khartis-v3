import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { CACHE_CONSTANTS, DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import type { DuckDBContext } from '../types';

function isValidParquetBuffer(buffer: Uint8Array): boolean {
  if (buffer.byteLength < 8) return false;

  const magicLength = CACHE_CONSTANTS.PARQUET_MAGIC.length;
  for (let i = 0; i < magicLength; i++) {
    if (buffer[i] !== CACHE_CONSTANTS.PARQUET_MAGIC[i]) return false;
  }

  for (let i = 0; i < magicLength; i++) {
    if (
      buffer[buffer.byteLength - magicLength + i] !==
      CACHE_CONSTANTS.PARQUET_MAGIC[i]
    ) {
      return false;
    }
  }

  return true;
}

async function readStableParquetBuffer(
  ctx: DuckDBContext,
  filename: string
): Promise<Uint8Array> {
  for (
    let attempt = 0;
    attempt < CACHE_CONSTANTS.GEO_PARQUET_READ_RETRIES;
    attempt++
  ) {
    const rawBuffer = await ctx.db.copyFileToBuffer(filename);
    const sourceView =
      rawBuffer instanceof Uint8Array ? rawBuffer : new Uint8Array(rawBuffer);
    const stableBuffer = new Uint8Array(sourceView.byteLength);
    stableBuffer.set(sourceView);

    if (isValidParquetBuffer(stableBuffer)) {
      if (attempt > 0) {
        logger.debug(
          'GeoParquet buffer validated after retry',
          LogCategory.DUCKDB,
          {
            filename,
            attempt: attempt + 1
          }
        );
      }
      return stableBuffer;
    }

    logger.warn('GeoParquet buffer incomplete, retrying', LogCategory.DUCKDB, {
      filename,
      byteLength: stableBuffer.byteLength,
      attempt: attempt + 1
    });

    await new Promise((resolve) =>
      setTimeout(
        resolve,
        CACHE_CONSTANTS.GEO_PARQUET_RETRY_DELAY_MS * (attempt + 1)
      )
    );
  }

  throw new DuckDBError(
    `Failed to read valid GeoParquet buffer from ${filename}`
  );
}

export async function exportToCsv(
  ctx: DuckDBContext,
  table: string,
  options?: { delimiter?: string; header?: boolean }
): Promise<string> {
  const delimiter = options?.delimiter || ',';
  const header = options?.header !== false;
  const filename = `${table}_export_${Date.now()}.csv`;

  try {
    await executeQuery(
      ctx.connection,
      `COPY "${table}" TO '${filename}' (FORMAT CSV, DELIMITER '${delimiter}', HEADER ${header})`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
    );

    const buffer = await ctx.db.copyFileToBuffer(filename);
    const decoder = new TextDecoder('utf-8');
    const csvString = decoder.decode(buffer);

    logger.debug('CSV export completed', LogCategory.DUCKDB, {
      table,
      byteLength: buffer.byteLength
    });

    return csvString;
  } finally {
    try {
      await ctx.db.dropFile(filename);
    } catch (error) {
      logger.warn(
        'Failed to remove temporary CSV file',
        LogCategory.DUCKDB,
        error
      );
    }
  }
}

export async function exportToGeoparquet(
  ctx: DuckDBContext,
  table: string
): Promise<Uint8Array> {
  const cache = ctx.table_geoparquet_cache;
  const cacheState = ctx.cacheState;

  if (cache.has(table)) {
    const index = cacheState.accessOrder.indexOf(table);
    if (index > -1) {
      cacheState.accessOrder.splice(index, 1);
      cacheState.accessOrder.push(table);
    }
    const cachedBuffer = cache.get(table)!;
    return cachedBuffer.slice();
  }

  const escapedTableForFile = escapeSqlString(table);
  await executeQuery(
    ctx.connection,
    `COPY "${table}" TO '${escapedTableForFile}.parquet' (FORMAT PARQUET, CODEC 'ZSTD');`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );

  const filename = `${table}.parquet`;
  let stableBuffer: Uint8Array | null = null;

  try {
    stableBuffer = await readStableParquetBuffer(ctx, filename);
  } finally {
    try {
      await ctx.db.dropFile(filename);
    } catch (error) {
      logger.warn(
        'Failed to remove temporary GeoParquet file',
        LogCategory.DUCKDB,
        error
      );
    }
  }

  if (!stableBuffer) {
    throw new DuckDBError(
      `Failed to materialize GeoParquet buffer for ${table}`
    );
  }

  logger.debug('GeoParquet buffer materialized', LogCategory.DUCKDB, {
    table,
    byteLength: stableBuffer.byteLength
  });

  while (
    cacheState.size + stableBuffer.byteLength >
      CACHE_CONSTANTS.MAX_CACHE_SIZE &&
    cacheState.accessOrder.length > 0
  ) {
    const oldest = cacheState.accessOrder.shift()!;
    const oldBuffer = cache.get(oldest);
    if (oldBuffer) {
      cacheState.size -= oldBuffer.byteLength;
      cache.delete(oldest);
    }
  }

  cache.set(table, stableBuffer);
  cacheState.accessOrder.push(table);
  cacheState.size += stableBuffer.byteLength;

  return stableBuffer.slice();
}
