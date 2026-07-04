import { Table, vectorFromArray } from 'apache-arrow';
import { describe, expect, it } from 'vitest';
import type { VizDataFilter } from '$lib/features/commons/stores/visualization.store.svelte';
import type { DataTableFilter } from '$lib/features/duckdb';
import {
  filterArrowTableByDataFilters,
  filterArrowTableByTableFilters
} from './arrow-filter.utils';

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

  it('does not match rows for unsupported data-filter operators', () => {
    const table = new Table({
      age: vectorFromArray([30, 40])
    });

    const filters = [
      {
        id: 'unsupported',
        column: 'age',
        operator: 'unsupported_operator',
        value: '30'
      }
    ] as unknown as VizDataFilter[];

    expect(filterArrowTableByDataFilters(table, filters).numRows).toBe(0);
  });

  it('keeps data-filter top operators on the shared row path', () => {
    const table = new Table({
      city: vectorFromArray(['Paris', 'Lyon', 'Marseille']),
      population: vectorFromArray([2_100_000, 520_000, 870_000])
    });

    const filters = [
      {
        id: 'top-population',
        column: 'population',
        operator: 'top_desc',
        value: '',
        limit: 2
      }
    ] as VizDataFilter[];

    const result = filterArrowTableByDataFilters(table, filters);

    expect(result.numRows).toBe(2);
    expect(result.getChild('city')?.toArray()).toEqual(['Paris', 'Marseille']);
  });

  it('applies table filters through the shared row path', () => {
    const table = new Table({
      age: vectorFromArray([30, 40, 50]),
      name: vectorFromArray(['Alice', 'Bob', 'Charlie'])
    });

    const filters = [
      {
        id: 'age-between',
        label: 'age',
        column: 'age',
        operator: 'between',
        value: 35,
        secondaryValue: 45,
        sql: ''
      },
      {
        id: 'name-contains',
        label: 'name',
        column: 'name',
        operator: 'contains',
        value: 'bo',
        sql: ''
      }
    ] satisfies DataTableFilter[];

    const result = filterArrowTableByTableFilters(table, filters);

    expect(result.numRows).toBe(1);
    expect(result.getChild('name')?.toArray()).toEqual(['Bob']);
  });
});
