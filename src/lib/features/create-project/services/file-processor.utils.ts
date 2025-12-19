import type { ColumnStatSummary } from '$lib/features/commons/utils/file-import.utils';
import type { JsonValue } from '$lib/types/data';

type CsvPrimitive = string | number | boolean | null | Date;
export type CsvMatrix = CsvPrimitive[][];

export interface ColumnInfo {
  name: string;
  type: string;
  stats: {
    count?: number;
    nulls?: number;
    uniques?: number;
    min?: unknown;
    max?: unknown;
    mean?: number;
  };
}

export function convertRowsToTabular(
  rows: Array<Record<string, unknown>>
): Array<Record<string, JsonValue>> {
  return rows.map((row) => {
    const tabularRow: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(row)) {
      if (value instanceof Date) {
        tabularRow[key] = value.toISOString();
      } else {
        tabularRow[key] = value as JsonValue;
      }
    }
    return tabularRow;
  });
}

export function buildColumnStatistics(
  columns: ColumnInfo[],
  rowCount: number
): Record<string, ColumnStatSummary> {
  const statistics: Record<string, ColumnStatSummary> = {};
  for (const col of columns) {
    statistics[col.name] = {
      type: col.type,
      count: col.stats.count ?? rowCount,
      nullCount: col.stats.nulls ?? 0,
      unique: col.stats.uniques ?? 0,
      min: col.stats.min as number | undefined,
      max: col.stats.max as number | undefined,
      mean: col.stats.mean
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
