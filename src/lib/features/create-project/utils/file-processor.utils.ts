import type { CsvMatrix } from '../types/file-processing.types';
export type { CsvMatrix } from '../types/file-processing.types';
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
