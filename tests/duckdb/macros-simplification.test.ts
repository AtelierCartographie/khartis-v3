import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { simplification_macros } from '$lib/features/duckdb/macros/simplification';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

let db: TestDuckDB;

beforeAll(async () => {
  db = await createTestInstance();
  await db.connection.run('LOAD spatial');
  await db.connection.run(simplification_macros);

  // Zigzag linestring: 100 vertices, amplitude=5, x-step=10
  await run(db, 'CREATE OR REPLACE TABLE zigzag (_gid INTEGER, geom GEOMETRY)');
  await run(
    db,
    `INSERT INTO zigzag
    SELECT 1,
    ST_GeomFromText('LINESTRING(' ||
      string_agg((i * 10) || ' ' || (CASE WHEN i % 2 = 0 THEN 0.0 ELSE 5.0 END)::VARCHAR, ', ' ORDER BY i) || ')')
    FROM generate_series(0, 99) t(i)`
  );
});

afterAll(async () => {
  await destroyTestInstance(db);
});

describe('simplify_linestring_normalized macro', () => {
  it('high factor produces fewer vertices than low factor', async () => {
    const [loRows, hiRows] = await Promise.all([
      query(
        db,
        "FROM simplify_linestring_normalized('zigzag', 0.01) SELECT ST_NPoints(geom) AS npts"
      ),
      query(
        db,
        "FROM simplify_linestring_normalized('zigzag', 0.9) SELECT ST_NPoints(geom) AS npts"
      )
    ]);
    const nptLow = loRows[0].npts as number;
    const nptHigh = hiRows[0].npts as number;
    expect(nptHigh).toBeLessThan(nptLow);
  });

  it('result geometry has _gid preserved', async () => {
    const rows = await query(
      db,
      "FROM simplify_linestring_normalized('zigzag', 0.5) SELECT _gid"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]._gid).toBe(1);
  });
});

describe('snap_linestring_normalized macro', () => {
  it('preserves row count after snapping', async () => {
    const rows = await query(
      db,
      "FROM snap_linestring_normalized('zigzag') SELECT COUNT(*) AS cnt"
    );
    expect(Number(rows[0].cnt)).toBe(1);
  });
});
