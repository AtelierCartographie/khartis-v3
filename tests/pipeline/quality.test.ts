import { describe, expect, it } from 'vitest';
import * as m from '$lib/paraglide/messages';
import {
  ColumnType,
  type EnrichedColumn
} from '$lib/features/data-pipeline/types';
import { PIPELINE_CONST } from '$lib/features/data-pipeline/constants';
import { computeQualityWarnings } from '$lib/features/data-pipeline/operations/quality';

const { HIGH_NULL_RATIO_THRESHOLD, LOW_CARDINALITY_THRESHOLD } =
  PIPELINE_CONST.QUALITY;

function col(
  name: string,
  stats: Partial<EnrichedColumn['stats']>
): EnrichedColumn {
  return {
    name,
    type: ColumnType.TEXT,
    stats: {
      name,
      type: ColumnType.TEXT,
      count: 0,
      nulls: 0,
      uniques: 0,
      ...stats
    }
  };
}

describe('computeQualityWarnings', () => {
  it('warns when dataset has zero rows', () => {
    const warnings = computeQualityWarnings([], 0);
    expect(warnings).toEqual([m.pipeline_warning_no_data_rows()]);
  });

  it('warns and returns early on zero rows — no column warnings', () => {
    const warnings = computeQualityWarnings(
      [col('x', { count: 0, nulls: 0, uniques: 0 })],
      0
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBe(m.pipeline_warning_no_data_rows());
  });

  it('warns for a single-row dataset', () => {
    const warnings = computeQualityWarnings([], 1);
    expect(warnings).toContain(m.pipeline_warning_single_row());
    expect(warnings).toContain(
      m.pipeline_warning_small_dataset({ count: '1' })
    );
  });

  it('warns for small dataset (< 5 rows) but not for single', () => {
    const warnings = computeQualityWarnings([], 3);
    expect(warnings).not.toContain(m.pipeline_warning_single_row());
    expect(warnings).toContain(
      m.pipeline_warning_small_dataset({ count: '3' })
    );
  });

  it(`warns when null ratio > ${HIGH_NULL_RATIO_THRESHOLD}`, () => {
    const nullRatio = HIGH_NULL_RATIO_THRESHOLD + 0.1;
    const totalCount = 10;
    const nulls = Math.ceil(totalCount * nullRatio);
    const count = totalCount - nulls;
    const warnings = computeQualityWarnings(
      [col('col_a', { count, nulls, uniques: 2 })],
      totalCount
    );
    expect(warnings.some((w) => w.includes('col_a'))).toBe(true);
  });

  it(`warns when uniqueness ratio < ${LOW_CARDINALITY_THRESHOLD}`, () => {
    const warnings = computeQualityWarnings(
      [col('cat', { count: 1000, nulls: 0, uniques: 1 })],
      1000
    );
    expect(warnings.some((w) => w.includes('cat'))).toBe(true);
  });

  it('does not warn for healthy columns', () => {
    const warnings = computeQualityWarnings(
      [col('id', { count: 100, nulls: 0, uniques: 100 })],
      100
    );
    expect(warnings).toHaveLength(0);
  });
});
