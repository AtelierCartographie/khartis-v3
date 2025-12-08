import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import type { DuckDBContext, CellSearchResult, SearchStats } from '../types';

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
    results: []
  };

  if (!searchQuery || searchQuery.trim() === '') {
    return emptyResult;
  }

  const escapedQuery = escapeSqlString(searchQuery.trim());

  try {
    // 1. Execute macro and store results in temp table
    await executeQuery(
      ctx.connection,
      `CREATE OR REPLACE TEMP TABLE __search_results AS
       FROM searchInTable('${table}', '${escapedQuery}', ${threshold})`,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
    );

    // 2. Build WHERE clause for column filter
    let whereClause = '';
    if (column) {
      const escapedColumn = escapeSqlString(column);
      whereClause = ` WHERE column_name = '${escapedColumn}'`;
    }

    // 3. Retrieve results
    const results = (await executeQuery(
      ctx.connection,
      `SELECT __id, column_name, column_value, score
       FROM __search_results${whereClause}
       ORDER BY score DESC, __id ASC`,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
    )) as Array<{
      __id: number;
      column_name: string;
      column_value: string;
      score: number;
    }>;

    // 4. Calculate counts
    const counts = (await executeQuery(
      ctx.connection,
      `SELECT
        count(*) FILTER (WHERE score = 1.0) as exact,
        count(*) FILTER (WHERE score = 0.99) as contains,
        count(*) FILTER (WHERE score < 0.99 AND score > ${threshold}) as fuzzy,
        count(*) as total
       FROM __search_results${whereClause}`,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
    )) as Array<{
      exact: number;
      contains: number;
      fuzzy: number;
      total: number;
    }>;

    const cellResults: CellSearchResult[] = results.map((r) => ({
      rowId: r.__id,
      columnName: r.column_name,
      value: r.column_value,
      score: r.score
    }));

    return {
      exactCount: Number(counts[0]?.exact ?? 0),
      containsCount: Number(counts[0]?.contains ?? 0),
      fuzzyCount: Number(counts[0]?.fuzzy ?? 0),
      totalCount: Number(counts[0]?.total ?? 0),
      results: cellResults
    };
  } catch {
    return emptyResult;
  }
}
