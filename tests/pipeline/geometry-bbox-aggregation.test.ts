import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

const REPO_ROOT = resolve(__dirname, '..', '..');
const NUTS2_PATH = resolve(
  REPO_ROOT,
  'static/tests-datasets/geojson/nuts2_data.geojson'
);

let dbInstance: Awaited<ReturnType<typeof DuckDBInstance.create>>;
let dbConnection: DuckDBConnection;

beforeAll(async () => {
  dbInstance = await DuckDBInstance.create(':memory:', {
    threads: '2',
    autoinstall_known_extensions: 'true',
    autoload_known_extensions: 'true'
  });
  dbConnection = await dbInstance.connect();
  await dbConnection.run('INSTALL spatial');
  await dbConnection.run('LOAD spatial');
  await dbConnection.run(
    `CREATE OR REPLACE TABLE nuts2 AS FROM ST_Read('${NUTS2_PATH}')`
  );
});

afterAll(() => {
  dbConnection.closeSync();
  dbInstance.closeSync();
});

async function fetchSingleRow<T extends Record<string, unknown>>(
  sql: string
): Promise<T> {
  const reader = await dbConnection.runAndReadAll(sql);
  const rows = reader.getRowObjects();
  return rows[0] as T;
}

async function fetchAllRows<T extends Record<string, unknown>>(
  sql: string
): Promise<T[]> {
  const reader = await dbConnection.runAndReadAll(sql);
  return reader.getRowObjects() as T[];
}

describe('extractGeometryInfo bbox aggregation', () => {
  it('ST_Extent is scalar — returns one row per feature, not a global bbox', async () => {
    const rows = await fetchAllRows<{ cnt: bigint }>(
      'SELECT COUNT(*)::BIGINT AS cnt FROM (SELECT ST_Extent(geom) FROM nuts2)'
    );
    expect(Number(rows[0].cnt)).toBe(332);
  });

  it('ST_Extent_Agg aggregates the bbox over all features (Europe + DOM-TOM)', async () => {
    const row = await fetchSingleRow<{
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
    }>(
      `WITH bbox AS (SELECT ST_Extent_Agg(geom) AS extent FROM nuts2)
       SELECT
         ST_XMin(extent) AS "minX",
         ST_XMax(extent) AS "maxX",
         ST_YMin(extent) AS "minY",
         ST_YMax(extent) AS "maxY"
       FROM bbox`
    );

    expect(row.minX).toBeCloseTo(-63.09, 1);
    expect(row.maxX).toBeCloseTo(55.84, 1);
    expect(row.minY).toBeCloseTo(-21.39, 1);
    expect(row.maxY).toBeCloseTo(71.12, 1);
  });

  it('basemap-import bbox query reproduces extractGeometryInfo result (regression guard)', async () => {
    // Reproduces the exact SQL pattern used in basemap-import.service.ts:queryBasemapBounds.
    // Before the fix this used scalar ST_Extent and returned only the first feature's bbox.
    const row = await fetchSingleRow<{
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
    }>(
      `WITH agg AS (
         SELECT ST_Extent_Agg(geom) AS extent FROM nuts2
       )
       SELECT
         ST_XMin(extent) AS "minX",
         ST_YMin(extent) AS "minY",
         ST_XMax(extent) AS "maxX",
         ST_YMax(extent) AS "maxY"
       FROM agg`
    );

    expect(row.minX).toBeCloseTo(-63.09, 1);
    expect(row.maxX).toBeCloseTo(55.84, 1);
    expect(row.minY).toBeCloseTo(-21.39, 1);
    expect(row.maxY).toBeCloseTo(71.12, 1);

    // The pre-fix scalar query would return the bbox of the first feature only
    // (Burgenland, Austria). The aggregated bbox must be at least 100x larger.
    const aggArea = (row.maxX - row.minX) * (row.maxY - row.minY);
    expect(aggArea).toBeGreaterThan(10000);
  });

  it('ST_Extent_Agg matches MIN/MAX(ST_X*/ST_Y*) over the column', async () => {
    const aggRow = await fetchSingleRow<{
      a_minX: number;
      a_maxX: number;
      a_minY: number;
      a_maxY: number;
    }>(
      `WITH bbox AS (SELECT ST_Extent_Agg(geom) AS extent FROM nuts2)
       SELECT
         ST_XMin(extent) AS "a_minX",
         ST_XMax(extent) AS "a_maxX",
         ST_YMin(extent) AS "a_minY",
         ST_YMax(extent) AS "a_maxY"
       FROM bbox`
    );
    const refRow = await fetchSingleRow<{
      r_minX: number;
      r_maxX: number;
      r_minY: number;
      r_maxY: number;
    }>(
      `SELECT
         MIN(ST_XMin(geom)) AS "r_minX",
         MAX(ST_XMax(geom)) AS "r_maxX",
         MIN(ST_YMin(geom)) AS "r_minY",
         MAX(ST_YMax(geom)) AS "r_maxY"
       FROM nuts2`
    );

    expect(aggRow.a_minX).toBeCloseTo(refRow.r_minX, 6);
    expect(aggRow.a_maxX).toBeCloseTo(refRow.r_maxX, 6);
    expect(aggRow.a_minY).toBeCloseTo(refRow.r_minY, 6);
    expect(aggRow.a_maxY).toBeCloseTo(refRow.r_maxY, 6);
  });
});
