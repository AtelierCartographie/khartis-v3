import { describe, expect, it } from 'vitest';
import {
  enrichColumns,
  buildStatisticsSnapshot
} from '$lib/features/data-pipeline/operations/analysis';
import { ColumnType } from '$lib/features/data-pipeline/types';
import {
  DuckDBSimplifiedType,
  type AnalysisResult
} from '$lib/features/duckdb';

function col(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    name: 'value',
    type_simple: DuckDBSimplifiedType.STRING,
    count: 10,
    nulls: 0,
    uniques: 5,
    ...overrides
  };
}

describe('enrichColumns', () => {
  it('maps type_simple to ColumnType correctly', () => {
    const columns = [
      col({ name: 'id', type_simple: DuckDBSimplifiedType.NUMERIC }),
      col({ name: 'label', type_simple: DuckDBSimplifiedType.STRING }),
      col({ name: 'flag', type_simple: DuckDBSimplifiedType.BOOLEAN }),
      col({ name: 'geom', type_simple: DuckDBSimplifiedType.GEOMETRY })
    ];
    const result = enrichColumns(columns);
    expect(result[0].type).toBe(ColumnType.NUMBER);
    expect(result[1].type).toBe(ColumnType.TEXT);
    expect(result[2].type).toBe(ColumnType.BOOLEAN);
    expect(result[3].type).toBe(ColumnType.GEOMETRY);
  });

  it('falls back to TEXT for unknown type_simple', () => {
    const result = enrichColumns([col({ type_simple: undefined })]);
    expect(result[0].type).toBe(ColumnType.TEXT);
  });

  it('coerces count/nulls/uniques to numbers from string inputs', () => {
    // Arrow proxies can surface counters as strings/BigInt at runtime.
    const stringlyTyped = {
      ...col(),
      count: '42',
      nulls: '3',
      uniques: '10'
    } as unknown as AnalysisResult;
    const result = enrichColumns([stringlyTyped]);
    const stats = result[0].stats;
    expect(stats.count).toBe(42);
    expect(stats.nulls).toBe(3);
    expect(stats.uniques).toBe(10);
  });

  it('carries optional numeric stats when present', () => {
    const result = enrichColumns([
      col({ mean: '5.5', median: '5', stddev: '1.2' })
    ]);
    const stats = result[0].stats;
    expect(stats.mean).toBe(5.5);
    expect(stats.median).toBe(5);
    expect(stats.stdDev).toBe(1.2);
  });

  it('preserves optional numeric stats when they are zero', () => {
    const result = enrichColumns([col({ mean: 0, median: 0, stddev: 0 })]);
    const stats = result[0].stats;
    expect(stats.mean).toBe(0);
    expect(stats.median).toBe(0);
    expect(stats.stdDev).toBe(0);
  });

  it('coerces BigInt min/max from DuckDB BIGINT columns to numbers', () => {
    const result = enrichColumns([
      col({ type_simple: DuckDBSimplifiedType.NUMERIC, min: 1990n, max: 2020n })
    ]);
    const stats = result[0].stats;
    expect(stats.min).toBe(1990);
    expect(stats.max).toBe(2020);
  });

  it('carries skewness as a number when present', () => {
    const result = enrichColumns([col({ skewness: '3.4' })]);
    expect(result[0].stats.skewness).toBe(3.4);
  });
});

describe('buildStatisticsSnapshot', () => {
  it('returns an entry per column keyed by name', () => {
    const columns = [
      col({
        name: 'pop',
        type_simple: DuckDBSimplifiedType.NUMERIC,
        count: 20,
        nulls: 1,
        uniques: 15,
        min: 0,
        max: 100
      }),
      col({
        name: 'region',
        type_simple: DuckDBSimplifiedType.STRING,
        count: 20,
        nulls: 0,
        uniques: 8
      })
    ];
    const snapshot = buildStatisticsSnapshot(columns);
    expect(Object.keys(snapshot)).toEqual(['pop', 'region']);
    expect((snapshot.pop as Record<string, unknown>).nullCount).toBe(1);
    expect((snapshot.region as Record<string, unknown>).type).toBe('string');
  });

  it('coerces mean to number when present, undefined when empty', () => {
    const withMean = buildStatisticsSnapshot([col({ mean: '7.3' })]);
    expect((withMean.value as Record<string, unknown>).mean).toBe(7.3);

    const withEmptyMean = buildStatisticsSnapshot([col({ mean: '' })]);
    expect(
      (withEmptyMean.value as Record<string, unknown>).mean
    ).toBeUndefined();

    const withZeroMean = buildStatisticsSnapshot([col({ mean: 0 })]);
    expect((withZeroMean.value as Record<string, unknown>).mean).toBe(0);
  });
});
