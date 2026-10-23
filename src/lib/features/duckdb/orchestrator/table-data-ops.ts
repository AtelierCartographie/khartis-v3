import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { GEOMETRY_COLUMN_TYPE } from '$lib/features/commons/constants';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { buildOrderClause } from '../utils/html-like-text.utils';
import { registerTableMutationCallback } from '../cache/cache-manager';
import type { AnalysisResult, ArrowTableLike, FilterStats } from '../types';
import { buildFilterWhereClause } from './filter-ops';
import { getFiltersMap } from './state.svelte';
import {
  sqlIdentifier,
  sqlString
} from '$lib/features/commons/utils/sql.utils';
import type { DuckClient } from '../duck';

const filteredRowCountCache = new Map<string, number>();

registerTableMutationCallback((table: string) => {
  const prefix = `${table}::`;
  for (const key of filteredRowCountCache.keys()) {
    if (key.startsWith(prefix)) {
      filteredRowCountCache.delete(key);
    }
  }
});

export interface GetTableDataOptions {
  offset?: number;
  limit?: number;
  orderBy?: string | null;
  orderByType?: string | null;
  order?: 'ASC' | 'DESC' | null;
}

function normalizeRowId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

async function buildSelectClauseWithoutGeometry(
  tableName: string,
  Duck: DuckClient
): Promise<string> {
  try {
    const tableInfo = await Duck.describe_table(tableName);
    const geomCols = tableInfo.name.flatMap((name, index) => {
      const type = String(tableInfo.type[index] ?? '').toUpperCase();
      return type.startsWith(GEOMETRY_COLUMN_TYPE) ? [sqlIdentifier(name)] : [];
    });

    if (geomCols.length > 0) {
      return `* EXCLUDE (${geomCols.join(', ')})`;
    }
  } catch {
    /* fallback to SELECT * */
  }

  return '*';
}

export async function getTableData(
  tableName: string,
  Duck: DuckClient,
  options?: GetTableDataOptions
): Promise<ArrowTableLike> {
  try {
    const filters = getFiltersMap();
    const selectClause = await buildSelectClauseWithoutGeometry(
      tableName,
      Duck
    );

    let query = `SELECT ${selectClause} FROM ${sqlIdentifier(tableName)}`;
    const whereClause = buildFilterWhereClause(filters.get(tableName));
    if (whereClause) {
      query += ` WHERE ${whereClause}`;
    }

    if (options?.orderBy && options?.order) {
      query += ` ORDER BY ${buildOrderClause(
        options.orderBy,
        options.orderByType,
        options.order
      )}`;
    }

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    if (options?.offset) {
      query += ` OFFSET ${options.offset}`;
    }

    return (await Duck.query(query)) as ArrowTableLike;
  } catch (error) {
    logger.error('Failed to fetch table data', LogCategory.DUCKDB, error);
    throw error;
  }
}

export async function countRows(
  tableName: string,
  Duck: DuckClient,
  applyFilters: boolean
): Promise<number> {
  const filters = getFiltersMap();
  let query = `SELECT COUNT(*) as count FROM ${sqlIdentifier(tableName)}`;
  const whereClause = applyFilters
    ? buildFilterWhereClause(filters.get(tableName))
    : null;
  if (whereClause) {
    query += ` WHERE ${whereClause}`;
  }

  const result = (await Duck.query(query)) as ArrowTableLike;
  const row = result.get(0) as Record<string, unknown>;
  return Number(row?.count) || 0;
}

export async function getFilteredRowCount(
  tableName: string,
  Duck: DuckClient
): Promise<number> {
  const filters = getFiltersMap();
  const whereClause = buildFilterWhereClause(filters.get(tableName));
  const cacheKey = `${tableName}::${whereClause ?? ''}`;

  const cached = filteredRowCountCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const count = await countRows(tableName, Duck, true);
    filteredRowCountCache.set(cacheKey, count);
    return count;
  } catch (error) {
    logger.error(
      'Failed to count DuckDB table rows',
      LogCategory.DUCKDB,
      error
    );
    throw error;
  }
}

export async function getRowPosition(
  tableName: string,
  rowId: number | bigint | string,
  Duck: DuckClient,
  options?: {
    orderBy?: string | null;
    orderByType?: string | null;
    order?: 'ASC' | 'DESC' | null;
  }
): Promise<number> {
  try {
    const filters = getFiltersMap();
    const whereClause = buildFilterWhereClause(filters.get(tableName));
    const filterCondition = whereClause ? `AND ${whereClause}` : '';

    const normalizedRowId = normalizeRowId(rowId);

    if (normalizedRowId === null) {
      return -1;
    }

    if (options?.orderBy && options?.order) {
      const orderClause = buildOrderClause(
        options.orderBy,
        options.orderByType,
        options.order
      );
      const query = `
        WITH filtered_rows AS (
          SELECT *
          FROM ${sqlIdentifier(tableName)}
          ${whereClause ? `WHERE ${whereClause}` : ''}
        ),
        ordered_rows AS (
          SELECT
            ${INTERNAL_COLUMN.ID},
            ROW_NUMBER() OVER (ORDER BY ${orderClause}) - 1 AS position
          FROM filtered_rows
        )
        SELECT position
        FROM ordered_rows
        WHERE ${INTERNAL_COLUMN.ID} = ${normalizedRowId}
        LIMIT 1
      `;

      const result = (await Duck.query(query)) as ArrowTableLike;
      if (result.numRows > 0) {
        const row = result.get(0) as Record<string, unknown>;
        return Number(row.position);
      }
    } else {
      const query = `
        SELECT COUNT(*) as position
        FROM ${sqlIdentifier(tableName)}
        WHERE ${INTERNAL_COLUMN.ID} < ${normalizedRowId}
        ${filterCondition}
      `;

      const result = (await Duck.query(query)) as ArrowTableLike;
      if (result.numRows > 0) {
        const row = result.get(0);
        return Number(row.position);
      }
    }
    return -1;
  } catch (error) {
    logger.error('Error getting row position', LogCategory.DUCKDB, error);
    return -1;
  }
}

export async function getRowStats(
  tableName: string,
  Duck: DuckClient
): Promise<FilterStats> {
  const filters = getFiltersMap();
  const whereClause = buildFilterWhereClause(filters.get(tableName));

  if (whereClause) {
    const query = `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE ${whereClause}) as filtered FROM ${sqlIdentifier(tableName)}`;
    const result = (await Duck.query(query)) as ArrowTableLike;
    const row = result.get(0) as Record<string, unknown>;
    return {
      total: Number(row?.total) || 0,
      filtered: Number(row?.filtered) || 0
    };
  }

  const total = await countRows(tableName, Duck, false);
  return { total, filtered: total };
}

const ROW_IDENTITY_COLUMNS = [INTERNAL_COLUMN.ID, INTERNAL_COLUMN.FEATURE_ID];

export async function countDuplicateRows(
  tableName: string,
  Duck: DuckClient
): Promise<number> {
  const identityList = ROW_IDENTITY_COLUMNS.map(sqlString).join(', ');
  const result = (await Duck.query(
    `SELECT (SELECT COUNT(*) FROM ${sqlIdentifier(tableName)}) - (SELECT COUNT(*) FROM (SELECT DISTINCT COLUMNS(lambda c: c NOT IN (${identityList})) FROM ${sqlIdentifier(tableName)})) AS duplicates`
  )) as ArrowTableLike;
  const row = result.get(0) as Record<string, unknown>;
  return Number(row?.duplicates) || 0;
}

export interface ColumnDomain {
  min: number;
  max: number;
}

export async function getColumnDomainsInScope(
  tableName: string,
  clause: string | null,
  columns: string[],
  Duck: DuckClient
): Promise<Map<string, ColumnDomain>> {
  const domains = new Map<string, ColumnDomain>();
  if (columns.length === 0) {
    return domains;
  }

  const projections = columns
    .map((column, index) => {
      const numericRef = `TRY_CAST(${sqlIdentifier(column)} AS DOUBLE)`;
      return `MIN(${numericRef}) AS min_${index}, MAX(${numericRef}) AS max_${index}`;
    })
    .join(', ');
  const where = clause ? ` WHERE COALESCE(${clause}, FALSE)` : '';

  const result = (await Duck.query(
    `SELECT ${projections} FROM ${sqlIdentifier(tableName)}${where}`
  )) as ArrowTableLike;
  if (result.numRows === 0) {
    return domains;
  }

  const row = result.get(0) as Record<string, unknown>;
  columns.forEach((column, index) => {
    // A non-numeric column and an empty scope both aggregate to NULL, and
    // Number(null) is a finite 0 — coercing first would invent a 0..0 domain.
    const rawMin = row[`min_${index}`];
    const rawMax = row[`max_${index}`];
    if (rawMin === null || rawMax === null) {
      return;
    }

    const min = Number(rawMin);
    const max = Number(rawMax);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      domains.set(column, { min, max });
    }
  });

  return domains;
}

export interface MissingValueColumn {
  column: string;
  numeric: boolean;
}

function buildMissingValuePredicate({
  column,
  numeric
}: MissingValueColumn): string {
  const ref = sqlIdentifier(column);
  // A classed column is a number or a date: a date does not cast to DOUBLE.
  return numeric
    ? `NOT COALESCE(isfinite(TRY_CAST(${ref} AS DOUBLE)), isfinite(TRY_CAST(${ref} AS TIMESTAMP)), FALSE)`
    : `${ref} IS NULL OR trim(CAST(${ref} AS VARCHAR)) = ''`;
}

export async function getMissingValueCountsInScope(
  tableName: string,
  clause: string | null,
  columns: MissingValueColumn[],
  Duck: DuckClient
): Promise<number[]> {
  if (columns.length === 0) {
    return [];
  }

  const projections = columns
    .map(
      (column, index) =>
        `COUNT(*) FILTER (WHERE ${buildMissingValuePredicate(column)}) AS missing_${index}`
    )
    .join(', ');
  const where = clause ? ` WHERE COALESCE(${clause}, FALSE)` : '';

  const result = (await Duck.query(
    `SELECT ${projections} FROM ${sqlIdentifier(tableName)}${where}`
  )) as ArrowTableLike;
  const row = result.numRows > 0 ? result.get(0) : {};
  return columns.map((_, index) => Number(row[`missing_${index}`] ?? 0));
}

function buildScopedCountExpression(clause: string | null): string {
  return clause
    ? `COUNT(*) FILTER (WHERE COALESCE(${clause}, FALSE))`
    : 'COUNT(*)';
}

export async function getScopedRowStats(
  tableName: string,
  scopeClause: string | null,
  Duck: DuckClient
): Promise<FilterStats> {
  // The denominator a primitive filter works against is what the table filter
  // already let through, not the whole table.
  const tableClause = buildFilterWhereClause(getFiltersMap().get(tableName));
  const result = (await Duck.query(
    `SELECT ${buildScopedCountExpression(tableClause)} AS total,
            ${buildScopedCountExpression(scopeClause ?? tableClause)} AS filtered
     FROM ${sqlIdentifier(tableName)}`
  )) as ArrowTableLike;

  if (result.numRows === 0) {
    return { total: 0, filtered: 0 };
  }

  const row = result.get(0) as Record<string, unknown>;
  return {
    total: Number(row?.total) || 0,
    filtered: Number(row?.filtered) || 0
  };
}

export async function getRowIdsInScope(
  tableName: string,
  clause: string,
  Duck: DuckClient
): Promise<Set<number>> {
  const query = `SELECT ${INTERNAL_COLUMN.ID} FROM ${sqlIdentifier(tableName)} WHERE COALESCE(${clause}, FALSE)`;
  const result = (await Duck.query(query)) as ArrowTableLike;
  const rowIds = new Set<number>();

  for (let index = 0; index < result.numRows; index += 1) {
    const row = result.get(index) as Record<string, unknown>;
    const rowId = normalizeRowId(row[INTERNAL_COLUMN.ID]);
    if (rowId !== null) {
      rowIds.add(rowId);
    }
  }

  return rowIds;
}

export async function getExcludedRowIds(
  tableName: string,
  Duck: DuckClient
): Promise<number[]> {
  const filters = getFiltersMap();
  const whereClause = buildFilterWhereClause(filters.get(tableName));
  if (!whereClause) return [];

  // Treat NULL predicate results as excluded rows too.
  // Example: rows with NULL values on filtered columns should be removable
  // when deleting "excluded" rows from a filter.
  const query = `SELECT ${INTERNAL_COLUMN.ID} FROM ${sqlIdentifier(tableName)} WHERE COALESCE(NOT (${whereClause}), TRUE)`;
  const result = (await Duck.query(query)) as ArrowTableLike;
  const rowIds: number[] = [];

  for (let index = 0; index < result.numRows; index += 1) {
    const row = result.get(index) as Record<string, unknown>;
    const rowId = normalizeRowId(
      (row as Record<string, unknown>)[INTERNAL_COLUMN.ID]
    );
    if (rowId !== null) {
      rowIds.push(rowId);
    }
  }

  return rowIds;
}

export async function getFullAnalysis(
  tableName: string,
  Duck: DuckClient,
  detectSemioType: (col: AnalysisResult) => {
    semioType: AnalysisResult['semioType'];
    semioScore: number;
  },
  force = false
): Promise<AnalysisResult[]> {
  const analysis = await Duck.analyse(tableName, { force });

  return analysis.map((col) => {
    const semioResult = detectSemioType(col);
    return {
      ...col,
      semioType: semioResult.semioType,
      semioScore: semioResult.semioScore
    };
  });
}

export async function runQuery(
  query: string,
  Duck: DuckClient
): Promise<ArrowTableLike> {
  return Duck.query(query) as Promise<ArrowTableLike>;
}
