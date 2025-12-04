import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import type {
  DuckDBContext,
  SearchResultWithScore,
  SearchStats
} from '../types';

export async function searchInTable(
  ctx: DuckDBContext,
  table: string,
  searchQuery: string,
  options: { threshold?: number; column?: string } = {}
): Promise<SearchStats> {
  const { threshold = 0.6, column = null } = options;
  const emptyResult: SearchStats = {
    exactCount: 0,
    partialCount: 0,
    results: []
  };

  if (!searchQuery || searchQuery.trim() === '') {
    return emptyResult;
  }

  const escapedQuery = escapeSqlString(searchQuery.trim());
  const excludedColumns = ['geom', 'geometry'];

  try {
    const describeResult = (await executeQuery(
      ctx.connection,
      `DESCRIBE "${table}"`,
      {
        format: DUCK_CONST.QUERY_FORMAT.ARRAY
      }
    )) as Array<{ column_name: string; column_type: string }>;

    const allColumns = describeResult
      .filter(
        (c) =>
          !c.column_name.startsWith('__') &&
          !excludedColumns.includes(c.column_name.toLowerCase())
      )
      .map((c) => ({
        column_name: c.column_name,
        data_type: c.column_type
      }));

    const textTypes = ['VARCHAR', 'TEXT', 'STRING'];
    let textColumns = allColumns.filter((c) =>
      textTypes.includes(c.data_type.toUpperCase())
    );

    if (column) {
      const escapedColumn = escapeSqlString(column);
      textColumns = textColumns.filter((c) => c.column_name === escapedColumn);
    }

    if (textColumns.length === 0) {
      return emptyResult;
    }

    const scoreExpressions = textColumns.map(
      ({ column_name }) =>
        `jaro_winkler_similarity(normalize_text("${column_name}"::VARCHAR), normalize_text('${escapedQuery}'))`
    );

    const greatestExpr = `GREATEST(${scoreExpressions.join(', ')})`;

    const columnCases = textColumns
      .map(
        ({ column_name }, idx) =>
          `WHEN ${scoreExpressions[idx]} = ${greatestExpr} THEN '${column_name}'`
      )
      .join('\n            ');

    const sql = `
      SELECT
        __id AS id,
        ${greatestExpr} AS score,
        CASE
          ${columnCases}
          ELSE '${textColumns[0].column_name}'
        END AS matched_column
      FROM "${table}"
      WHERE ${greatestExpr} >= ${threshold}
      ORDER BY score DESC, id ASC
    `;

    const result = (await executeQuery(ctx.connection, sql, {
      format: DUCK_CONST.QUERY_FORMAT.ARRAY
    })) as Array<{ id: number; score: number; matched_column: string }>;

    const results: SearchResultWithScore[] = result.map((r) => ({
      id: r.id,
      score: r.score,
      column: r.matched_column
    }));

    const exactCount = results.filter((r) => r.score === 1).length;
    const partialCount = results.filter((r) => r.score < 1).length;

    return {
      exactCount,
      partialCount,
      results
    };
  } catch {
    return emptyResult;
  }
}
