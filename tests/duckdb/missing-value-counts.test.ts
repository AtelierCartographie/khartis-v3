import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getMissingValueCountsInScope,
  type DuckDBClientForTableData
} from '$lib/features/duckdb/orchestrator/table-data-ops';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

let db: TestDuckDB;
let duck: DuckDBClientForTableData;

beforeAll(async () => {
  db = await createTestInstance();
  duck = {
    query: async (sql: string) => {
      const rows = await query(db, sql);
      return {
        numRows: rows.length,
        get: (index: number) => rows[index],
        toArray: () => rows
      };
    },
    describe_table: async () => ({ name: [], type: [] }),
    analyse: async () => []
  };

  await run(
    db,
    `CREATE TABLE communes AS SELECT * FROM (VALUES
      ('A', 10.0, 'rural', 'FR-01'),
      ('B', NULL, 'urbain', 'FR-02'),
      ('C', 'NaN'::DOUBLE, '  ', 'FR-03'),
      ('D', 5.0, NULL, NULL),
      ('E', NULL, 'rural', NULL)
    ) AS t(name, rate, kind, basemap_id)`
  );
});

afterAll(async () => {
  await destroyTestInstance(db);
});

describe('getMissingValueCountsInScope', () => {
  it('counts null and non-finite numbers, and null or blank labels', async () => {
    const counts = await getMissingValueCountsInScope(
      'communes',
      null,
      [
        { column: 'rate', numeric: true },
        { column: 'kind', numeric: false }
      ],
      duck
    );

    expect(counts).toEqual([3, 2]);
  });

  it('only counts the rows the scope lets through', async () => {
    const counts = await getMissingValueCountsInScope(
      'communes',
      '"rate" < 100',
      [{ column: 'rate', numeric: true }],
      duck
    );

    expect(counts).toEqual([0]);
  });

  it('ignores rows left out of the join', async () => {
    const counts = await getMissingValueCountsInScope(
      'communes',
      '"basemap_id" IS NOT NULL',
      [
        { column: 'rate', numeric: true },
        { column: 'kind', numeric: false }
      ],
      duck
    );

    expect(counts).toEqual([2, 1]);
  });
});
