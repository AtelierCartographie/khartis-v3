import { describe, expect, it } from 'vitest';
import { tableFromArrays } from 'apache-arrow';

import { filterArrowTableByYear } from '$lib/features/map/utils/arrow-filter.utils';

describe('filterArrowTableByYear', () => {
  it('returns only rows matching the requested numeric year', () => {
    const table = tableFromArrays({
      year: [2021, 2023, 2024, 2023],
      category: ['public', 'private', 'public', 'private']
    });

    const filtered = filterArrowTableByYear(table, {
      column: 'year',
      value: 2023
    });

    expect(filtered.numRows).toBe(2);
    expect(Array.from(filtered.getChild('year')?.toArray() ?? [])).toEqual([
      2023, 2023
    ]);
    expect(Array.from(filtered.getChild('category')?.toArray() ?? [])).toEqual([
      'private',
      'private'
    ]);
  });

  it('reuses the cached filtered table for the same source table and year', () => {
    const table = tableFromArrays({
      year: [2023, 2024, 2023],
      value: [10, 20, 30]
    });

    const first = filterArrowTableByYear(table, {
      column: 'year',
      value: 2023
    });
    const second = filterArrowTableByYear(table, {
      column: 'year',
      value: 2023
    });

    expect(second).toBe(first);
  });
});
