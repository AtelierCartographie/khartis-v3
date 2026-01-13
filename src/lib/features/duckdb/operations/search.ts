import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import type { CellSearchResult, DuckDBContext, SearchStats } from '../types';

const MAX_ROWS_FOR_SEARCH = 20000;
const MAX_CELLS_FOR_FUZZY = 200000;
const MIN_QUERY_LENGTH_FOR_FUZZY = 4;
const MIN_RESULTS_FOR_FUZZY = 10;
const CACHE_TTL_MS = 60000;
const MAX_CACHE_SIZE = 50;

let currentSearchId = 0;

interface CacheEntry {
  results: SearchStats;
  timestamp: number;
}

const searchCache = new Map<string, CacheEntry>();

function getCacheKey(
  table: string,
  query: string,
  column: string | null
): string {
  return `${table}:${query}:${column || 'all'}`;
}

function getFromCache(key: string): SearchStats | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return entry.results;
}

function setCache(key: string, results: SearchStats): void {
  if (searchCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(key, { results, timestamp: Date.now() });
}

export function clearSearchCache(): void {
  searchCache.clear();
}

export async function searchInTable(
  ctx: DuckDBContext,
  table: string,
  searchQuery: string,
  options: { threshold?: number; column?: string } = {}
): Promise<SearchStats> {
  const { threshold = 0.85, column = null } = options;
  const emptyResult: SearchStats = {
    exactCount: 0,
    containsCount: 0,
    fuzzyCount: 0,
    totalCount: 0,
    results: [],
    isSampled: false
  };

  if (!searchQuery || searchQuery.trim() === '') {
    return emptyResult;
  }

  const trimmedQuery = searchQuery.trim();
  const cacheKey = getCacheKey(table, trimmedQuery, column);
  const cached = getFromCache(cacheKey);
  if (cached) {
    logger.debug('Search cache hit', LogCategory.DUCKDB, {
      table,
      query: trimmedQuery
    });
    return cached;
  }

  const searchId = ++currentSearchId;
  const escapedQuery = escapeSqlString(trimmedQuery);
  const enableFuzzy = trimmedQuery.length >= MIN_QUERY_LENGTH_FOR_FUZZY;
  let isSampled = false;

  try {
    const rowCountResult = (await executeQuery(
      ctx.connection,
      `SELECT count(*) as cnt FROM "${table}"`,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
    )) as Array<{ cnt: bigint | number }>;
    const rowCount = Number(rowCountResult[0]?.cnt ?? 0);

    const colCountResult = (await executeQuery(
      ctx.connection,
      `SELECT count(*) as cnt FROM duckdb_columns() WHERE table_name = '${escapeSqlString(table)}' AND column_name != '__id'`,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
    )) as Array<{ cnt: bigint | number }>;
    const colCount = Number(colCountResult[0]?.cnt ?? 0);

    const estimatedCells = rowCount * colCount;

    if (searchId !== currentSearchId) {
      return emptyResult;
    }

    let searchTable = table;
    if (
      rowCount > MAX_ROWS_FOR_SEARCH ||
      estimatedCells > MAX_CELLS_FOR_FUZZY
    ) {
      isSampled = true;
      const samplePercent = Math.max(
        1,
        Math.min(100, Math.floor((MAX_ROWS_FOR_SEARCH / rowCount) * 100))
      );
      logger.warn(
        'Large table detected, using sampling for search',
        LogCategory.DUCKDB,
        {
          table,
          rowCount,
          colCount,
          estimatedCells,
          samplePercent
        }
      );

      await executeQuery(
        ctx.connection,
        `CREATE OR REPLACE TEMP TABLE __search_sample AS
         SELECT * FROM "${table}" USING SAMPLE ${samplePercent} PERCENT (bernoulli)`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      );
      searchTable = '__search_sample';
    }

    if (searchId !== currentSearchId) {
      return emptyResult;
    }

    let whereClause = '';
    if (column) {
      const escapedColumn = escapeSqlString(column);
      whereClause = ` WHERE column_name = '${escapedColumn}'`;
    }

    await executeQuery(
      ctx.connection,
      `CREATE OR REPLACE TEMP TABLE __search_exact AS
       FROM searchExact('${searchTable}', '${escapedQuery}', 500)`,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
    );

    if (searchId !== currentSearchId) {
      return emptyResult;
    }

    const exactCountResult = (await executeQuery(
      ctx.connection,
      `SELECT count(*) as cnt FROM __search_exact${whereClause}`,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
    )) as Array<{ cnt: bigint | number }>;
    const exactResultCount = Number(exactCountResult[0]?.cnt ?? 0);

    let fuzzyResults: Array<{
      __id: number;
      column_name: string;
      column_value: string;
      score: number;
    }> = [];

    if (enableFuzzy && exactResultCount < MIN_RESULTS_FOR_FUZZY && !isSampled) {
      if (searchId !== currentSearchId) {
        return emptyResult;
      }

      logger.debug(
        'Running fuzzy search (few exact results)',
        LogCategory.DUCKDB,
        {
          exactResultCount,
          threshold: MIN_RESULTS_FOR_FUZZY
        }
      );

      const fuzzyLimit = Math.min(500 - exactResultCount, 100);
      fuzzyResults = (await executeQuery(
        ctx.connection,
        `FROM searchFuzzy('${searchTable}', '${escapedQuery}', ${threshold}, ${fuzzyLimit})${whereClause ? whereClause.replace('WHERE', 'WHERE') : ''}`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      )) as Array<{
        __id: number;
        column_name: string;
        column_value: string;
        score: number;
      }>;
    }

    if (searchId !== currentSearchId) {
      return emptyResult;
    }

    const exactResults = (await executeQuery(
      ctx.connection,
      `SELECT __id, column_name, column_value, score
       FROM __search_exact${whereClause}
       ORDER BY score DESC, __id ASC`,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
    )) as Array<{
      __id: number;
      column_name: string;
      column_value: string;
      score: number;
    }>;

    const allResults = [...exactResults, ...fuzzyResults];

    const exactCount = exactResults.filter((r) => r.score === 1.0).length;
    const containsCount = exactResults.filter((r) => r.score === 0.99).length;
    const fuzzyCount = fuzzyResults.length;

    if (searchId !== currentSearchId) {
      return emptyResult;
    }

    const cellResults: CellSearchResult[] = allResults.map((r) => ({
      rowId: r.__id,
      columnName: r.column_name,
      value: r.column_value,
      score: r.score
    }));

    const result: SearchStats = {
      exactCount,
      containsCount,
      fuzzyCount,
      totalCount: allResults.length,
      results: cellResults,
      isSampled
    };

    setCache(cacheKey, result);

    return result;
  } catch (error) {
    logger.error('Search query failed', LogCategory.DUCKDB, {
      table,
      searchQuery,
      error
    });
    return emptyResult;
  }
}
