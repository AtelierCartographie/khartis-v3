import { describe, expect, it } from 'vitest';

import * as m from '$lib/paraglide/messages';
import {
  ColumnType,
  type EnrichedColumn
} from '$lib/features/data-pipeline/types';
import { computeQualityWarnings } from '$lib/features/data-pipeline/operations/quality';

function col(
  name: string,
  stats: Partial<EnrichedColumn['stats']>
): EnrichedColumn {
  return {
    name,
    type: ColumnType.TEXT,
    values: [],
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
  it('warns when dataset has no rows', () => {
    const warnings = computeQualityWarnings([], 0);
    expect(warnings).toEqual([m.pipeline_warning_no_data_rows()]);
  });

  it('warns for single-row and small datasets', () => {
    const warnings = computeQualityWarnings([], 1);

    expect(warnings).toContain(m.pipeline_warning_single_row());
    expect(warnings).toContain(
      m.pipeline_warning_small_dataset({ count: '1' })
    );
  });

  it('warns for high null ratio and low cardinality', () => {
    const warnings = computeQualityWarnings(
      [
        col('mostly_null', { count: 10, nulls: 8, uniques: 2 }),
        col('almost_constant', { count: 200, nulls: 0, uniques: 1 })
      ],
      200
    );

    expect(warnings).toContain(
      m.pipeline_warning_high_nulls({ column: 'mostly_null', percent: '80.0' })
    );
    expect(warnings).toContain(
      m.pipeline_warning_low_cardinality({
        column: 'almost_constant',
        uniques: '1',
        total: '200'
      })
    );
  });

  it('does not warn on regular dataset', () => {
    const warnings = computeQualityWarnings(
      [col('ok', { count: 100, nulls: 1, uniques: 50 })],
      100
    );

    expect(warnings).toEqual([]);
  });
});
