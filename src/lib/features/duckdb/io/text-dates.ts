import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import {
  sqlIdentifier,
  sqlString
} from '$lib/features/commons/utils/sql.utils';

/**
 * Date formats DuckDB's CSV sniffer misses or abandons: a single invalid value
 * (a 30 February, `0000-00-00`, « inconnu ») makes it type the whole column as
 * VARCHAR, and it never tries year-month or day-first timestamps. Order is
 * preference: day-first before month-first for ambiguous `01/02/2020`.
 */
export interface TextDateFormat {
  pattern: string;
  hasTime: boolean;
}

export const TEXT_DATE_FORMATS: readonly TextDateFormat[] = [
  { pattern: '%Y-%m-%d', hasTime: false },
  { pattern: '%d/%m/%Y', hasTime: false },
  { pattern: '%m/%d/%Y', hasTime: false },
  { pattern: '%Y/%m/%d', hasTime: false },
  { pattern: '%d-%m-%Y', hasTime: false },
  { pattern: '%d.%m.%Y', hasTime: false },
  { pattern: '%Y-%m-%d %H:%M:%S', hasTime: true },
  { pattern: '%Y-%m-%d %H:%M', hasTime: true },
  { pattern: '%Y-%m-%dT%H:%M:%S', hasTime: true },
  { pattern: '%d/%m/%Y %H:%M:%S', hasTime: true },
  { pattern: '%d/%m/%Y %H:%M', hasTime: true },
  { pattern: '%m/%d/%Y %H:%M:%S', hasTime: true },
  { pattern: '%m/%d/%Y %H:%M', hasTime: true },
  // Year-month reads as the first day of the month.
  { pattern: '%Y-%m', hasTime: false },
  { pattern: '%Y/%m', hasTime: false },
  { pattern: '%m/%Y', hasTime: false },
  { pattern: '%m-%Y', hasTime: false }
];

const DETECTION_SAMPLE_SIZE = 1000;

export type RowsQuery = (sql: string) => Promise<Record<string, unknown>[]>;

export function buildTextDateExpression(
  columnRef: string,
  format: TextDateFormat
): string {
  const parsed = `try_strptime(trim(${columnRef}::VARCHAR), ${sqlString(format.pattern)})`;
  return format.hasTime ? parsed : `${parsed}::DATE`;
}

function presentValueClause(columnRef: string): string {
  return `${columnRef} IS NOT NULL AND trim(${columnRef}::VARCHAR) <> ''`;
}

/**
 * Per-format parse counts over a sample of the column's non-empty values.
 * Returns the sample size and one count per entry of TEXT_DATE_FORMATS.
 */
async function sampleFormatHits(
  query: RowsQuery,
  tableName: string,
  columnName: string
): Promise<{ sampled: number; hits: number[] }> {
  const ref = sqlIdentifier(columnName);
  const hitColumns = TEXT_DATE_FORMATS.map(
    (format, index) =>
      `COUNT(${buildTextDateExpression('v', format)}) AS hit_${index}`
  );
  const rows = await query(
    `SELECT COUNT(*) AS sampled, ${hitColumns.join(', ')} FROM (SELECT ${ref} AS v FROM ${sqlIdentifier(tableName)} WHERE ${presentValueClause(ref)} LIMIT ${DETECTION_SAMPLE_SIZE}) AS sample`
  );
  const row = rows[0] ?? {};
  return {
    sampled: Number(row.sampled ?? 0),
    hits: TEXT_DATE_FORMATS.map((_, index) => Number(row[`hit_${index}`] ?? 0))
  };
}

async function countUnparsed(
  query: RowsQuery,
  tableName: string,
  columnName: string,
  format: TextDateFormat
): Promise<number> {
  const ref = sqlIdentifier(columnName);
  const rows = await query(
    `SELECT COUNT(*) FILTER (WHERE ${presentValueClause(ref)} AND ${buildTextDateExpression(ref, format)} IS NULL) AS unparsed FROM ${sqlIdentifier(tableName)}`
  );
  return Number(rows[0]?.unparsed ?? 0);
}

/**
 * The format every non-empty value of a text column parses with, or null.
 * Recognition never empties a cell: one value outside the format keeps the
 * column as text.
 */
export async function detectTextDateFormat(
  query: RowsQuery,
  tableName: string,
  columnName: string
): Promise<TextDateFormat | null> {
  const { sampled, hits } = await sampleFormatHits(
    query,
    tableName,
    columnName
  );
  if (sampled === 0) return null;
  const index = hits.findIndex((count) => count === sampled);
  if (index === -1) return null;
  const format = TEXT_DATE_FORMATS[index];
  const unparsed = await countUnparsed(query, tableName, columnName, format);
  return unparsed === 0 ? format : null;
}

/** The format most values parse with, for a conversion the user forces. */
export async function resolveBestTextDateFormat(
  query: RowsQuery,
  tableName: string,
  columnName: string
): Promise<TextDateFormat | null> {
  const { sampled, hits } = await sampleFormatHits(
    query,
    tableName,
    columnName
  );
  if (sampled === 0) return null;
  let bestIndex = -1;
  hits.forEach((count, index) => {
    if (count > 0 && (bestIndex === -1 || count > hits[bestIndex])) {
      bestIndex = index;
    }
  });
  return bestIndex === -1 ? null : TEXT_DATE_FORMATS[bestIndex];
}

/**
 * Converts each text column whose values are all dates in one format into a
 * DATE (or TIMESTAMP when the format carries a time). Returns the converted
 * column names.
 */
export async function promoteTextDateColumns(
  query: RowsQuery,
  tableName: string
): Promise<string[]> {
  const columns = ((await query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = ${sqlString(tableName)} AND data_type = 'VARCHAR'`
  )) ?? []) as Array<{ column_name?: unknown }>;
  const promoted: string[] = [];

  for (const { column_name: name } of columns) {
    if (typeof name !== 'string' || name.startsWith('__')) continue;
    const format = await detectTextDateFormat(query, tableName, name);
    if (!format) continue;
    const ref = sqlIdentifier(name);
    await query(
      `ALTER TABLE ${sqlIdentifier(tableName)} ALTER COLUMN ${ref} SET DATA TYPE ${format.hasTime ? 'TIMESTAMP' : 'DATE'} USING ${buildTextDateExpression(ref, format)}`
    );
    promoted.push(name);
  }

  return promoted;
}

/** Import step: recognition is best-effort and never fails the import. */
export async function promoteImportedTextDates(
  connection: AsyncDuckDBConnection,
  tableName: string
): Promise<void> {
  const query: RowsQuery = async (sql) =>
    ((await executeQuery(connection, sql, {
      format: DUCK_CONST.QUERY_FORMAT.ARRAY
    })) ?? []) as Record<string, unknown>[];
  try {
    await promoteTextDateColumns(query, tableName);
  } catch (error) {
    logger.warn('Text date recognition failed', LogCategory.DUCKDB, {
      error,
      extra: { tableName }
    });
  }
}
