import type { VariableBadgeType } from '$lib/features/commons/types/variable-badge.types';
import { isNumericType } from '$lib/features/commons/utils/format.utils';

/** The badge type of a column, from its DuckDB type: text when unknown. */
export function resolveColumnBadgeType(
  columns: ReadonlyArray<{ name: string; type?: string }>,
  columnName: string
): VariableBadgeType {
  const col = columns.find((c) => c.name === columnName);
  if (!col) return 'string';
  const type = String(col.type || '').toLowerCase();
  if (isNumericType(type)) return 'numeric';
  if (type === 'boolean') return 'boolean';
  if (type === 'date' || type === 'timestamp') return 'date';
  return 'string';
}
