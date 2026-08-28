import { describe, expect, it, vi } from 'vitest';
import { ColumnType, type EnrichedColumn } from '../types';
import { computeQualityWarnings } from './quality';

vi.mock('$lib/paraglide/messages', () => ({
  pipeline_warning_no_data_rows: () => 'no rows',
  pipeline_warning_single_row: () => 'single row',
  pipeline_warning_small_dataset: ({ count }: { count: string }) =>
    `small:${count}`,
  pipeline_warning_high_nulls: ({
    column,
    percent
  }: {
    column: string;
    percent: string;
  }) => `nulls:${column}:${percent}`,
  pipeline_warning_low_cardinality: ({
    column,
    uniques,
    total
  }: {
    column: string;
    uniques: string;
    total: string;
  }) => `cardinality:${column}:${uniques}:${total}`
}));

function createColumn(
  name: string,
  count: number,
  nulls: number,
  uniques: number
): EnrichedColumn {
  return {
    name,
    type: ColumnType.TEXT,
    stats: {
      name,
      type: ColumnType.TEXT,
      count,
      nulls,
      uniques
    }
  };
}

describe('computeQualityWarnings', () => {
  it('should use all rows when computing the missing-value percentage', () => {
    const warnings = computeQualityWarnings(
      [createColumn('mostly-empty', 3, 97, 2)],
      100
    );

    expect(warnings).toContain('nulls:mostly-empty:97.0');
    expect(warnings.every((warning) => !warning.includes('9700.0'))).toBe(true);
  });

  it('should report 100 percent missing when a column has no non-null values', () => {
    const warnings = computeQualityWarnings(
      [createColumn('empty', 0, 100, 0)],
      100
    );

    expect(warnings).toContain('nulls:empty:100.0');
    expect(warnings.some((warning) => warning.startsWith('cardinality:'))).toBe(
      false
    );
  });

  it('should use the non-null count for low-cardinality warnings', () => {
    const warnings = computeQualityWarnings(
      [createColumn('category', 1_000, 20, 5)],
      1_020
    );

    expect(warnings).toContain('cardinality:category:5:1000');
  });
});
