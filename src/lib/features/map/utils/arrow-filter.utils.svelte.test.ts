import { Table, vectorFromArray } from 'apache-arrow';
import { describe, expect, it } from 'vitest';
import type { VizDataFilter } from '$lib/features/commons/stores/visualization.store.svelte';
import { filterArrowTableByDataFilters } from './arrow-filter.utils';

describe('arrow-filter utils', () => {
  it('does not reuse cached data-filter results when user values contain cache separators', () => {
    const table = new Table({
      age: vectorFromArray([30, 40]),
      name: vectorFromArray(['Alice', 'Bob'])
    });

    const collisionLikeFilter = [
      {
        id: 'collision-like',
        column: 'age',
        operator: 'gte',
        value: '30:::|name:contains:alice'
      }
    ] as VizDataFilter[];

    const validFilters = [
      { id: 'age-filter', column: 'age', operator: 'gte', value: '30' },
      {
        id: 'name-filter',
        column: 'name',
        operator: 'contains',
        value: 'alice'
      }
    ] as VizDataFilter[];

    expect(
      filterArrowTableByDataFilters(table, collisionLikeFilter).numRows
    ).toBe(0);
    expect(filterArrowTableByDataFilters(table, validFilters).numRows).toBe(1);
  });
});
