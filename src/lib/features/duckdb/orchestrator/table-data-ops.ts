import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import type { AnalysisResult, ArrowTableLike, FilterStats } from '../types';
import { buildFilterWhereClause } from './filter-ops';
import { getFiltersMap } from './state.svelte';

export interface DuckDBClientForTableData {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
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
  order?: 'ASC' | 'DESC' | null;
}

export async function getTableData(
  tableName: string,
  Duck: DuckDBClientForTableData,
  options?: GetTableDataOptions
): Promise<ArrowTableLike> {
  try {
    const filters = getFiltersMap();

    let selectClause = '*';
    try {
      const columns = await Duck.describeColumns(tableName);
      const geomCols = columns
        .filter(
          (c) =>
            String(c.type || '').toUpperCase() === 'GEOMETRY' ||
            String(c.type_simple || '') === 'geometry'
        )
        .map((c) => `"${c.name}"`);
      if (geomCols.length > 0) {
        selectClause = `* EXCLUDE (${geomCols.join(', ')})`;
      }
    } catch {
      /* fallback to SELECT * */
    }

    let query = `SELECT ${selectClause} FROM "${tableName}"`;
    const whereClause = buildFilterWhereClause(filters.get(tableName));
    if (whereClause) {
      query += ` WHERE ${whereClause}`;
    }

    if (options?.orderBy && options?.order) {
      query += ` ORDER BY "${options.orderBy}" ${options.order}`;
    }

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    if (options?.offset) {
      query += ` OFFSET ${options.offset}`;
    }

    return (await Duck.query(query)) as ArrowTableLike;
  } catch (error) {
    logger.error('Error getting table data', LogCategory.DUCKDB, error);
    return { numRows: 0, get: () => ({}), toArray: () => [] };
  }
}

export async function countRows(
  tableName: string,
  Duck: DuckDBClientForTableData,
  applyFilters: boolean
): Promise<number> {
  const filters = getFiltersMap();
  let query = `SELECT COUNT(*) as count FROM "${tableName}"`;
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
    logger.error('Error getting row count', LogCategory.DUCKDB, error);
    return 0;
  }
}

export async function getRowPosition(
  tableName: string,
  rowId: number,
  Duck: DuckDBClientForTableData,
  options?: {
    orderBy?: string | null;
    order?: 'ASC' | 'DESC' | null;
  }
): Promise<number> {
  try {
    const filters = getFiltersMap();
    const whereClause = buildFilterWhereClause(filters.get(tableName));
    const filterCondition = whereClause ? `AND ${whereClause}` : '';

    if (options?.orderBy && options?.order) {
      const sortCol = `"${options.orderBy}"`;
      const isAsc = options.order === 'ASC';

      // Count rows that sort before the target row
      const query = `
        WITH target AS (
          SELECT ${sortCol} as sort_val FROM "${tableName}" WHERE __id = ${rowId}
        )
        SELECT COUNT(*) as position
        FROM "${tableName}", target
        WHERE (
          ${sortCol} ${isAsc ? '<' : '>'} target.sort_val
          OR (${sortCol} = target.sort_val AND __id ${isAsc ? '<' : '>'} ${rowId})
        )
        ${filterCondition}
      `;

      const result = (await Duck.query(query)) as ArrowTableLike;
      if (result.numRows > 0) {
        const row = result.get(0);
        return Number(row.position);
      }
    } else {
      const query = `
        SELECT COUNT(*) as position
        FROM "${tableName}"
        WHERE __id < ${rowId}
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
    const query = `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE ${whereClause}) as filtered FROM "${tableName}"`;
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

  const query = `SELECT __id FROM "${tableName}" WHERE NOT (${whereClause})`;
  const result = (await Duck.query(query)) as ArrowTableLike;

  const ids: number[] = [];
  for (let i = 0; i < result.numRows; i++) {
    const row = result.get(i) as { __id: number };
    ids.push(row.__id);
  }
  return ids;
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
