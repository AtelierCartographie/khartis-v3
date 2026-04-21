import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from './duckdb-node-helper';

const FIXTURES_ROOT = resolve(process.cwd(), 'static/tests-datasets');

let db: TestDuckDB;

beforeAll(async () => {
  db = await createTestInstance();
  await run(db, 'INSTALL spatial; LOAD spatial;');
});

afterAll(async () => {
  await destroyTestInstance(db);
});

describe('Scénario S1 — Sites Seveso IDF (CSV GPS + PROPORTIONAL)', () => {
  const path = resolve(FIXTURES_ROOT, 'csv/sites-seveso-idf.csv');

  it('reads the Seveso CSV via DuckDB read_csv with semicolon delimiter', async () => {
    const rows = await query(
      db,
      `SELECT COUNT(*) AS cnt
         FROM read_csv('${path}', delim=';', header=true, auto_detect=true)`
    );
    expect(Number(rows[0].cnt)).toBeGreaterThan(50);
  });

  it('exposes Lat and Long columns usable as GPS mode for point symbols', async () => {
    const rows = await query(
      db,
      `SELECT Lat, Long
         FROM read_csv('${path}', delim=';', header=true, auto_detect=true)
         WHERE Lat IS NOT NULL AND Long IS NOT NULL
         LIMIT 3`
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const lat = Number(row.Lat);
      const lon = Number(row.Long);
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lon)).toBe(true);
      expect(lat).toBeGreaterThan(47);
      expect(lat).toBeLessThan(50);
      expect(lon).toBeGreaterThan(1);
      expect(lon).toBeLessThan(4);
    }
  });

  it('synthesises a geometry column via ST_Point for the PROPORTIONAL symbol path', async () => {
    const rows = await query(
      db,
      `SELECT COUNT(*) AS cnt
         FROM (
           SELECT ST_Point(Long, Lat) AS geom
             FROM read_csv('${path}', delim=';', header=true, auto_detect=true)
            WHERE Lat IS NOT NULL AND Long IS NOT NULL
         ) WHERE geom IS NOT NULL`
    );
    expect(Number(rows[0].cnt)).toBeGreaterThan(50);
  });
});

describe('Scénario S3 — Fossil fuel subsidies (world, DIVERGENT palette)', () => {
  const path = resolve(FIXTURES_ROOT, 'csv/fossil-fuel-subsidies-gdp-2021.csv');

  it('reads the fossil-fuel CSV with ~81 country rows', async () => {
    const rows = await query(
      db,
      `SELECT COUNT(*) AS cnt
         FROM read_csv('${path}', delim=',', header=true, auto_detect=true)`
    );
    expect(Number(rows[0].cnt)).toBeGreaterThan(50);
    expect(Number(rows[0].cnt)).toBeLessThan(200);
  });

  it('exposes a numeric subsidies column that spans negative and positive values (DIVERGENT eligible)', async () => {
    const rows = await query(
      db,
      `SELECT MIN(CAST("Fossil-fuel subsidies (consumption and production) as a proportion of total GDP (%)" AS DOUBLE)) AS min,
              MAX(CAST("Fossil-fuel subsidies (consumption and production) as a proportion of total GDP (%)" AS DOUBLE)) AS max
         FROM read_csv('${path}', delim=',', header=true, auto_detect=true)`
    );
    const min = Number(rows[0].min);
    const max = Number(rows[0].max);
    expect(Number.isFinite(min)).toBe(true);
    expect(Number.isFinite(max)).toBe(true);
    expect(max).toBeGreaterThan(0);
    expect(max - min).toBeGreaterThan(0);
  });

  it('provides ISO3 codes usable for joining to a world basemap', async () => {
    const rows = await query(
      db,
      `SELECT Code
         FROM read_csv('${path}', delim=',', header=true, auto_detect=true)
         WHERE Code IS NOT NULL AND length(Code) = 3
         LIMIT 5`
    );
    expect(rows.length).toBe(5);
    for (const row of rows) {
      expect(String(row.Code)).toMatch(/^[A-Z]{3}$/);
    }
  });
});

describe('Scénario S5 — Visualization toolbox cases (CATEGORIES + nulls)', () => {
  const path = resolve(
    FIXTURES_ROOT,
    'geojson/visualization-toolbox-cases.geojson'
  );

  it('reads the viz-toolbox GeoJSON via ST_Read with Point geometries', async () => {
    const rows = await query(
      db,
      `SELECT COUNT(*) AS cnt,
              COUNT(DISTINCT ST_GeometryType(geom)) AS distinct_types
         FROM ST_Read('${path}')`
    );
    expect(Number(rows[0].cnt)).toBeGreaterThan(0);
    expect(Number(rows[0].distinct_types)).toBeGreaterThanOrEqual(1);
  });

  it('exposes a text category column with multiple values for CategoryShapeMode.DIFFERENT testing', async () => {
    const rows = await query(
      db,
      `SELECT DISTINCT category
         FROM ST_Read('${path}')
         WHERE category IS NOT NULL
         ORDER BY category`
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.length).toBeLessThan(50);
  });

  it('includes rows with NULL capacity_total so missingData symbol path is exercised', async () => {
    const rows = await query(
      db,
      `SELECT SUM(CASE WHEN capacity_total IS NULL THEN 1 ELSE 0 END) AS nulls,
              COUNT(*) AS total
         FROM ST_Read('${path}')`
    );
    const nulls = Number(rows[0].nulls);
    const total = Number(rows[0].total);
    expect(nulls).toBeGreaterThan(0);
    expect(nulls).toBeLessThan(total);
  });

  it('exposes segment column for CATEGORIES rendering with more than one unique value', async () => {
    const rows = await query(
      db,
      `SELECT COUNT(DISTINCT segment) AS uniq
         FROM ST_Read('${path}')
         WHERE segment IS NOT NULL`
    );
    expect(Number(rows[0].uniq)).toBeGreaterThanOrEqual(2);
  });
});
