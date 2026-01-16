export type ColumnTypeSimple = 'string' | 'numeric' | 'date';

export interface ColumnTypeStyle {
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

import * as m from '$lib/paraglide/messages';

export interface SemioBadgeStyle {
  color: string;
  tooltip: () => string;
}

export const SEMIO_BADGE_STYLES: Record<string, SemioBadgeStyle> = {
  geoid: {
    color: '#24a148',
    tooltip: () => m.semio_geoid_tooltip()
  }
} as const;

export const GEOID_SCORE_THRESHOLD = 4;
