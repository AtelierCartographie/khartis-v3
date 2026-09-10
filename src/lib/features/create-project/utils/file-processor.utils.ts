import type { CsvMatrix, ColumnInfo } from '../types/file-processing.types';
export type { CsvMatrix, ColumnInfo } from '../types/file-processing.types';
import type { ColumnStatSummary } from '$lib/features/commons/utils/file-import.utils';
import type { JsonValue } from '$lib/types/data';

export function convertRowsToTabular(
  rows: Array<Record<string, unknown>>
): Array<Record<string, JsonValue>> {
  return rows.map((row) => {
    const tabularRow: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(row)) {
      if (value instanceof Date) {
        tabularRow[key] = value.toISOString();
      } else if (typeof value === 'bigint') {
        tabularRow[key] = Number(value);
      } else {
        tabularRow[key] = value as JsonValue;
      }
    }
    return tabularRow;
  });
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  return undefined;
}

export function buildColumnStatistics(
  columns: ColumnInfo[],
  rowCount: number
): Record<string, ColumnStatSummary> {
  const statistics: Record<string, ColumnStatSummary> = {};
  for (const col of columns) {
    statistics[col.name] = {
      type: col.type,
      count: toNumber(col.stats.count) ?? rowCount,
      nullCount: toNumber(col.stats.nulls) ?? 0,
      unique: toNumber(col.stats.uniques) ?? 0,
      min: toNumber(col.stats.min),
      max: toNumber(col.stats.max),
      mean: toNumber(col.stats.mean),
      value_sample: col.stats.value_sample
    };
  }
  return statistics;
}

export function createDataMatrix(
  rows: Array<Record<string, unknown>>,
  headers: string[]
): CsvMatrix {
  return rows.map((row) =>
    headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return null;
      if (value instanceof Date) return value;
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        return value;
      }
      return String(value);
    })
  );
}
