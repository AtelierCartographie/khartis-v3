export type ColumnTypeSimple = 'string' | 'numeric' | 'date';

interface ColumnTypeStyle {
  color: string;
  label: string | null;
}

export const COLUMN_TYPE_STYLES: Record<ColumnTypeSimple, ColumnTypeStyle> = {
  string: { color: '#a56eff', label: 'ABC' },
  numeric: { color: '#ff7f00', label: '123' },
  date: { color: '#0072c3', label: null }
} as const;

export function getColumnTypeStyle(
  typeSimple: string | undefined
): ColumnTypeStyle {
  if (typeSimple && typeSimple in COLUMN_TYPE_STYLES) {
    return COLUMN_TYPE_STYLES[typeSimple as ColumnTypeSimple];
  }
  return COLUMN_TYPE_STYLES.string;
}
