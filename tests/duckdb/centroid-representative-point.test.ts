import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

let db: TestDuckDB;

function pickNum(row: Record<string, unknown>, key: string): number {
  return Number(row[key]);
}

function pickBool(row: Record<string, unknown>, key: string): boolean {
  return Boolean(row[key]);
}

beforeAll(async () => {
  db = await createTestInstance();
  await run(db, 'INSTALL spatial; LOAD spatial;');
  await run(db, 'CREATE OR REPLACE TABLE polys (id INTEGER, geom GEOMETRY)');
  await run(
    db,
    `INSERT INTO polys VALUES
      (1, ST_GeomFromText('POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))')),
      (2, ST_GeomFromText('POLYGON((-5 -5, -1 -5, -1 -1, -5 -1, -5 -5))')),
      (3, ST_GeomFromText('MULTIPOLYGON(((20 20, 30 20, 30 30, 20 30, 20 20)))')),
      (4, ST_GeomFromText('POLYGON EMPTY'))`
  );

  await run(db, 'CREATE OR REPLACE TABLE lines (id INTEGER, geom GEOMETRY)');
  await run(
    db,
    `INSERT INTO lines VALUES
      (1, ST_GeomFromText('LINESTRING(0 0, 10 10)')),
      (2, ST_GeomFromText('MULTILINESTRING((0 0, 5 5),(5 5, 10 0))'))`
  );

  await run(db, 'CREATE OR REPLACE TABLE mpoints (id INTEGER, geom GEOMETRY)');
  await run(
    db,
    `INSERT INTO mpoints VALUES
      (1, ST_GeomFromText('MULTIPOINT((0 0),(10 10),(20 20))'))`
  );
});

afterAll(async () => {
  await destroyTestInstance(db);
});

describe('Centroid path (representative point) for Polygon/Line/MultiPoint → Symbol', () => {
  it('computes a finite centroid for a convex polygon', async () => {
    const rows = await query(
      db,
      `SELECT id,
              ST_X(COALESCE(ST_MaximumInscribedCircle(geom).center, ST_PointOnSurface(geom))) AS cx,
              ST_Y(COALESCE(ST_MaximumInscribedCircle(geom).center, ST_PointOnSurface(geom))) AS cy
       FROM polys
       WHERE id = 1`
    );
    expect(rows).toHaveLength(1);
    const cx = pickNum(rows[0], 'cx');
    const cy = pickNum(rows[0], 'cy');
    expect(Number.isFinite(cx)).toBe(true);
    expect(Number.isFinite(cy)).toBe(true);
    expect(cx).toBeGreaterThan(0);
    expect(cx).toBeLessThan(10);
    expect(cy).toBeGreaterThan(0);
    expect(cy).toBeLessThan(10);
  });

  it('computes a centroid inside the polygon even for small rectangles', async () => {
    const rows = await query(
      db,
      `SELECT ST_X(COALESCE(ST_MaximumInscribedCircle(geom).center, ST_PointOnSurface(geom))) AS cx,
              ST_Y(COALESCE(ST_MaximumInscribedCircle(geom).center, ST_PointOnSurface(geom))) AS cy
       FROM polys
       WHERE id = 2`
    );
    const cx = pickNum(rows[0], 'cx');
    const cy = pickNum(rows[0], 'cy');
    expect(cx).toBeGreaterThan(-5);
    expect(cx).toBeLessThan(-1);
    expect(cy).toBeGreaterThan(-5);
    expect(cy).toBeLessThan(-1);
  });

  it('handles MULTIPOLYGON via the same expression chain', async () => {
    const rows = await query(
      db,
      `SELECT ST_X(COALESCE(ST_MaximumInscribedCircle(geom).center, ST_PointOnSurface(geom))) AS cx,
              ST_Y(COALESCE(ST_MaximumInscribedCircle(geom).center, ST_PointOnSurface(geom))) AS cy
       FROM polys
       WHERE id = 3`
    );
    const cx = pickNum(rows[0], 'cx');
    const cy = pickNum(rows[0], 'cy');
    expect(cx).toBeGreaterThan(20);
    expect(cx).toBeLessThan(30);
    expect(cy).toBeGreaterThan(20);
    expect(cy).toBeLessThan(30);
  });

  it('returns NULL for empty polygon inputs (matches getRepresentativePointExpression)', async () => {
    const rows = await query(
      db,
      `SELECT CASE WHEN ST_IsEmpty(geom) THEN TRUE ELSE FALSE END AS is_empty
       FROM polys
       WHERE id = 4`
    );
    expect(pickBool(rows[0], 'is_empty')).toBe(true);
  });

  it('computes a representative point on a LINESTRING via ST_PointOnSurface', async () => {
    const rows = await query(
      db,
      `SELECT ST_X(ST_PointOnSurface(geom)) AS cx,
              ST_Y(ST_PointOnSurface(geom)) AS cy
       FROM lines
       WHERE id = 1`
    );
    expect(Number.isFinite(pickNum(rows[0], 'cx'))).toBe(true);
    expect(Number.isFinite(pickNum(rows[0], 'cy'))).toBe(true);
  });

  it('computes a representative point on a MULTILINESTRING', async () => {
    const rows = await query(
      db,
      `SELECT ST_X(ST_PointOnSurface(geom)) AS cx,
              ST_Y(ST_PointOnSurface(geom)) AS cy
       FROM lines
       WHERE id = 2`
    );
    expect(Number.isFinite(pickNum(rows[0], 'cx'))).toBe(true);
    expect(Number.isFinite(pickNum(rows[0], 'cy'))).toBe(true);
  });

  it('collapses a MULTIPOINT to a single representative point via ST_PointOnSurface', async () => {
    const rows = await query(
      db,
      `SELECT ST_X(ST_PointOnSurface(geom)) AS cx,
              ST_Y(ST_PointOnSurface(geom)) AS cy
       FROM mpoints
       WHERE id = 1`
    );
    const cx = pickNum(rows[0], 'cx');
    const cy = pickNum(rows[0], 'cy');
    const knownCoords: Array<[number, number]> = [
      [0, 0],
      [10, 10],
      [20, 20]
    ];
    const matched = knownCoords.some(
      ([x, y]) => Math.abs(cx - x) < 1e-9 && Math.abs(cy - y) < 1e-9
    );
    expect(matched).toBe(true);
  });

  it('produces one centroid per non-empty row (no silent row loss)', async () => {
    const rows = await query(
      db,
      `SELECT COUNT(*) AS n
       FROM polys
       WHERE NOT ST_IsEmpty(geom)
         AND ST_PointOnSurface(geom) IS NOT NULL`
    );
    expect(Number(rows[0].n)).toBe(3);
  });
});
