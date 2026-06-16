import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import {
  buildDecimalLikeConditionSql,
  buildNormalizedNumericTextSql
} from '$lib/features/commons/utils/numeric-format.utils';

const MIN_NON_EMPTY_VALUES = 2;
const INTERNAL_COLUMNS = new Set(['_row_id']);

interface DuckQueryClient {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
}

interface DescribeRow {
  name?: string;
  type?: string;
  type_simple?: string;
}

interface ColumnNormalizationStatsRow {
  non_empty_count?: number | string;
  convertible_count?: number | string;
  formatted_count?: number | string;
  decimal_like_count?: number | string;
}

function isStringColumn(column: DescribeRow): boolean {
  const simplifiedType = String(column.type_simple ?? '').toLowerCase();
  const rawType = String(column.type ?? '').toLowerCase();
  return (
    simplifiedType === 'string' ||
    rawType.includes('varchar') ||
    rawType.includes('text')
  );
}

function toCount(value: unknown): number {
  return Number(value ?? 0);
}

export async function normalizeFormattedNumericColumns(
  tableName: string,
  duck: DuckQueryClient
): Promise<string[]> {
  const escapedTableString = escapeSqlString(tableName);
  const escapedTableIdentifier = escapeIdentifier(tableName);

  const described = (await duck.query(
    `FROM describe_full('${escapedTableString}')`,
    { format: 'array' }
  )) as DescribeRow[];

  const candidateColumns = described
    .filter(
      (column) =>
        column.name &&
        !INTERNAL_COLUMNS.has(column.name) &&
        isStringColumn(column)
    )
    .map((column) => column.name as string);

  if (candidateColumns.length === 0) {
    return [];
  }

  const convertedColumns: string[] = [];

  for (const columnName of candidateColumns) {
    const escapedColumn = escapeIdentifier(columnName);
    const rawValueExpr = `trim("${escapedColumn}"::VARCHAR)`;
    const normalizedNumericText = buildNormalizedNumericTextSql(rawValueExpr);
    const decimalLikeCondition = buildDecimalLikeConditionSql(rawValueExpr);

    const statsResult = (await duck.query(
      `SELECT
        COUNT(*) FILTER (WHERE ${rawValueExpr} <> '') AS non_empty_count,
        COUNT(*) FILTER (
          WHERE ${rawValueExpr} <> ''
            AND TRY_CAST(${normalizedNumericText} AS DOUBLE) IS NOT NULL
        ) AS convertible_count,
        COUNT(*) FILTER (
          WHERE ${rawValueExpr} <> ''
            AND regexp_matches(${rawValueExpr}, '[,. ]')
        ) AS formatted_count,
        COUNT(*) FILTER (
          WHERE ${rawValueExpr} <> ''
            AND (${decimalLikeCondition})
        ) AS decimal_like_count
      FROM "${escapedTableIdentifier}"`,
      { format: 'array' }
    )) as ColumnNormalizationStatsRow[];

    const stats = statsResult[0] ?? {};
    const nonEmptyCount = toCount(stats.non_empty_count);
    const convertibleCount = toCount(stats.convertible_count);
    const formattedCount = toCount(stats.formatted_count);
    const decimalLikeCount = toCount(stats.decimal_like_count);

    if (
      nonEmptyCount < MIN_NON_EMPTY_VALUES ||
      formattedCount === 0 ||
      convertibleCount !== nonEmptyCount
    ) {
      continue;
    }

    const targetType = decimalLikeCount > 0 ? 'DOUBLE' : 'BIGINT';

    await duck.query(
      `ALTER TABLE "${escapedTableIdentifier}"
        ALTER COLUMN "${escapedColumn}" SET DATA TYPE ${targetType}
        USING TRY_CAST(${normalizedNumericText} AS ${targetType})`
    );

    convertedColumns.push(columnName);
  }

  return convertedColumns;
}
