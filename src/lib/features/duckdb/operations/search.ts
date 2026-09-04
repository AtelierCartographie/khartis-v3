import {
  escapeSqlString,
  escapeIdentifier
} from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { toCanonicalNumericTerm } from '$lib/features/commons/utils/search-term.utils';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { registerTableMutationCallback } from '../cache/cache-manager';
import { DUCK_CONST } from '../constants';
import {
  executeCancellableQuery,
  executeQuery,
  isQueryAbortError
} from '../core/query';
import { buildStripHtmlTextSqlExpression } from '../utils/html-like-text.utils';
import type { CellSearchResult, DuckDBContext, SearchStats } from '../types';

const MAX_ROWS_FOR_SEARCH = 10000;
const MAX_CELLS_FOR_FUZZY = 100000;
const MIN_QUERY_LENGTH_FOR_FUZZY = 4;
const MIN_RESULTS_FOR_FUZZY = 10;
const MAX_EXACT_RESULTS = 200;
const MAX_FUZZY_RESULTS = 50;
const CACHE_TTL_MS = 60000;
const MAX_CACHE_SIZE = 50;
const TEXT_COLUMN_TYPES = new Set(['VARCHAR', 'TEXT', 'STRING']);
const NUMERIC_COLUMN_TYPE_PATTERN =
  /^(U?(TINY|SMALL|BIG|HUGE)?INT(EGER)?|FLOAT|REAL|DOUBLE|DECIMAL|NUMERIC)\b/i;

let currentSearchId = 0;
let activeSearchAbortController: AbortController | null = null;

interface CacheEntry {
  results: SearchStats;
  timestamp: number;
}

const searchCache = new Map<string, CacheEntry>();

registerTableMutationCallback((table: string) => {
  // Use exact table prefix with separator to avoid substring false positives
  // (e.g., mutating "users" should not invalidate "users_temp:..." cache entries)
  const prefix = `${table}:`;
  for (const key of searchCache.keys()) {
    if (key.startsWith(prefix)) {
      searchCache.delete(key);
    }
  }
});

function getCacheKey(
  table: string,
  query: string,
  column: string | null,
  threshold: number
): string {
  return `${table}:${query}:${column || 'all'}:${threshold}`;
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

function normalizeRowId(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function filterSearchableColumns(
  columns: string[],
  filterColumn: string | null
): string[] {
  return filterColumn ? columns.filter((c) => c === filterColumn) : columns;
}

function buildExactSearchSQL(
  tableName: string,
  textColumns: string[],
  numericColumns: string[],
  escapedTerm: string,
  escapedNumericTerm: string | null,
  maxResults: number,
  filterColumn: string | null
): string {
  const textToSearch = filterSearchableColumns(textColumns, filterColumn);
  const numericToSearch = escapedNumericTerm
    ? filterSearchableColumns(numericColumns, filterColumn)
    : [];

  if (textToSearch.length === 0 && numericToSearch.length === 0) {
    return `SELECT NULL::INTEGER AS __id, NULL::VARCHAR AS column_name, NULL::VARCHAR AS column_value, NULL::DOUBLE AS score WHERE false`;
  }

  const textParts = textToSearch.map((col) => {
    const escapedCol = escapeIdentifier(col);
    const textValueExpr = buildStripHtmlTextSqlExpression(`"${escapedCol}"`);
    return `SELECT __id, '${escapeSqlString(col)}' AS column_name, column_value,
      CASE WHEN norm_value = '${escapedTerm}' THEN 1.0 ELSE 0.99 END AS score
    FROM (
      SELECT __id, ${textValueExpr} AS column_value, normalize_text("${escapedCol}") AS norm_value
      FROM "${escapeIdentifier(tableName)}"
      WHERE "${escapedCol}" IS NOT NULL AND length(trim(${textValueExpr})) > 0
    ) sub
    WHERE norm_value = '${escapedTerm}' OR contains(norm_value, '${escapedTerm}')`;
  });

  const numericParts = numericToSearch.map((col) => {
    const escapedCol = escapeIdentifier(col);
    return `SELECT __id, '${escapeSqlString(col)}' AS column_name, column_value,
      CASE WHEN column_value = '${escapedNumericTerm}' THEN 1.0 ELSE 0.99 END AS score
    FROM (
      SELECT __id, CAST("${escapedCol}" AS VARCHAR) AS column_value
      FROM "${escapeIdentifier(tableName)}"
      WHERE "${escapedCol}" IS NOT NULL
    ) sub
    WHERE contains(column_value, '${escapedNumericTerm}')`;
  });

  return `${[...textParts, ...numericParts].join('\nUNION ALL\n')}
  ORDER BY score DESC, __id ASC
  LIMIT ${maxResults}`;
}

function buildFuzzySearchSQL(
  tableName: string,
  textColumns: string[],
  escapedTerm: string,
  threshold: number,
  maxResults: number,
  filterColumn: string | null
): string {
  const columnsToSearch = filterSearchableColumns(textColumns, filterColumn);

  if (columnsToSearch.length === 0) {
    return `SELECT NULL::INTEGER AS __id, NULL::VARCHAR AS column_name, NULL::VARCHAR AS column_value, NULL::DOUBLE AS score WHERE false`;
  }

  const unionParts = columnsToSearch.map((col) => {
    const escapedCol = escapeIdentifier(col);
    const textValueExpr = buildStripHtmlTextSqlExpression(`"${escapedCol}"`);
    return `SELECT __id, '${escapeSqlString(col)}' AS column_name, column_value,
      jaro_winkler_similarity(norm_value, '${escapedTerm}') AS score
    FROM (
      SELECT __id, ${textValueExpr} AS column_value, normalize_text("${escapedCol}") AS norm_value
      FROM "${escapeIdentifier(tableName)}"
      WHERE "${escapedCol}" IS NOT NULL AND length(trim(${textValueExpr})) > 0
    ) sub
    WHERE length(norm_value) BETWEEN length('${escapedTerm}') * 0.5 AND length('${escapedTerm}') * 2
      AND NOT (norm_value = '${escapedTerm}' OR contains(norm_value, '${escapedTerm}'))
      AND jaro_winkler_similarity(norm_value, '${escapedTerm}') > ${threshold}`;
  });

  return `${unionParts.join('\nUNION ALL\n')}
  ORDER BY score DESC, __id ASC
  LIMIT ${maxResults}`;
}

export async function searchInTable(
  ctx: DuckDBContext,
  table: string,
  searchQuery: string,
  options: {
    threshold?: number;
    column?: string;
    signal?: AbortSignal;
  } = {}
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
  const cacheKey = getCacheKey(table, trimmedQuery, column, threshold);
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const searchId = ++currentSearchId;
  // A newer search supersedes the previous one: cancel its pending worker query.
  activeSearchAbortController?.abort();
  const abortController = new AbortController();
  activeSearchAbortController = abortController;
  const signal = options.signal
    ? AbortSignal.any([options.signal, abortController.signal])
    : abortController.signal;

  const escapedQuery = escapeSqlString(trimmedQuery);
  const numericTerm = toCanonicalNumericTerm(trimmedQuery);
  const enableFuzzy = trimmedQuery.length >= MIN_QUERY_LENGTH_FOR_FUZZY;
  let isSampled = false;

  try {
    const [metaResult, columnsResult] = await Promise.all([
      executeQuery(
        ctx.connection,
        `SELECT
          normalize_text('${escapedQuery}') AS normalized_term,
          (SELECT count(*) FROM "${escapeIdentifier(table)}") AS row_count,
          (SELECT count(*) FROM duckdb_columns() WHERE table_name = '${escapeSqlString(table)}' AND column_name != '${INTERNAL_COLUMN.ID}') AS col_count`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      ) as Promise<
        Array<{
          normalized_term: string;
          row_count: bigint | number;
          col_count: bigint | number;
        }>
      >,
      executeQuery(
        ctx.connection,
        `SELECT column_name, data_type FROM duckdb_columns()
         WHERE table_name = '${escapeSqlString(table)}'
           AND column_name != '${INTERNAL_COLUMN.ID}'`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      ) as Promise<Array<{ column_name: string; data_type: string }>>
    ]);

    if (searchId !== currentSearchId) return emptyResult;

    const normalizedTerm = escapeSqlString(
      metaResult[0]?.normalized_term ?? trimmedQuery
    );
    const rowCount = Number(metaResult[0]?.row_count ?? 0);
    const colCount = Number(metaResult[0]?.col_count ?? 0);
    const estimatedCells = rowCount * colCount;

    const searchableColumns = columnsResult.map((r) => ({
      name: r.column_name,
      type: (r.data_type ?? '').toUpperCase()
    }));
    const textColumns = searchableColumns
      .filter((c) => TEXT_COLUMN_TYPES.has(c.type))
      .map((c) => c.name);
    const numericColumns = numericTerm
      ? searchableColumns
          .filter((c) => NUMERIC_COLUMN_TYPE_PATTERN.test(c.type))
          .map((c) => c.name)
      : [];

    if (textColumns.length === 0 && numericColumns.length === 0) {
      return emptyResult;
    }

    if (searchId !== currentSearchId) return emptyResult;

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

      // Select only __id + searchable columns for the sample — excludes geometry
      // WKB binaries (can be several MB per row) that are never searched.
      const sampleColumns = [
        `"${INTERNAL_COLUMN.ID}"`,
        ...[...textColumns, ...numericColumns].map(
          (c) => `"${escapeIdentifier(c)}"`
        )
      ].join(', ');
      await executeQuery(
        ctx.connection,
        `CREATE OR REPLACE TEMP TABLE __search_sample AS
         SELECT ${sampleColumns} FROM "${escapeIdentifier(table)}" USING SAMPLE ${samplePercent} PERCENT (bernoulli)`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      );
      searchTable = '__search_sample';
    }

    if (searchId !== currentSearchId) return emptyResult;

    const exactSQL = buildExactSearchSQL(
      searchTable,
      textColumns,
      numericColumns,
      normalizedTerm,
      numericTerm ? escapeSqlString(numericTerm) : null,
      MAX_EXACT_RESULTS,
      column
    );

    const exactResults = (await executeCancellableQuery(
      ctx.connection,
      exactSQL,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY, signal }
    )) as Array<{
      __id: number;
      column_name: string;
      column_value: string;
      score: number;
    }>;

    if (searchId !== currentSearchId) return emptyResult;

    let fuzzyResults: Array<{
      __id: number;
      column_name: string;
      column_value: string;
      score: number;
    }> = [];

    if (
      enableFuzzy &&
      exactResults.length < MIN_RESULTS_FOR_FUZZY &&
      !isSampled
    ) {
      if (searchId !== currentSearchId) return emptyResult;

      const fuzzySQL = buildFuzzySearchSQL(
        searchTable,
        textColumns,
        normalizedTerm,
        threshold,
        MAX_FUZZY_RESULTS,
        column
      );

      fuzzyResults = (await executeCancellableQuery(ctx.connection, fuzzySQL, {
        format: DUCK_CONST.QUERY_FORMAT.ARRAY,
        signal
      })) as Array<{
        __id: number;
        column_name: string;
        column_value: string;
        score: number;
      }>;
    }

    if (searchId !== currentSearchId) return emptyResult;

    const allResults = [...exactResults, ...fuzzyResults];
    const exactCount = exactResults.filter((r) => r.score === 1.0).length;
    const containsCount = exactResults.filter((r) => r.score === 0.99).length;
    const fuzzyCount = fuzzyResults.length;

    const cellResults: CellSearchResult[] = allResults.map((r) => ({
      rowId: normalizeRowId(r.__id),
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
    if (isQueryAbortError(error)) {
      return emptyResult;
    }
    logger.error('Search query failed', LogCategory.DUCKDB, {
      table,
      searchQuery,
      error
    });
    throw error;
  } finally {
    if (activeSearchAbortController === abortController) {
      activeSearchAbortController = null;
    }
    if (isSampled) {
      try {
        await executeQuery(
          ctx.connection,
          `DROP TABLE IF EXISTS __search_sample`,
          { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
        );
      } catch {
        /* ignore cleanup errors */
      }
    }
  }
}
