import { describe, expect, it } from 'vitest';
import { tableFromArrays } from 'apache-arrow';

import type {
  PrimitiveFilter,
  VizDataFilter
} from '$lib/features/commons/store/visualization.store.svelte';
import {
  filterArrowTableByDataFilters,
  filterArrowTableByYear
} from '$lib/features/map/utils/arrow-filter.utils';

const POINT_PRIMITIVE = 'point' as PrimitiveFilter;
const POLYGON_PRIMITIVE = 'polygon' as PrimitiveFilter;

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

describe('filterArrowTableByDataFilters', () => {
  it('supports text containment and empty-state operators', () => {
    const table = tableFromArrays({
      label: ['Paris', 'Lyon', '', null],
      value: [10, 20, 30, 40]
    });

    const containsOnly = filterArrowTableByDataFilters(table, [
      {
        id: 'contains-filter',
        column: 'label',
        operator: 'contains',
        value: 'ly'
      }
    ]);

    expect(containsOnly.numRows).toBe(1);
    expect(Array.from(containsOnly.getChild('label')?.toArray() ?? [])).toEqual(
      ['Lyon']
    );

    const emptyOnly = filterArrowTableByDataFilters(table, [
      {
        id: 'empty-filter',
        column: 'label',
        operator: 'empty',
        value: ''
      }
    ]);

    expect(emptyOnly.numRows).toBe(2);

    const notEmptyOnly = filterArrowTableByDataFilters(table, [
      {
        id: 'not-empty-filter',
        column: 'label',
        operator: 'not_empty',
        value: ''
      }
    ]);

    expect(notEmptyOnly.numRows).toBe(2);
    expect(Array.from(notEmptyOnly.getChild('label')?.toArray() ?? [])).toEqual(
      ['Paris', 'Lyon']
    );
  });

  it('supports primitive-scoped top filters and reuses the cached result', () => {
    const table = tableFromArrays({
      metric: [14, 30, 7, 22],
      category: ['a', 'b', 'c', 'd']
    });

    const filters: VizDataFilter[] = [
      {
        id: 'point-top',
        column: 'metric',
        operator: 'top_desc' as const,
        value: '2',
        limit: 2,
        primitiveType: POINT_PRIMITIVE
      },
      {
        id: 'polygon-ignore',
        column: 'metric',
        operator: 'top_asc' as const,
        value: '1',
        limit: 1,
        primitiveType: POLYGON_PRIMITIVE
      }
    ];

    const first = filterArrowTableByDataFilters(
      table,
      filters,
      POINT_PRIMITIVE
    );
    const second = filterArrowTableByDataFilters(
      table,
      filters,
      POINT_PRIMITIVE
    );

    expect(first.numRows).toBe(2);
    expect(Array.from(first.getChild('metric')?.toArray() ?? [])).toEqual([
      30, 22
    ]);
    expect(second).toBe(first);
  });
});
