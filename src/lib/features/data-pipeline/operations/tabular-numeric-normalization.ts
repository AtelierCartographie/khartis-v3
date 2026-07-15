import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import {
  buildDecimalLikeConditionSql,
  buildNormalizedNumericTextSql
} from '$lib/features/commons/utils/numeric-format.utils';

const MIN_NON_EMPTY_VALUES = 2;
const INTERNAL_COLUMNS: Set<string> = new Set([INTERNAL_COLUMN.ID]);
const MIN_CONVERSIONS_FOR_TABLE_REWRITE = 2;

interface DuckQueryClient {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  invalidateTableCache?(tableName: string): void;
}

interface DescribeRow {
  name?: string;
  type?: string;
  type_simple?: string;
}

interface ColumnConversion {
  name: string;
  targetType: 'DOUBLE' | 'BIGINT';
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

function buildRawValueExpr(columnName: string): string {
  return `trim("${escapeIdentifier(columnName)}"::VARCHAR)`;
}

function buildConvertibilityCountersSql(
  columnName: string,
  index: number
): string {
  const rawValueExpr = buildRawValueExpr(columnName);
  const normalizedNumericText = buildNormalizedNumericTextSql(rawValueExpr);
  const decimalLikeCondition = buildDecimalLikeConditionSql(rawValueExpr);

  return `
    COUNT(*) FILTER (WHERE ${rawValueExpr} <> '') AS non_empty_${index},
    COUNT(*) FILTER (
      WHERE ${rawValueExpr} <> ''
        AND TRY_CAST(${normalizedNumericText} AS DOUBLE) IS NOT NULL
    ) AS convertible_${index},
    COUNT(*) FILTER (
      WHERE ${rawValueExpr} <> ''
        AND regexp_matches(${rawValueExpr}, '[,. ]')
    ) AS formatted_${index},
    COUNT(*) FILTER (
      WHERE ${rawValueExpr} <> ''
        AND (${decimalLikeCondition})
    ) AS decimal_like_${index}`;
}

function buildConversionCastSql(conversion: ColumnConversion): string {
  const rawValueExpr = buildRawValueExpr(conversion.name);
  const normalizedNumericText = buildNormalizedNumericTextSql(rawValueExpr);
  return `TRY_CAST(${normalizedNumericText} AS ${conversion.targetType})`;
}

function selectEligibleConversions(
  candidateColumns: string[],
  stats: Record<string, unknown>
): ColumnConversion[] {
  const conversions: ColumnConversion[] = [];

  candidateColumns.forEach((columnName, index) => {
    const nonEmptyCount = toCount(stats[`non_empty_${index}`]);
    const convertibleCount = toCount(stats[`convertible_${index}`]);
    const formattedCount = toCount(stats[`formatted_${index}`]);
    const decimalLikeCount = toCount(stats[`decimal_like_${index}`]);

    if (
      nonEmptyCount < MIN_NON_EMPTY_VALUES ||
      formattedCount === 0 ||
      convertibleCount !== nonEmptyCount
    ) {
      return;
    }

    conversions.push({
      name: columnName,
      targetType: decimalLikeCount > 0 ? 'DOUBLE' : 'BIGINT'
    });
  });

  return conversions;
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

  const candidateColumns: string[] = [];
  for (const column of described) {
    if (
      column.name &&
      !INTERNAL_COLUMNS.has(column.name) &&
      isStringColumn(column)
    ) {
      candidateColumns.push(column.name);
    }
  }

  if (candidateColumns.length === 0) {
    return [];
  }

  const countersSelect = candidateColumns
    .map((columnName, index) =>
      buildConvertibilityCountersSql(columnName, index)
    )
    .join(',');

  const statsResult = (await duck.query(
    `SELECT ${countersSelect} FROM "${escapedTableIdentifier}"`,
    { format: 'array' }
  )) as Array<Record<string, unknown>>;

  const conversions = selectEligibleConversions(
    candidateColumns,
    statsResult[0] ?? {}
  );

  if (conversions.length === 0) {
    return [];
  }

  if (conversions.length >= MIN_CONVERSIONS_FOR_TABLE_REWRITE) {
    const replaceList = conversions
      .map(
        (conversion) =>
          `${buildConversionCastSql(conversion)} AS "${escapeIdentifier(conversion.name)}"`
      )
      .join(', ');

    await duck.query(
      `CREATE OR REPLACE TABLE "${escapedTableIdentifier}" AS
        SELECT * REPLACE (${replaceList})
        FROM "${escapedTableIdentifier}"`
    );
  } else {
    const [conversion] = conversions;

    await duck.query(
      `ALTER TABLE "${escapedTableIdentifier}"
        ALTER COLUMN "${escapeIdentifier(conversion.name)}" SET DATA TYPE ${conversion.targetType}
        USING ${buildConversionCastSql(conversion)}`
    );
  }

  duck.invalidateTableCache?.(tableName);

  return conversions.map((conversion) => conversion.name);
}
