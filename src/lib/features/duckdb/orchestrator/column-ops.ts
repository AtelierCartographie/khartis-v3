import { DuckDBError } from '$lib/features/commons/pipeline.errors';
import * as m from '$lib/paraglide/messages';
import {
  RefineOperation,
  type AnalysisResult,
  type ArrowTableLike
} from '../types';
import { SQL_FUNCTIONS } from '../constants';
import { buildNormalizedNumericTextSql } from '$lib/features/commons/utils/numeric-format.utils';
import {
  buildTextDateExpression,
  resolveBestTextDateFormat
} from '../io/text-dates';
import {
  sqlIdentifier,
  sqlString
} from '$lib/features/commons/utils/sql.utils';

export interface DuckDBClient {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  analyse(
    tableName: string,
    options?: { force?: boolean }
  ): Promise<AnalysisResult[]>;
  drop_rows(tableName: string, rowIds: number[]): Promise<void>;
}

const ALLOWED_COLUMN_TYPES = new Set([
  'VARCHAR',
  'TEXT',
  'STRING',
  'INTEGER',
  'INT',
  'INT4',
  'SIGNED',
  'BIGINT',
  'INT8',
  'LONG',
  'SMALLINT',
  'INT2',
  'SHORT',
  'TINYINT',
  'INT1',
  'DOUBLE',
  'FLOAT8',
  'NUMERIC',
  'DECIMAL',
  'REAL',
  'FLOAT',
  'FLOAT4',
  'BOOLEAN',
  'BOOL',
  'LOGICAL',
  'DATE',
  'TIMESTAMP',
  'TIMESTAMP WITH TIME ZONE',
  'TIME',
  'INTERVAL',
  'HUGEINT',
  'UHUGEINT',
  'UBIGINT',
  'UINTEGER',
  'USMALLINT',
  'UTINYINT',
  'BLOB',
  'BYTEA',
  'BINARY',
  'VARBINARY',
  'UUID',
  'JSON'
]);

const NUMERIC_COLUMN_TYPES = new Set([
  'INTEGER',
  'INT',
  'INT4',
  'SIGNED',
  'BIGINT',
  'INT8',
  'LONG',
  'SMALLINT',
  'INT2',
  'SHORT',
  'TINYINT',
  'INT1',
  'DOUBLE',
  'FLOAT8',
  'NUMERIC',
  'DECIMAL',
  'REAL',
  'FLOAT',
  'FLOAT4',
  'HUGEINT',
  'UHUGEINT',
  'UBIGINT',
  'UINTEGER',
  'USMALLINT',
  'UTINYINT'
]);

const DECIMAL_TYPE_PATTERN = /^DECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\)$/i;

function isSupportedColumnType(type: string): boolean {
  return ALLOWED_COLUMN_TYPES.has(type) || DECIMAL_TYPE_PATTERN.test(type);
}

function isNumericColumnType(type: string): boolean {
  return NUMERIC_COLUMN_TYPES.has(type) || DECIMAL_TYPE_PATTERN.test(type);
}

async function maybeAnalyse(
  tableName: string,
  Duck: DuckDBClient,
  options?: { skipAnalysis?: boolean }
): Promise<void> {
  if (options?.skipAnalysis) return;
  await Duck.analyse(tableName, { force: true });
}

export async function renameColumn(
  tableName: string,
  oldName: string,
  newName: string,
  Duck: DuckDBClient,
  options?: { skipAnalysis?: boolean }
): Promise<void> {
  await Duck.query(
    `ALTER TABLE ${sqlIdentifier(tableName)} RENAME COLUMN ${sqlIdentifier(oldName)} TO ${sqlIdentifier(newName)}`
  );

  await maybeAnalyse(tableName, Duck, options);
}

export interface ChangeColumnTypeResult {
  /**
   * Number of originally non-empty values that became NULL because they could
   * not be cast to the new type. Lets the interactive caller warn the user
   * about silent data loss.
   */
  invalidatedCount: number;
}

// ISO strings cast directly; other layouts (day-first, year-month, a bare
// year) go through the format most of the column's values parse with.
async function buildDateCastExpression(
  tableName: string,
  columnName: string,
  targetType: 'DATE' | 'TIMESTAMP',
  Duck: DuckDBClient
): Promise<string> {
  const ref = sqlIdentifier(columnName);
  const format = await resolveBestTextDateFormat(
    async (sql) =>
      ((await Duck.query(sql, { format: 'array' })) ?? []) as Record<
        string,
        unknown
      >[],
    tableName,
    columnName
  );
  const candidates = [
    `TRY_CAST(${ref} AS ${targetType})`,
    ...(format
      ? [`${buildTextDateExpression(ref, format)}::${targetType}`]
      : []),
    `${buildTextDateExpression(ref, { pattern: '%Y', hasTime: false })}::${targetType}`
  ];
  return `COALESCE(${candidates.join(', ')})`;
}

export async function changeColumnType(
  tableName: string,
  columnName: string,
  newType: string,
  Duck: DuckDBClient,
  options?: { skipAnalysis?: boolean }
): Promise<ChangeColumnTypeResult> {
  const normalizedType = newType.trim().toUpperCase();
  if (!isSupportedColumnType(normalizedType)) {
    throw new DuckDBError(m.error_unsupported_column_type({ newType }));
  }

  // Numeric targets normalize locale-formatted strings (comma decimals,
  // thousands separators) before casting; other targets cast as-is. Every
  // target uses TRY_CAST so unparsable values become NULL instead of failing
  // the whole statement (the #166 contract).
  const usingExpr = isNumericColumnType(normalizedType)
    ? buildNormalizedNumericTextSql(
        `trim(${sqlIdentifier(columnName)}::VARCHAR)`
      )
    : sqlIdentifier(columnName);
  const castExpr =
    normalizedType === 'DATE' || normalizedType === 'TIMESTAMP'
      ? await buildDateCastExpression(
          tableName,
          columnName,
          normalizedType,
          Duck
        )
      : `TRY_CAST(${usingExpr} AS ${normalizedType})`;

  const invalidatedResult = (await Duck.query(
    `SELECT COUNT(*) FILTER (
       WHERE ${sqlIdentifier(columnName)} IS NOT NULL
         AND trim(${sqlIdentifier(columnName)}::VARCHAR) <> ''
         AND ${castExpr} IS NULL
     ) AS invalidated
     FROM ${sqlIdentifier(tableName)}`,
    { format: 'array' }
  )) as Array<{ invalidated?: number | bigint }> | undefined;
  const invalidatedCount = Number(invalidatedResult?.[0]?.invalidated ?? 0);

  await Duck.query(
    `ALTER TABLE ${sqlIdentifier(tableName)} ALTER COLUMN ${sqlIdentifier(columnName)} SET DATA TYPE ${normalizedType} USING ${castExpr}`
  );

  await maybeAnalyse(tableName, Duck, options);

  return { invalidatedCount };
}

export async function dropColumn(
  tableName: string,
  columnName: string,
  Duck: DuckDBClient,
  options?: { skipAnalysis?: boolean }
): Promise<void> {
  await Duck.query(
    `ALTER TABLE ${sqlIdentifier(tableName)} DROP COLUMN ${sqlIdentifier(columnName)}`
  );

  await maybeAnalyse(tableName, Duck, options);
}

export async function dropRows(
  tableName: string,
  rowIds: number[],
  Duck: DuckDBClient,
  options?: { skipAnalysis?: boolean }
): Promise<void> {
  if (!rowIds.length) return;

  await Duck.drop_rows(tableName, rowIds);
  await maybeAnalyse(tableName, Duck, options);
}

export async function refineColumn(
  tableName: string,
  columnName: string,
  operation: RefineOperation,
  Duck: DuckDBClient,
  options?: { skipAnalysis?: boolean }
): Promise<void> {
  const operations: Record<RefineOperation, string> = {
    [RefineOperation.UPPERCASE]: `UPDATE ${sqlIdentifier(tableName)} SET ${sqlIdentifier(columnName)} = UPPER(${sqlIdentifier(columnName)})`,
    [RefineOperation.LOWERCASE]: `UPDATE ${sqlIdentifier(tableName)} SET ${sqlIdentifier(columnName)} = LOWER(${sqlIdentifier(columnName)})`,
    [RefineOperation.TITLECASE]: `UPDATE ${sqlIdentifier(tableName)} SET ${sqlIdentifier(columnName)} = CASE
      WHEN ${sqlIdentifier(columnName)} IS NULL THEN NULL
      ELSE array_to_string(
        list_transform(
          string_split(lower(${sqlIdentifier(columnName)}::VARCHAR), ' '),
          x -> CASE
            WHEN x = '' THEN x
            ELSE upper(substr(x, 1, 1)) || substr(x, 2)
          END
        ),
        ' '
      )
    END`,
    [RefineOperation.TRIM]: `UPDATE ${sqlIdentifier(tableName)} SET ${sqlIdentifier(columnName)} = TRIM(${sqlIdentifier(columnName)})`,
    [RefineOperation.TRIM_ALL]: `UPDATE ${sqlIdentifier(tableName)} SET ${sqlIdentifier(columnName)} = REGEXP_REPLACE(${sqlIdentifier(columnName)}, '\\s+', ' ', 'g')`
  };

  await Duck.query(operations[operation]);

  await maybeAnalyse(tableName, Duck, options);
}

export async function replaceInColumn(
  tableName: string,
  columnName: string,
  searchValue: string,
  replaceValue: string,
  Duck: DuckDBClient,
  options?: { skipAnalysis?: boolean }
): Promise<number> {
  const normResult = (await Duck.query(
    `SELECT normalize_raw_text(${sqlString(searchValue)}) as norm`,
    { format: 'array' }
  )) as Array<{ norm: string }>;
  const normalizedSearch = normResult?.[0]?.norm ?? '';

  const exactMatchCondition = `normalize_raw_text(${sqlIdentifier(columnName)}::VARCHAR) = ${sqlString(normalizedSearch)}`;

  const countResult = (await Duck.query(
    `SELECT COUNT(*) as count FROM ${sqlIdentifier(tableName)} WHERE ${exactMatchCondition}`
  )) as ArrowTableLike;

  const countRow = countResult.get(0) as Record<string, unknown>;
  const count = Number(countRow?.count) || 0;

  if (count > 0) {
    await Duck.query(
      `UPDATE ${sqlIdentifier(tableName)} SET ${sqlIdentifier(columnName)} = ${sqlString(replaceValue)} WHERE ${exactMatchCondition}`
    );

    if (!options?.skipAnalysis) {
      await Duck.analyse(tableName, { force: true });
    }
  }

  return count;
}

const BLOCKED_KEYWORDS = [
  'DROP',
  'DELETE',
  'INSERT',
  'UPDATE',
  'ALTER',
  'CREATE',
  'ATTACH',
  'COPY',
  'EXPORT',
  'INSTALL',
  'LOAD',
  'PRAGMA',
  'CALL',
  'EXECUTE',
  'EXEC',
  'SELECT',
  'FROM',
  'UNION',
  'JOIN',
  'INTO',
  'GRANT',
  'REVOKE',
  'TRUNCATE',
  'MERGE'
];

const BLOCKED_PATTERN = new RegExp(
  `\\b(${BLOCKED_KEYWORDS.join('|')})\\b`,
  'i'
);

const BLOCKED_FUNCTIONS = [
  SQL_FUNCTIONS.READ_CSV,
  SQL_FUNCTIONS.READ_CSV_AUTO,
  SQL_FUNCTIONS.READ_PARQUET,
  'read_json',
  'read_json_auto',
  'read_text',
  'read_blob',
  'read_ndjson',
  'read_ndjson_auto',
  'scan_parquet',
  'parquet_scan',
  'parquet_metadata',
  'parquet_schema',
  'parquet_kv_metadata',
  'iceberg_scan',
  'delta_scan',
  'glob',
  'list_files',
  'query_table',
  'query',
  'sniff_csv',
  'st_read',
  'st_drivers',
  'current_setting',
  'getenv'
];

const BLOCKED_FUNCTIONS_PATTERN = new RegExp(
  `\\b(${BLOCKED_FUNCTIONS.join('|')})\\s*\\(`,
  'i'
);

export function validateExpression(expression: string): void {
  if (!expression.trim()) {
    throw new DuckDBError(m.error_expression_empty());
  }

  if (expression.includes(';')) {
    throw new DuckDBError(m.error_calc_expression_forbidden_semicolon());
  }

  // Strip string literals before checking for blocked keywords
  // so that 'FROM PARIS' inside a string doesn't trigger false positives
  const stripped = expression.replace(/'[^']*'/g, "''");

  if (/\([\s]*SELECT\b/i.test(stripped)) {
    throw new DuckDBError(
      m.error_calc_expression_forbidden_keyword({ keyword: 'SUBQUERY' })
    );
  }

  const match = stripped.match(BLOCKED_PATTERN);
  if (match) {
    throw new DuckDBError(
      m.error_calc_expression_forbidden_keyword({
        keyword: match[1].toUpperCase()
      })
    );
  }

  const funcMatch = stripped.match(BLOCKED_FUNCTIONS_PATTERN);
  if (funcMatch) {
    throw new DuckDBError(
      m.error_calc_expression_forbidden_keyword({
        keyword: funcMatch[1].toUpperCase()
      })
    );
  }
}

export async function addCalculatedColumn(
  tableName: string,
  columnName: string,
  expression: string,
  Duck: DuckDBClient,
  options?: { skipAnalysis?: boolean }
): Promise<AnalysisResult[]> {
  const trimmedName = columnName.trim();
  if (!trimmedName) {
    throw new DuckDBError(m.error_invalid_column_name_calc());
  }

  validateExpression(expression);

  const columns = await Duck.analyse(tableName);
  if (columns.some((col: AnalysisResult) => col.name === trimmedName)) {
    throw new DuckDBError(
      m.error_calc_column_exists({ column: trimmedName }),
      undefined,
      { tableName, columnName: trimmedName }
    );
  }

  await Duck.query(
    `CREATE OR REPLACE TABLE ${sqlIdentifier(tableName)} AS SELECT *, (${expression}) AS ${sqlIdentifier(trimmedName)} FROM ${sqlIdentifier(tableName)}`
  );

  const updatedColumns = options?.skipAnalysis
    ? columns
    : await Duck.analyse(tableName, { force: true });

  return updatedColumns;
}

export async function testExpression(
  tableName: string,
  expression: string,
  Duck: DuckDBClient
): Promise<unknown> {
  validateExpression(expression);

  const result = (await Duck.query(
    `SELECT (${expression}) as result FROM ${sqlIdentifier(tableName)} LIMIT 1`
  )) as ArrowTableLike;

  if (result.numRows === 0) {
    return null;
  }

  const row = result.get(0) as Record<string, unknown>;
  return row?.result ?? null;
}
