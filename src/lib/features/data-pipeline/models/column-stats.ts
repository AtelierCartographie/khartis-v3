import type { ColumnType } from './column-type';

/**
 * Basic statistics computed for a column.
 */
export interface ColumnStats {
  name: string;
  type: ColumnType;
  count: number;
  nulls: number;
  uniques: number;
  min?: unknown;
  max?: unknown;
  mean?: number;
  median?: number;
  stdDev?: number;
}

export function hasNumericStats(stats: ColumnStats): boolean {
  return (
    stats.mean !== undefined &&
    stats.median !== undefined &&
    stats.stdDev !== undefined
  );
}

export function getNullPercentage(stats: ColumnStats): number {
  if (stats.count === 0) return 0;
  return (stats.nulls / stats.count) * 100;
}

export function getUniquePercentage(stats: ColumnStats): number {
  if (stats.count === 0) return 0;
  return (stats.uniques / stats.count) * 100;
}
