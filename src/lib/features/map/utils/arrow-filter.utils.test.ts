import { describe, it, expect } from 'vitest';
import { buildYearFilterWhereClause } from '../../duckdb/orchestrator/arrow-ops';
import { filterArrowTableByDataFilters } from './arrow-filter.utils';
import { tableFromArrays, tableFromIPC, Table } from 'apache-arrow/Arrow';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';
import type { VizDataFilter } from '$lib/features/commons/store/visualization.store.svelte';

describe('buildYearFilterWhereClause', () => {
  it('should return null when filter is undefined', () => {
    const result = buildYearFilterWhereClause(undefined);
    expect(result).toBeNull();
  });

  it('should build WHERE clause for numeric year value', () => {
    const result = buildYearFilterWhereClause({ column: 'year', value: 2023 });
    expect(result).toBe('"year" = 2023');
  });

  it('should build WHERE clause for string year value', () => {
    const result = buildYearFilterWhereClause({
      column: 'annee',
      value: '2023'
    });
    expect(result).toBe('"annee" = \'2023\'');
  });

  it('should escape single quotes in string values', () => {
    const result = buildYearFilterWhereClause({
      column: 'year',
      value: "2023'; DROP TABLE users; --"
    });
    expect(result).toBe("\"year\" = '2023''; DROP TABLE users; --'");
    expect(result?.includes("''")).toBe(true);
  });

  it('should handle column names with special characters', () => {
    const result = buildYearFilterWhereClause({
      column: 'year_value',
      value: 2023
    });
    expect(result).toBe('"year_value" = 2023');
  });
});

function makeTable(data: Record<string, unknown[]>): ArrowTable {
  return tableFromArrays(data) as unknown as ArrowTable;
}

describe('filterArrowTableByDataFilters', () => {
  const sampleTable = makeTable({
    name: ['France', 'Germany', 'Spain', 'Italy', 'Portugal'],
    population: [67, 83, 47, 60, 10]
  });

  it('should return same table when no filters', () => {
    const result = filterArrowTableByDataFilters(sampleTable, undefined);
    expect(result).toBe(sampleTable);
    expect(filterArrowTableByDataFilters(sampleTable, [])).toBe(sampleTable);
  });

  it('should filter with gte operator', () => {
    const filters: VizDataFilter[] = [
      { id: '1', column: 'population', operator: 'gte', value: '60' }
    ];
    const result = filterArrowTableByDataFilters(sampleTable, filters);
    expect(result.numRows).toBe(3);
  });

  it('should filter with lte operator', () => {
    const filters: VizDataFilter[] = [
      { id: '1', column: 'population', operator: 'lte', value: '47' }
    ];
    const result = filterArrowTableByDataFilters(sampleTable, filters);
    expect(result.numRows).toBe(2);
  });

  it('should filter with equals operator on strings', () => {
    const filters: VizDataFilter[] = [
      { id: '1', column: 'name', operator: 'equals', value: 'France' }
    ];
    const result = filterArrowTableByDataFilters(sampleTable, filters);
    expect(result.numRows).toBe(1);
  });

  it('should filter with not_equals operator', () => {
    const filters: VizDataFilter[] = [
      { id: '1', column: 'name', operator: 'not_equals', value: 'France' }
    ];
    const result = filterArrowTableByDataFilters(sampleTable, filters);
    expect(result.numRows).toBe(4);
  });

  it('should filter with between operator', () => {
    const filters: VizDataFilter[] = [
      {
        id: '1',
        column: 'population',
        operator: 'between',
        value: '40',
        secondaryValue: '70'
      }
    ];
    const result = filterArrowTableByDataFilters(sampleTable, filters);
    expect(result.numRows).toBe(3);
  });

  it('should apply multiple filters (AND logic)', () => {
    const filters: VizDataFilter[] = [
      { id: '1', column: 'population', operator: 'gte', value: '50' },
      { id: '2', column: 'name', operator: 'not_equals', value: 'Italy' }
    ];
    const result = filterArrowTableByDataFilters(sampleTable, filters);
    expect(result.numRows).toBe(2);
  });

  it('should ignore filters for non-existent columns', () => {
    const filters: VizDataFilter[] = [
      { id: '1', column: 'nonexistent', operator: 'gte', value: '50' }
    ];
    const result = filterArrowTableByDataFilters(sampleTable, filters);
    expect(result).toBe(sampleTable);
  });
});
