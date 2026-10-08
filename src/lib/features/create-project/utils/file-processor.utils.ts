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
