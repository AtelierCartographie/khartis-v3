import { DuckDBError } from '$lib/features/commons/pipeline.errors';
import * as m from '$lib/paraglide/messages';
import {
  RefineOperation,
  type AnalysisResult,
  type ArrowTableLike
} from '../types';
import { buildNormalizedNumericTextSql } from '$lib/features/commons/utils/numeric-format.utils';
import {
  buildTextDateExpression,
  resolveBestTextDateFormat
} from '../io/text-dates';
import {
  sqlIdentifier,
  sqlString
} from '$lib/features/commons/utils/sql.utils';
import type { DuckClient } from '../duck';

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
  Duck: DuckClient,
  options?: { skipAnalysis?: boolean }
): Promise<void> {
  if (options?.skipAnalysis) return;
  await Duck.analyse(tableName, { force: true });
}

export async function renameColumn(
  tableName: string,
  oldName: string,
  newName: string,
  Duck: DuckClient,
  options?: { skipAnalysis?: boolean }
): Promise<void> {
  await Duck.mutate(
    tableName,
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
  Duck: DuckClient
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
  Duck: DuckClient,
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

  await Duck.mutate(
    tableName,
    `ALTER TABLE ${sqlIdentifier(tableName)} ALTER COLUMN ${sqlIdentifier(columnName)} SET DATA TYPE ${normalizedType} USING ${castExpr}`
  );

  await maybeAnalyse(tableName, Duck, options);

  return { invalidatedCount };
}

export async function dropColumn(
  tableName: string,
  columnName: string,
  Duck: DuckClient,
  options?: { skipAnalysis?: boolean }
): Promise<void> {
  await Duck.mutate(
    tableName,
    `ALTER TABLE ${sqlIdentifier(tableName)} DROP COLUMN ${sqlIdentifier(columnName)}`
  );

  await maybeAnalyse(tableName, Duck, options);
}

export async function dropRows(
  tableName: string,
  rowIds: number[],
  Duck: DuckClient,
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
  Duck: DuckClient,
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
          lambda x: CASE
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

  await Duck.mutate(tableName, operations[operation]);

  await maybeAnalyse(tableName, Duck, options);
}

export async function replaceInColumn(
  tableName: string,
  columnName: string,
  searchValue: string,
  replaceValue: string,
  Duck: DuckClient,
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
    await Duck.mutate(
      tableName,
      `UPDATE ${sqlIdentifier(tableName)} SET ${sqlIdentifier(columnName)} = ${sqlString(replaceValue)} WHERE ${exactMatchCondition}`
    );

    if (!options?.skipAnalysis) {
      await Duck.analyse(tableName, { force: true });
    }
  }

  return count;
}

// Calculated columns are replayed from imported projects, so an expression is
// untrusted SQL. It is parsed by DuckDB itself and accepted only when every
// node and function of its tree is listed here: anything unknown is refused.
const ALLOWED_EXPRESSION_CLASSES = new Set([
  'BETWEEN',
  'CASE',
  'CAST',
  'COLLATE',
  'COLUMN_REF',
  'COMPARISON',
  'CONJUNCTION',
  'CONSTANT',
  'FUNCTION',
  'LAMBDA',
  'OPERATOR'
]);

const ALLOWED_EXPRESSION_FUNCTIONS = new Set([
  // operators
  '+',
  '-',
  '*',
  '/',
  '//',
  '%',
  '^',
  '**',
  '||',
  '~~',
  '!~~',
  '~~*',
  '!~~*',
  '~~~',
  '!~~~',
  // numbers
  'abs',
  'cbrt',
  'ceil',
  'ceiling',
  'degrees',
  'even',
  'exp',
  'floor',
  'gamma',
  'greatest',
  'isfinite',
  'isinf',
  'isnan',
  'least',
  'ln',
  'log',
  'log10',
  'log2',
  'mod',
  'pi',
  'pow',
  'power',
  'radians',
  'round',
  'round_even',
  'sign',
  'sqrt',
  'trunc',
  'acos',
  'asin',
  'atan',
  'atan2',
  'cos',
  'cot',
  'sin',
  'tan',
  // text
  'concat',
  'concat_ws',
  'contains',
  'ends_with',
  'format',
  'instr',
  'left',
  'len',
  'length',
  'lower',
  'lpad',
  'ltrim',
  'nfc_normalize',
  'position',
  'printf',
  'regexp_extract',
  'regexp_full_match',
  'regexp_matches',
  'regexp_replace',
  'repeat',
  'replace',
  'reverse',
  'right',
  'rpad',
  'rtrim',
  'split_part',
  'starts_with',
  'string_split',
  'strip_accents',
  'strlen',
  'substr',
  'substring',
  'trim',
  'ucase',
  'lcase',
  'upper',
  // dates
  'date_diff',
  'date_part',
  'date_trunc',
  'datediff',
  'datepart',
  'day',
  'dayofweek',
  'dayofyear',
  'epoch',
  'epoch_ms',
  'hour',
  'make_date',
  'minute',
  'month',
  'quarter',
  'second',
  'strftime',
  'strptime',
  'try_strptime',
  'week',
  'year',
  // lists
  'array_length',
  'list_avg',
  'list_contains',
  'list_count',
  'list_extract',
  'list_filter',
  'list_max',
  'list_median',
  'list_min',
  'list_sum',
  'list_transform',
  'list_value',
  // conditions
  'if',
  'ifnull',
  'nullif'
]);

interface ExpressionNode {
  [key: string]: unknown;
}

interface SerializedSql {
  error?: boolean;
  statements?: Array<{ node?: ExpressionNode }>;
}

function isEmptyClause(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') {
    return Object.values(value).every(isEmptyClause);
  }
  return false;
}

function forbidden(keyword: string): DuckDBError {
  return new DuckDBError(
    m.error_calc_expression_forbidden_keyword({ keyword })
  );
}

function assertAllowedNode(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertAllowedNode);
    return;
  }
  if (!value || typeof value !== 'object') return;

  const node = value as ExpressionNode;
  if (typeof node.class === 'string') {
    if (!ALLOWED_EXPRESSION_CLASSES.has(node.class)) {
      throw forbidden(node.class);
    }
    if (node.class === 'FUNCTION') {
      const name = String(node.function_name ?? '').toLowerCase();
      if (
        !ALLOWED_EXPRESSION_FUNCTIONS.has(name) ||
        !['', 'main'].includes(String(node.schema ?? '')) ||
        !isEmptyClause(node.catalog)
      ) {
        throw forbidden(name.toUpperCase());
      }
    }
  }
  Object.values(node).forEach(assertAllowedNode);
}

/**
 * Accepts a single scalar expression over the row's columns: DuckDB parses
 * `SELECT (<expression>)` and the tree must hold one select item, no FROM, no
 * clause, and only allowed nodes and functions.
 */
export async function validateExpression(
  expression: string,
  Duck: DuckClient
): Promise<void> {
  if (!expression.trim()) {
    throw new DuckDBError(m.error_expression_empty());
  }

  await Duck.loadExtension('json');
  const rows = (await Duck.query(
    `SELECT json_serialize_sql(${sqlString(`SELECT (${expression})`)}) AS ast`,
    { format: 'array' }
  )) as Array<{ ast: string }>;
  const serialized = JSON.parse(String(rows[0]?.ast)) as SerializedSql;

  if (serialized.error) {
    throw new DuckDBError(m.error_calc_expression_invalid());
  }
  if (serialized.statements?.length !== 1) {
    throw new DuckDBError(m.error_calc_expression_forbidden_semicolon());
  }

  const select = serialized.statements[0].node;
  if (select?.type !== 'SELECT_NODE') {
    throw forbidden(String(select?.type ?? 'SELECT'));
  }
  const selectList = select.select_list;
  if (!Array.isArray(selectList) || selectList.length !== 1) {
    throw forbidden('SELECT');
  }
  for (const [key, value] of Object.entries(select)) {
    if (key === 'type' || key === 'select_list' || key === 'aggregate_handling')
      continue;
    const isEmptyFrom =
      key === 'from_table' &&
      (value as ExpressionNode | null)?.type === 'EMPTY';
    if (!isEmptyFrom && !isEmptyClause(value)) {
      throw forbidden(key === 'from_table' ? 'FROM' : key.toUpperCase());
    }
  }

  assertAllowedNode(selectList[0]);
}

export async function addCalculatedColumn(
  tableName: string,
  columnName: string,
  expression: string,
  Duck: DuckClient,
  options?: { skipAnalysis?: boolean }
): Promise<AnalysisResult[]> {
  const trimmedName = columnName.trim();
  if (!trimmedName) {
    throw new DuckDBError(m.error_invalid_column_name_calc());
  }

  await validateExpression(expression, Duck);

  const columns = await Duck.analyse(tableName);
  if (columns.some((col: AnalysisResult) => col.name === trimmedName)) {
    throw new DuckDBError(
      m.error_calc_column_exists({ column: trimmedName }),
      undefined,
      { tableName, columnName: trimmedName }
    );
  }

  await Duck.mutate(
    tableName,
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
  Duck: DuckClient
): Promise<unknown> {
  await validateExpression(expression, Duck);

  const result = (await Duck.query(
    `SELECT (${expression}) as result FROM ${sqlIdentifier(tableName)} LIMIT 1`
  )) as ArrowTableLike;

  if (result.numRows === 0) {
    return null;
  }

  const row = result.get(0) as Record<string, unknown>;
  return row?.result ?? null;
}
