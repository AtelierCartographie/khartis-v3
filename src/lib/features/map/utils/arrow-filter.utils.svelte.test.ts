import { Table, vectorFromArray } from 'apache-arrow';
import { describe, expect, it } from 'vitest';
import { selectRowsByIndices, selectRowsInScope } from './arrow-filter.utils';

function createTable(rowIds: number[], names: string[]): Table {
  return new Table({
    __id: vectorFromArray(rowIds),
    name: vectorFromArray(names)
  });
}

function readNames(table: Table): string[] {
  const column = table.getChild('name');
  return Array.from({ length: table.numRows }, (_, index) =>
    String(column?.get(index))
  );
}

describe('selectRowsInScope', () => {
  it('returns the table itself when nothing is filtered', () => {
    const table = createTable([1, 2, 3], ['Ajaccio', 'Bastia', 'Corte']);

    expect(selectRowsInScope(table, null)).toBe(table);
  });

  it('keeps only the rows DuckDB reported as in scope, in table order', () => {
    const table = createTable(
      [10, 11, 12, 13],
      ['Ajaccio', 'Bastia', 'Corte', 'Lille']
    );

    const scoped = selectRowsInScope(table, new Set([13, 10]));

    expect(readNames(scoped)).toEqual(['Ajaccio', 'Lille']);
  });

  it('reuses the source table when every row is in scope', () => {
    const table = createTable([1, 2], ['Ajaccio', 'Bastia']);

    expect(selectRowsInScope(table, new Set([1, 2]))).toBe(table);
  });

  it('empties the table when the scope excludes everything', () => {
    const table = createTable([1, 2], ['Ajaccio', 'Bastia']);

    expect(selectRowsInScope(table, new Set([99])).numRows).toBe(0);
  });

  it('caches per row-id set so a new scope is not served a stale slice', () => {
    const table = createTable([1, 2, 3], ['Ajaccio', 'Bastia', 'Corte']);
    const first = new Set([1]);

    expect(selectRowsInScope(table, first)).toBe(
      selectRowsInScope(table, first)
    );
    expect(readNames(selectRowsInScope(table, new Set([3])))).toEqual([
      'Corte'
    ]);
  });

  it('shows every row when the table carries no internal row id', () => {
    const table = new Table({ name: vectorFromArray(['Ajaccio']) });

    expect(selectRowsInScope(table, new Set([1]))).toBe(table);
  });
});

describe('selectRowsByIndices', () => {
  it('merges adjacent indices into a single slice', () => {
    const table = createTable(
      [1, 2, 3, 4],
      ['Ajaccio', 'Bastia', 'Corte', 'Lille']
    );

    expect(readNames(selectRowsByIndices(table, [1, 2]))).toEqual([
      'Bastia',
      'Corte'
    ]);
  });

  it('keeps disjoint indices', () => {
    const table = createTable(
      [1, 2, 3, 4],
      ['Ajaccio', 'Bastia', 'Corte', 'Lille']
    );

    expect(readNames(selectRowsByIndices(table, [0, 3]))).toEqual([
      'Ajaccio',
      'Lille'
    ]);
  });
});
