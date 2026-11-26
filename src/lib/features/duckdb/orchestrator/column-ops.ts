import { DuckDBError } from '$lib/features/commons/pipeline.errors';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import * as m from '$lib/paraglide/messages';
import {
  type AnalysisResult,
  type ArrowTableLike,
  RefineOperation
} from '../types';
import { SQL_FUNCTIONS } from '../constants';
import { buildNormalizedNumericTextSql } from '$lib/features/commons/utils/numeric-format.utils';
import {
  buildTextDateExpression,
  resolveBestTextDateFormat
} from '../io/text-dates';

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
  const escapedTable = escapeIdentifier(tableName);
  const escapedOld = escapeIdentifier(oldName);
  const escapedNew = escapeIdentifier(newName);

  await Duck.query(
    `ALTER TABLE "${escapedTable}" RENAME COLUMN "${escapedOld}" TO "${escapedNew}"`
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
  const ref = `"${escapeIdentifier(columnName)}"`;
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
  const escapedTable = escapeIdentifier(tableName);
  const escapedCol = escapeIdentifier(columnName);

  const normalizedType = newType.trim().toUpperCase();
  if (!isSupportedColumnType(normalizedType)) {
    throw new DuckDBError(m.error_unsupported_column_type({ newType }));
  }

  // Numeric targets normalize locale-formatted strings (comma decimals,
  // thousands separators) before casting; other targets cast as-is. Every
  // target uses TRY_CAST so unparsable values become NULL instead of failing
  // the whole statement (the #166 contract).
  const usingExpr = isNumericColumnType(normalizedType)
    ? buildNormalizedNumericTextSql(`trim("${escapedCol}"::VARCHAR)`)
    : `"${escapedCol}"`;
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
       WHERE "${escapedCol}" IS NOT NULL
         AND trim("${escapedCol}"::VARCHAR) <> ''
         AND ${castExpr} IS NULL
     ) AS invalidated
     FROM "${escapedTable}"`,
    { format: 'array' }
  )) as Array<{ invalidated?: number | bigint }> | undefined;
  const invalidatedCount = Number(invalidatedResult?.[0]?.invalidated ?? 0);

  await Duck.query(
    `ALTER TABLE "${escapedTable}" ALTER COLUMN "${escapedCol}" SET DATA TYPE ${normalizedType} USING ${castExpr}`
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
  const escapedTable = escapeIdentifier(tableName);
  const escapedCol = escapeIdentifier(columnName);

  await Duck.query(`ALTER TABLE "${escapedTable}" DROP COLUMN "${escapedCol}"`);

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
  const escapedTable = escapeIdentifier(tableName);
  const escapedCol = escapeIdentifier(columnName);

  const operations: Record<RefineOperation, string> = {
    [RefineOperation.UPPERCASE]: `UPDATE "${escapedTable}" SET "${escapedCol}" = UPPER("${escapedCol}")`,
    [RefineOperation.LOWERCASE]: `UPDATE "${escapedTable}" SET "${escapedCol}" = LOWER("${escapedCol}")`,
    [RefineOperation.TITLECASE]: `UPDATE "${escapedTable}" SET "${escapedCol}" = CASE
      WHEN "${escapedCol}" IS NULL THEN NULL
      ELSE array_to_string(
        list_transform(
          string_split(lower("${escapedCol}"::VARCHAR), ' '),
          x -> CASE
            WHEN x = '' THEN x
            ELSE upper(substr(x, 1, 1)) || substr(x, 2)
          END
        ),
        ' '
      )
    END`,
    [RefineOperation.TRIM]: `UPDATE "${escapedTable}" SET "${escapedCol}" = TRIM("${escapedCol}")`,
    [RefineOperation.TRIM_ALL]: `UPDATE "${escapedTable}" SET "${escapedCol}" = REGEXP_REPLACE("${escapedCol}", '\\s+', ' ', 'g')`
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
  const escapedTable = escapeIdentifier(tableName);
  const escapedCol = escapeIdentifier(columnName);
  const escapedSearchValue = escapeSqlString(searchValue);
  const escapedReplaceValue = escapeSqlString(replaceValue);

  const normResult = (await Duck.query(
    `SELECT normalize_raw_text('${escapedSearchValue}') as norm`,
    { format: 'array' }
  )) as Array<{ norm: string }>;
  const normalizedSearch = normResult?.[0]?.norm ?? '';

  const exactMatchCondition = `normalize_raw_text("${escapedCol}"::VARCHAR) = '${escapeSqlString(normalizedSearch)}'`;

  const countResult = (await Duck.query(
    `SELECT COUNT(*) as count FROM "${escapedTable}" WHERE ${exactMatchCondition}`
  )) as ArrowTableLike;

  const countRow = countResult.get(0) as Record<string, unknown>;
  const count = Number(countRow?.count) || 0;

  if (count > 0) {
    await Duck.query(
      `UPDATE "${escapedTable}" SET "${escapedCol}" = '${escapedReplaceValue}' WHERE ${exactMatchCondition}`
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

const BLOCKED_FUNCTION_NAMES = new Set(
  BLOCKED_FUNCTIONS.map((name) => name.toLowerCase())
);

/**
 * The fragment the calculator validates and runs. The line breaks end a
 * trailing `--` comment before the closing parenthesis.
 */
function calculatedExpressionSql(expression: string): string {
  return `(\n${expression}\n)`;
}

type SerializedSqlNode = Record<string, unknown>;

function isSerializedSqlNode(value: unknown): value is SerializedSqlNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEmptyList(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function isSingleExpressionSelect(node: SerializedSqlNode): boolean {
  return (
    node.type === 'SELECT_NODE' &&
    Array.isArray(node.select_list) &&
    node.select_list.length === 1 &&
    isSerializedSqlNode(node.from_table) &&
    node.from_table.type === 'EMPTY' &&
    node.where_clause === null &&
    node.having === null &&
    node.qualify === null &&
    node.sample === null &&
    isEmptyList(node.modifiers) &&
    isEmptyList(node.group_expressions) &&
    isEmptyList(node.group_sets) &&
    isSerializedSqlNode(node.cte_map) &&
    isEmptyList(node.cte_map.map)
  );
}

function findForbiddenSqlNode(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const keyword = findForbiddenSqlNode(item);
      if (keyword) return keyword;
    }
    return null;
  }
  if (!isSerializedSqlNode(value)) return null;
  if (value.class === 'SUBQUERY') return 'SUBQUERY';
  if (
    value.class === 'FUNCTION' &&
    typeof value.function_name === 'string' &&
    BLOCKED_FUNCTION_NAMES.has(value.function_name.toLowerCase())
  ) {
    return value.function_name.toUpperCase();
  }
  return findForbiddenSqlNode(Object.values(value));
}

function parseSerializedSql(raw: unknown): unknown {
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/**
 * The keyword check reads strings and comments its own way. DuckDB parses
 * the fragment as it will run: one expression, without table, subquery or
 * blocked function.
 */
async function assertCalculatedExpression(
  expressionSql: string,
  Duck: DuckDBClient
): Promise<void> {
  const rows = (await Duck.query(
    `SELECT json_serialize_sql('${escapeSqlString(`SELECT ${expressionSql}`)}') AS ast`,
    { format: 'array' }
  )) as Array<{ ast?: unknown }> | undefined;
  const parsed = parseSerializedSql(rows?.[0]?.ast);

  if (isSerializedSqlNode(parsed) && parsed.error === true) {
    throw new DuckDBError(
      typeof parsed.error_message === 'string'
        ? parsed.error_message
        : m.error_calc_expression_invalid()
    );
  }

  const statements = isSerializedSqlNode(parsed) ? parsed.statements : null;
  const statement =
    Array.isArray(statements) && statements.length === 1 ? statements[0] : null;
  const node = isSerializedSqlNode(statement) ? statement.node : null;
  if (!isSerializedSqlNode(node) || !isSingleExpressionSelect(node)) {
    throw new DuckDBError(m.error_calc_expression_invalid());
  }

  const keyword = findForbiddenSqlNode(node.select_list);
  if (keyword) {
    throw new DuckDBError(
      m.error_calc_expression_forbidden_keyword({ keyword })
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
  const expressionSql = calculatedExpressionSql(expression);
  await assertCalculatedExpression(expressionSql, Duck);

  const columns = await Duck.analyse(tableName);
  if (columns.some((col: AnalysisResult) => col.name === trimmedName)) {
    throw new DuckDBError(
      m.error_calc_column_exists({ column: trimmedName }),
      undefined,
      { tableName, columnName: trimmedName }
    );
  }

  const escapedTable = escapeIdentifier(tableName);
  const escapedColumn = escapeIdentifier(trimmedName);

  await Duck.query(
    `CREATE OR REPLACE TABLE "${escapedTable}" AS SELECT *, ${expressionSql} AS "${escapedColumn}" FROM "${escapedTable}"`
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
  const expressionSql = calculatedExpressionSql(expression);
  await assertCalculatedExpression(expressionSql, Duck);

  const escapedTable = escapeIdentifier(tableName);
  const result = (await Duck.query(
    `SELECT ${expressionSql} as result FROM "${escapedTable}" LIMIT 1`
  )) as ArrowTableLike;

  if (result.numRows === 0) {
    return null;
  }

  const row = result.get(0) as Record<string, unknown>;
  return row?.result ?? null;
}
