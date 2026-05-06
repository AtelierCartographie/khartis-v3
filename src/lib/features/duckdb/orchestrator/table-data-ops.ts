import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { GEOMETRY_COLUMN_TYPE } from '$lib/features/commons/constants';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { buildOrderClause } from '../utils/html-like-text.utils';
import type { AnalysisResult, ArrowTableLike, FilterStats } from '../types';
import { buildFilterWhereClause } from './filter-ops';
import { getFiltersMap } from './state.svelte';

export interface DuckDBClientForTableData {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  describe_table(
    tableName: string
  ): Promise<{ name: string[]; type: string[] }>;
  describeColumns(tableName: string): Promise<AnalysisResult[]>;
  analyse(
    tableName: string,
    options?: { force?: boolean }
  ): Promise<AnalysisResult[]>;
}

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
  Duck: DuckDBClientForTableData
): Promise<string> {
  try {
    const tableInfo = await Duck.describe_table(tableName);
    const geomCols = tableInfo.name.flatMap((name, index) => {
      const type = String(tableInfo.type[index] ?? '').toUpperCase();
      return type.startsWith(GEOMETRY_COLUMN_TYPE) ? [`"${name}"`] : [];
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
  Duck: DuckDBClientForTableData,
  options?: GetTableDataOptions
): Promise<ArrowTableLike> {
  try {
    const filters = getFiltersMap();
    const selectClause = await buildSelectClauseWithoutGeometry(
      tableName,
      Duck
    );

    const escapedTableName = escapeIdentifier(tableName);
    let query = `SELECT ${selectClause} FROM "${escapedTableName}"`;
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
    logger.warn('Error getting table data', LogCategory.DUCKDB, error);
    return { numRows: 0, get: () => ({}), toArray: () => [] };
  }
}

export async function countRows(
  tableName: string,
  Duck: DuckDBClientForTableData,
  applyFilters: boolean
): Promise<number> {
  const filters = getFiltersMap();
  const escapedTableName = escapeIdentifier(tableName);
  let query = `SELECT COUNT(*) as count FROM "${escapedTableName}"`;
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

export async function getRowCount(
  tableName: string,
  Duck: DuckDBClientForTableData
): Promise<number> {
  try {
    return await countRows(tableName, Duck, true);
  } catch (error) {
    logger.warn('Error getting row count', LogCategory.DUCKDB, error);
    return 0;
  }
}

export async function getRowPosition(
  tableName: string,
  rowId: number | bigint | string,
  Duck: DuckDBClientForTableData,
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
      logger.debug('Invalid rowId for getRowPosition', LogCategory.DUCKDB, {
        rowId
      });
      return -1;
    }

    const escapedTable = escapeIdentifier(tableName);

    if (options?.orderBy && options?.order) {
      const orderClause = buildOrderClause(
        options.orderBy,
        options.orderByType,
        options.order
      );
      const query = `
        WITH filtered_rows AS (
          SELECT *
          FROM "${escapedTable}"
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
        FROM "${escapedTable}"
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
  Duck: DuckDBClientForTableData
): Promise<FilterStats> {
  const filters = getFiltersMap();
  const whereClause = buildFilterWhereClause(filters.get(tableName));

  if (whereClause) {
    const escapedTable = escapeIdentifier(tableName);
    const query = `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE ${whereClause}) as filtered FROM "${escapedTable}"`;
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

export async function getExcludedRowIds(
  tableName: string,
  Duck: DuckDBClientForTableData
): Promise<number[]> {
  const filters = getFiltersMap();
  const whereClause = buildFilterWhereClause(filters.get(tableName));
  if (!whereClause) return [];

  const escapedTable = escapeIdentifier(tableName);
  // Treat NULL predicate results as excluded rows too.
  // Example: rows with NULL values on filtered columns should be removable
  // when deleting "excluded" rows from a filter.
  const query = `SELECT ${INTERNAL_COLUMN.ID} FROM "${escapedTable}" WHERE COALESCE(NOT (${whereClause}), TRUE)`;
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

export async function analyzeTable(
  tableName: string,
  Duck: DuckDBClientForTableData
): Promise<Record<string, unknown>[]> {
  const escapedTableNameForColumns = escapeSqlString(tableName);
  const result = (await Duck.query(`
    SELECT
      column_name as name,
      data_type as type
    FROM duckdb_columns()
    WHERE table_name = '${escapedTableNameForColumns}'
  `)) as ArrowTableLike;

  const columns = [];
  for (let i = 0; i < result.numRows; i++) {
    columns.push(result.get(i));
  }
  return columns;
}

export async function getBasicColumnInfo(
  tableName: string,
  Duck: DuckDBClientForTableData
): Promise<AnalysisResult[]> {
  return Duck.describeColumns(tableName);
}

export async function getFullAnalysis(
  tableName: string,
  Duck: DuckDBClientForTableData,
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
  Duck: DuckDBClientForTableData
): Promise<ArrowTableLike> {
  return Duck.query(query) as Promise<ArrowTableLike>;
}
