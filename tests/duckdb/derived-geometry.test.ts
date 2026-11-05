import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  arePolygonsOverlapping,
  isMeshTooFineForInnerLimits,
  rebuildDerivedGeometryTables
} from '$lib/features/duckdb/operations/derived-geometry';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

type DuckMock = Parameters<typeof rebuildDerivedGeometryTables>[0];

function createDuck(
  shouldFail: (sql: string) => boolean = () => false,
  {
    validCoverage = false,
    failure = 'TopologyException: found non-noded intersection'
  }: { validCoverage?: boolean; failure?: string } = {}
): {
  duck: DuckMock;
  queries: string[];
} {
  const queries: string[] = [];
  const duck = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (shouldFail(sql)) {
        throw new Error(failure);
      }
      if (sql.includes('is_valid_polygon_coverage(')) {
        return [{ is_valid: validCoverage }];
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
    for (const sql of [
      ...findQueries(queries, 'extract_land('),
      ...findQueries(queries, 'extract_innerlines(')
    ]) {
      expect(sql).toContain('noding_factor := 0');
    }
  });

  it('derives a valid coverage from its shared vertices, without any dissolve', async () => {
    const { duck, queries } = createDuck(() => false, { validCoverage: true });

    await rebuildDerivedGeometryTables(duck, 'regions');

    expect(findQueries(queries, 'extract_coverage_land(')).toHaveLength(1);
    expect(findQueries(queries, 'extract_coverage_innerlines(')).toHaveLength(
      1
    );
    expect(findQueries(queries, 'extract_land(')).toHaveLength(0);
    expect(findQueries(queries, 'extract_innerlines(')).toHaveLength(0);
    expect(findQueries(queries, 'extract_outerlines(')).toHaveLength(1);
  });

  it('falls back to the dissolve when the coverage path fails', async () => {
    const { duck, queries } = createDuck(
      (sql) => sql.includes('extract_coverage_innerlines('),
      { validCoverage: true }
    );

    await rebuildDerivedGeometryTables(duck, 'regions');

    const innerlinesQueries = findQueries(
      queries,
      'CREATE OR REPLACE TABLE "regions__innerlines"'
    );
    expect(innerlinesQueries).toHaveLength(2);
    expect(innerlinesQueries[1]).toContain('extract_innerlines(');
    expect(queries.some((sql) => sql.includes('WHERE FALSE'))).toBe(false);
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
    // The borders match the outline of the territory only on the same grid.
    const innerlinesQueries = findQueries(queries, 'extract_innerlines(');
    expect(innerlinesQueries).toHaveLength(1);
    expect(innerlinesQueries[0]).toMatch(/noding_factor := 0\.\d+/);
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

  it('neither retries nor goes on once a derivation runs out of memory', async () => {
    const { duck, queries } = createDuck(
      (sql) => sql.includes('extract_land('),
      { failure: 'Out of Memory Error: Allocation failure' }
    );

    await rebuildDerivedGeometryTables(duck, 'regions');

    expect(findQueries(queries, 'extract_land(')).toHaveLength(1);
    expect(findQueries(queries, 'extract_outerlines(')).toHaveLength(0);
    expect(findQueries(queries, 'extract_innerlines(')).toHaveLength(0);
    const emptyTables = queries.filter((sql) => sql.includes('WHERE FALSE'));
    expect(emptyTables).toHaveLength(3);
  });
});

describe('isMeshTooFineForInnerLimits', () => {
  let db: TestDuckDB;
  const duck = {
    query: (sql: string) => query(db, sql)
  } as unknown as DuckMock;

  beforeAll(async () => {
    db = await createTestInstance();
    await run(db, 'LOAD spatial');
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  async function createStripOfCells(tableName: string, cellCount: number) {
    await run(
      db,
      `CREATE OR REPLACE TABLE ${tableName} AS
       SELECT ST_MakeEnvelope(i, 0, i + 1, 1) AS geom
       FROM range(${cellCount}) t(i)`
    );
  }

  it('should skip the inner limits when the mean cell is finer than 1/500 of the extent', async () => {
    await createStripOfCells('fine_grid', 1000);

    expect(await isMeshTooFineForInnerLimits(duck, 'fine_grid')).toBe(true);
  });

  it('should keep the inner limits when the cells stay readable across the extent', async () => {
    await createStripOfCells('coarse_grid', 100);

    expect(await isMeshTooFineForInnerLimits(duck, 'coarse_grid')).toBe(false);
  });
});

describe('arePolygonsOverlapping', () => {
  let db: TestDuckDB;
  const duck = {
    query: (sql: string) => query(db, sql)
  } as unknown as DuckMock;

  beforeAll(async () => {
    db = await createTestInstance();
    await run(db, 'LOAD spatial');
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  async function createSquares(tableName: string, secondSquareX: number) {
    await run(
      db,
      `CREATE OR REPLACE TABLE ${tableName} AS
       SELECT * FROM (VALUES
         (ST_MakeEnvelope(0, 0, 10, 10)),
         (ST_MakeEnvelope(${secondSquareX}, 0, ${secondSquareX} + 10, 10))
       ) t(geom)`
    );
    await run(
      db,
      `CREATE OR REPLACE TABLE ${tableName}__land AS
       SELECT ST_Union_Agg(geom) AS geom FROM ${tableName}`
    );
  }

  it('should flag polygons that cover each other', async () => {
    await createSquares('overlapping', 5);

    expect(
      await arePolygonsOverlapping(duck, 'overlapping', 'overlapping__land')
    ).toBe(true);
  });

  it('should let a sliver between neighbours through', async () => {
    // 0.01 of overlap on a 10x10 edge: 0.05 % of the territory.
    await createSquares('sliver', 9.99);

    expect(await arePolygonsOverlapping(duck, 'sliver', 'sliver__land')).toBe(
      false
    );
  });
});
