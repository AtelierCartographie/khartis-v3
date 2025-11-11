import type { ColumnType } from './column-type.vo';

/**
 * Column statistics value object
 *
 * Computed by analytics engine for each column.
 * Contains both basic stats (all columns) and type-specific stats (numeric only).
 *
 * @example
 * ```typescript
 * const stats: ColumnStats = {
 *   name: 'population',
 *   type: ColumnType.NUMBER,
 *   count: 1000,
 *   nulls: 5,
 *   uniques: 987,
 *   min: 100,
 *   max: 1000000,
 *   mean: 50000,
 *   median: 45000,
 *   stdDev: 15000
 * };
 * ```
 */
export interface ColumnStats {
  /**
   * Column name
   */
  name: string;

  /**
   * Inferred column type
   */
  type: ColumnType;

  /**
   * Total count (including nulls)
   */
  count: number;

  /**
   * Number of null values
   */
  nulls: number;

  /**
   * Number of unique values
   */
  uniques: number;

  /**
   * Minimum value (for numeric/date columns)
   */
  min?: unknown;

  /**
   * Maximum value (for numeric/date columns)
   */
  max?: unknown;

  /**
   * Mean (for numeric columns only)
   */
  mean?: number;

  /**
   * Median (for numeric columns only)
   */
  median?: number;

  /**
   * Standard deviation (for numeric columns only)
   */
  stdDev?: number;
}

/**
 * Check if column has numeric statistics
 *
 * @param stats - ColumnStats to check
 * @returns true if mean/median/stdDev are defined
 */
export function hasNumericStats(stats: ColumnStats): boolean {
  return (
    stats.mean !== undefined &&
    stats.median !== undefined &&
    stats.stdDev !== undefined
  );
}

/**
 * Compute null percentage
 *
 * @param stats - ColumnStats
 * @returns Percentage of null values (0-100)
 */
export function getNullPercentage(stats: ColumnStats): number {
  if (stats.count === 0) return 0;
  return (stats.nulls / stats.count) * 100;
}

/**
 * Compute unique percentage
 *
 * @param stats - ColumnStats
 * @returns Percentage of unique values (0-100)
 */
export function getUniquePercentage(stats: ColumnStats): number {
  if (stats.count === 0) return 0;
  return (stats.uniques / stats.count) * 100;
}
