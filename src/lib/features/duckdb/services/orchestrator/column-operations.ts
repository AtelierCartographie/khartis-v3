import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import type { AnalysisResult, ArrowTableLike } from '../duckdb/types';
import { RefineOperation } from './types';

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

  await Duck.query(
    `ALTER TABLE "${tableName}" RENAME COLUMN "${oldName}" TO "${newName}"`
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

  await Duck.query(
    `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" SET DATA TYPE ${newType}`
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

  await Duck.query(`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`);

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

  const operations: Record<RefineOperation, string> = {
    [RefineOperation.UPPERCASE]: `UPDATE "${tableName}" SET "${columnName}" = UPPER("${columnName}")`,
    [RefineOperation.LOWERCASE]: `UPDATE "${tableName}" SET "${columnName}" = LOWER("${columnName}")`,
    [RefineOperation.TITLECASE]: `UPDATE "${tableName}" SET "${columnName}" = INITCAP("${columnName}")`,
    [RefineOperation.TRIM]: `UPDATE "${tableName}" SET "${columnName}" = TRIM("${columnName}")`,
    [RefineOperation.TRIM_ALL]: `UPDATE "${tableName}" SET "${columnName}" = REGEXP_REPLACE("${columnName}", '\\s+', ' ', 'g')`
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

  const escapedSearchValue = escapeSqlString(searchValue);
  const escapedReplaceValue = escapeSqlString(replaceValue);

  const exactMatchCondition = `jaro_winkler_similarity(normalize_text("${columnName}"::VARCHAR), normalize_text('${escapedSearchValue}')) = 1`;

  const countResult = (await Duck.query(
    `SELECT COUNT(*) as count FROM "${tableName}" WHERE ${exactMatchCondition}`
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
      `UPDATE "${tableName}" SET "${columnName}" = '${escapedReplaceValue}' WHERE ${exactMatchCondition}`
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

export async function addCalculatedColumn(
  tableName: string,
  columnName: string,
  expression: string,
  Duck: DuckDBClient
): Promise<AnalysisResult[]> {
  const start = performance.now();

  const sanitizedColumnName = columnName.trim();
  if (!sanitizedColumnName) {
    throw new DuckDBError('Invalid column name for calculator');
  }

  if (!expression.trim()) {
    throw new DuckDBError('Expression cannot be empty');
  }

  const columns = await Duck.analyse(tableName);
  if (columns.some((col: AnalysisResult) => col.name === sanitizedColumnName)) {
    throw new DuckDBError(
      `La colonne "${sanitizedColumnName}" existe déjà`,
      undefined,
      { tableName, columnName: sanitizedColumnName }
    );
  }

  await Duck.query(
    `CREATE OR REPLACE TABLE "${tableName}" AS SELECT *, (${expression}) AS "${sanitizedColumnName}" FROM "${tableName}"`
  );

  const updatedColumns = await Duck.analyse(tableName, { force: true });

  logger.success('Calculated column added to DuckDB', LogCategory.DUCKDB, {
    tableName,
    columnName: sanitizedColumnName,
    durationMs: (performance.now() - start).toFixed(2)
  });

  return updatedColumns;
}

export async function testExpression(
  tableName: string,
  expression: string,
  Duck: DuckDBClient
): Promise<unknown> {
  const result = (await Duck.query(
    `SELECT (${expression}) as result FROM "${tableName}" LIMIT 1`
  )) as ArrowTableLike;

  if (result.numRows === 0) {
    return null;
  }

  const row = result.get(0) as Record<string, unknown>;
  return row?.result ?? null;
}
