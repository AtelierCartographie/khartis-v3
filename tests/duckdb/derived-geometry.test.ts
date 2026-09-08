import { describe, expect, it, vi } from 'vitest';
import { rebuildDerivedGeometryTables } from '$lib/features/duckdb/operations/derived-geometry';

type DuckMock = Parameters<typeof rebuildDerivedGeometryTables>[0];

function createDuck(shouldFail: (sql: string) => boolean = () => false): {
  duck: DuckMock;
  queries: string[];
} {
  const queries: string[] = [];
  const duck = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (shouldFail(sql)) {
        throw new Error('TopologyException: found non-noded intersection');
      }
      return [];
    }),
    invalidateTableCache: vi.fn()
  };
  return { duck: duck as unknown as DuckMock, queries };
}

function findQueries(queries: string[], macro: string): string[] {
  return queries.filter((sql) => sql.includes(macro));
}

describe('rebuildDerivedGeometryTables', () => {
  it('derives the three tables in one pass when the coverage unions cleanly', async () => {
    const { duck, queries } = createDuck();

    await rebuildDerivedGeometryTables(duck, 'regions');

    expect(findQueries(queries, 'extract_land(')).toHaveLength(1);
    expect(findQueries(queries, 'extract_outerlines(')).toHaveLength(1);
    expect(findQueries(queries, 'extract_innerlines(')).toHaveLength(1);
    for (const sql of queries) {
      expect(sql).toContain('noding_factor := 0');
    }
  });

  it('re-nodes the coverage when GEOS refuses to union it as is', async () => {
    const { duck, queries } = createDuck(
      (sql) =>
        sql.includes('extract_land(') && sql.includes('noding_factor := 0)')
    );

    await rebuildDerivedGeometryTables(duck, 'regions');

    const landQueries = findQueries(queries, 'extract_land(');
    expect(landQueries).toHaveLength(2);
    expect(landQueries[1]).toMatch(/noding_factor := 0\.\d+/);
    expect(queries.some((sql) => sql.includes('WHERE FALSE'))).toBe(false);
  });

  it('leaves an empty table rather than a stale one when even re-nodding fails', async () => {
    const { duck, queries } = createDuck((sql) =>
      sql.includes('extract_innerlines(')
    );

    await rebuildDerivedGeometryTables(duck, 'regions');

    expect(findQueries(queries, 'extract_innerlines(')).toHaveLength(2);
    const emptyTableQuery = queries.find((sql) => sql.includes('WHERE FALSE'));
    expect(emptyTableQuery).toContain(
      'CREATE OR REPLACE TABLE "regions__innerlines"'
    );
  });
});
