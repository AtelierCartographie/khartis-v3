import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import * as m from '$lib/paraglide/messages';
import {
  RefineOperation,
  type AnalysisResult,
  type ArrowTableLike
} from '../types';

export interface DuckDBClient {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  analyse(
    tableName: string,
    options?: { force?: boolean }
  ): Promise<AnalysisResult[]>;
  drop_rows(tableName: string, rowIds: number[]): Promise<void>;
}

export async function renameColumn(
  tableName: string,
  oldName: string,
  newName: string,
  Duck: DuckDBClient
): Promise<void> {
  const start = performance.now();

  const escapedTable = escapeIdentifier(tableName);
  const escapedOld = escapeIdentifier(oldName);
  const escapedNew = escapeIdentifier(newName);

  await Duck.query(
    `ALTER TABLE "${escapedTable}" RENAME COLUMN "${escapedOld}" TO "${escapedNew}"`
  );

  await Duck.analyse(tableName, { force: true });

  logger.info('Renamed DuckDB column', LogCategory.DUCKDB, {
    tableName,
    oldName,
    newName,
    durationMs: (performance.now() - start).toFixed(2)
  });
}

export async function changeColumnType(
  tableName: string,
  columnName: string,
  newType: string,
  Duck: DuckDBClient
): Promise<void> {
  const start = performance.now();

  const escapedTable = escapeIdentifier(tableName);
  const escapedCol = escapeIdentifier(columnName);

  await Duck.query(
    `ALTER TABLE "${escapedTable}" ALTER COLUMN "${escapedCol}" SET DATA TYPE ${newType}`
  );

  await Duck.analyse(tableName, { force: true });

  logger.info('Changed DuckDB column type', LogCategory.DUCKDB, {
    tableName,
    columnName,
    newType,
    durationMs: (performance.now() - start).toFixed(2)
  });
}

export async function dropColumn(
  tableName: string,
  columnName: string,
  Duck: DuckDBClient
): Promise<void> {
  const start = performance.now();

  const escapedTable = escapeIdentifier(tableName);
  const escapedCol = escapeIdentifier(columnName);

  await Duck.query(`ALTER TABLE "${escapedTable}" DROP COLUMN "${escapedCol}"`);

  await Duck.analyse(tableName, { force: true });

  logger.info('Dropped DuckDB column', LogCategory.DUCKDB, {
    tableName,
    columnName,
    durationMs: (performance.now() - start).toFixed(2)
  });
}

export async function dropRows(
  tableName: string,
  rowIds: number[],
  Duck: DuckDBClient
): Promise<void> {
  if (!rowIds.length) return;

  const start = performance.now();

  await Duck.drop_rows(tableName, rowIds);
  await Duck.analyse(tableName, { force: true });

  logger.info('Dropped rows from DuckDB table', LogCategory.DUCKDB, {
    tableName,
    rowCount: rowIds.length,
    durationMs: (performance.now() - start).toFixed(2)
  });
}

export async function refineColumn(
  tableName: string,
  columnName: string,
  operation: RefineOperation,
  Duck: DuckDBClient
): Promise<void> {
  const start = performance.now();

  const escapedTable = escapeIdentifier(tableName);
  const escapedCol = escapeIdentifier(columnName);

  const operations: Record<RefineOperation, string> = {
    [RefineOperation.UPPERCASE]: `UPDATE "${escapedTable}" SET "${escapedCol}" = UPPER("${escapedCol}")`,
    [RefineOperation.LOWERCASE]: `UPDATE "${escapedTable}" SET "${escapedCol}" = LOWER("${escapedCol}")`,
    [RefineOperation.TITLECASE]: `UPDATE "${escapedTable}" SET "${escapedCol}" = INITCAP("${escapedCol}")`,
    [RefineOperation.TRIM]: `UPDATE "${escapedTable}" SET "${escapedCol}" = TRIM("${escapedCol}")`,
    [RefineOperation.TRIM_ALL]: `UPDATE "${escapedTable}" SET "${escapedCol}" = REGEXP_REPLACE("${escapedCol}", '\\s+', ' ', 'g')`
  };

  await Duck.query(operations[operation]);

  await Duck.analyse(tableName, { force: true });

  logger.info('Refined DuckDB column', LogCategory.DUCKDB, {
    tableName,
    columnName,
    operation,
    durationMs: (performance.now() - start).toFixed(2)
  });
}

export async function replaceInColumn(
  tableName: string,
  columnName: string,
  searchValue: string,
  replaceValue: string,
  Duck: DuckDBClient
): Promise<number> {
  const start = performance.now();

  const escapedTable = escapeIdentifier(tableName);
  const escapedCol = escapeIdentifier(columnName);
  const escapedSearchValue = escapeSqlString(searchValue);
  const escapedReplaceValue = escapeSqlString(replaceValue);

  // Pre-compute the normalized search value once (instead of per-row)
  const normResult = (await Duck.query(
    `SELECT normalize_text('${escapedSearchValue}') as norm`,
    { format: 'array' }
  )) as Array<{ norm: string }>;
  const normalizedSearch = normResult?.[0]?.norm ?? '';

  // Use simple equality on normalized text instead of expensive jaro_winkler_similarity
  // jaro_winkler_similarity(...) = 1 is semantically identical to equality after normalization
  const exactMatchCondition = `normalize_text("${escapedCol}"::VARCHAR) = '${escapeSqlString(normalizedSearch)}'`;

  const countResult = (await Duck.query(
    `SELECT COUNT(*) as count FROM "${escapedTable}" WHERE ${exactMatchCondition}`
  )) as ArrowTableLike;

  const countRow = countResult.get(0) as Record<string, unknown>;
  const count = Number(countRow?.count) || 0;

  if (count > 0) {
    logger.info(
      'Replacing exact matches in DuckDB column',
      LogCategory.DUCKDB,
      {
        tableName,
        columnName,
        count,
        searchValue,
        replaceValue
      }
    );
    await Duck.query(
      `UPDATE "${escapedTable}" SET "${escapedCol}" = '${escapedReplaceValue}' WHERE ${exactMatchCondition}`
    );

    await Duck.analyse(tableName, { force: true });
    logger.success(
      'Column values replaced (exact matches)',
      LogCategory.DUCKDB,
      {
        tableName,
        columnName,
        count,
        durationMs: (performance.now() - start).toFixed(2)
      }
    );
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
  'EXEC'
];

const BLOCKED_PATTERN = new RegExp(
  `\\b(${BLOCKED_KEYWORDS.join('|')})\\b`,
  'i'
);

export function validateExpression(expression: string): void {
  if (!expression.trim()) {
    throw new DuckDBError('Expression cannot be empty');
  }

  if (expression.includes(';')) {
    throw new DuckDBError(m.error_calc_expression_forbidden_semicolon());
  }

  const match = expression.match(BLOCKED_PATTERN);
  if (match) {
    throw new DuckDBError(
      m.error_calc_expression_forbidden_keyword({
        keyword: match[1].toUpperCase()
      })
    );
  }
}

export async function addCalculatedColumn(
  tableName: string,
  columnName: string,
  expression: string,
  Duck: DuckDBClient
): Promise<AnalysisResult[]> {
  const start = performance.now();

  const trimmedName = columnName.trim();
  if (!trimmedName) {
    throw new DuckDBError('Invalid column name for calculator');
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

  const escapedTable = escapeIdentifier(tableName);
  const escapedColumn = escapeIdentifier(trimmedName);

  await Duck.query(
    `CREATE OR REPLACE TABLE "${escapedTable}" AS SELECT *, (${expression}) AS "${escapedColumn}" FROM "${escapedTable}"`
  );

  const updatedColumns = await Duck.analyse(tableName, { force: true });

  logger.success('Calculated column added to DuckDB', LogCategory.DUCKDB, {
    tableName,
    columnName: trimmedName,
    durationMs: (performance.now() - start).toFixed(2)
  });

  return updatedColumns;
}

export async function testExpression(
  tableName: string,
  expression: string,
  Duck: DuckDBClient
): Promise<unknown> {
  validateExpression(expression);

  const escapedTable = escapeIdentifier(tableName);
  const result = (await Duck.query(
    `SELECT (${expression}) as result FROM "${escapedTable}" LIMIT 1`
  )) as ArrowTableLike;

  if (result.numRows === 0) {
    return null;
  }

  const row = result.get(0) as Record<string, unknown>;
  return row?.result ?? null;
}
