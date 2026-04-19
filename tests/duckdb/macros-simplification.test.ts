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

  // Adjacent polygon coverage: two squares sharing an edge at x=10.
  // Used to check topology-preserving simplification and innerlines extraction.
  await run(
    db,
    'CREATE OR REPLACE TABLE adjacent_polygons (_gid INTEGER, geom GEOMETRY)'
  );
  await run(
    db,
    `INSERT INTO adjacent_polygons VALUES
      (1, ST_GeomFromText('POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))')),
      (2, ST_GeomFromText('POLYGON((10 0, 20 0, 20 10, 10 10, 10 0))'))`
  );

  // Noisy polygon with near-duplicate vertices, used by snap_topology_normalized.
  await run(
    db,
    'CREATE OR REPLACE TABLE noisy_polygon (_gid INTEGER, geom GEOMETRY)'
  );
  await run(
    db,
    `INSERT INTO noisy_polygon VALUES
      (1, ST_GeomFromText('POLYGON((0 0, 10.00001 0.0000001, 10 10, 0.0000002 10, 0 0))'))`
  );

  // Mixed geometry: a large square plus a tiny triangle within the same _gid.
  // Used by prune_triangles to verify the triangle artefact is removed.
  await run(
    db,
    'CREATE OR REPLACE TABLE mixed_shapes (_gid INTEGER, geom GEOMETRY)'
  );
  await run(
    db,
    `INSERT INTO mixed_shapes VALUES
      (1, ST_Collect([
        ST_GeomFromText('POLYGON((0 0, 100 0, 100 100, 0 100, 0 0))'),
        ST_GeomFromText('POLYGON((200 200, 200.1 200, 200.05 200.1, 200 200))')
      ]::GEOMETRY[]))`
  );

  // Simple attribute table for simplify_and_clean wrapper — needs geom_col to
  // be renamed internally. We use a column name other than "geom" on purpose.
  await run(
    db,
    'CREATE OR REPLACE TABLE attrs_polygon (name VARCHAR, shape GEOMETRY)'
  );
  await run(
    db,
    `INSERT INTO attrs_polygon VALUES
      ('Alpha', ST_GeomFromText('POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))')),
      ('Beta',  ST_GeomFromText('POLYGON((10 0, 20 0, 20 10, 10 10, 10 0))'))`
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

describe('snap_topology_normalized macro', () => {
  it('should preserve the row count when snapping noisy polygons', async () => {
    const rows = await query(
      db,
      "FROM snap_topology_normalized('noisy_polygon') SELECT COUNT(*) AS cnt"
    );
    expect(Number(rows[0].cnt)).toBe(1);
  });

  it('should preserve the _gid identifier through snapping', async () => {
    const rows = await query(
      db,
      "FROM snap_topology_normalized('noisy_polygon') SELECT _gid"
    );
    expect(rows[0]._gid).toBe(1);
  });
});

describe('simplify_topology_normalized macro', () => {
  it('should reduce vertex count when the normalized factor is high compared to low', async () => {
    const [loRows, hiRows] = await Promise.all([
      query(
        db,
        `FROM simplify_topology_normalized('adjacent_polygons', 0.01)
         SELECT SUM(ST_NPoints(geom)) AS total_points`
      ),
      query(
        db,
        `FROM simplify_topology_normalized('adjacent_polygons', 0.9)
         SELECT SUM(ST_NPoints(geom)) AS total_points`
      )
    ]);
    const totalLow = Number(loRows[0].total_points);
    const totalHigh = Number(hiRows[0].total_points);
    expect(totalHigh).toBeLessThanOrEqual(totalLow);
  });

  it('should keep both polygon rows in the output coverage', async () => {
    const rows = await query(
      db,
      `FROM simplify_topology_normalized('adjacent_polygons', 0.5)
       SELECT COUNT(*) AS cnt`
    );
    expect(Number(rows[0].cnt)).toBe(2);
  });
});

describe('prune_triangles macro', () => {
  it('should drop the tiny triangle artefact when a larger polygon exists for the same _gid', async () => {
    const beforeRows = await query(
      db,
      'SELECT ST_NumGeometries(geom) AS parts FROM mixed_shapes WHERE _gid = 1'
    );
    const afterRows = await query(
      db,
      `FROM prune_triangles('mixed_shapes')
       SELECT _gid, ST_NumGeometries(geom) AS parts`
    );
    expect(Number(beforeRows[0].parts)).toBe(2);
    expect(Number(afterRows[0].parts)).toBe(1);
    expect(afterRows[0]._gid).toBe(1);
  });
});

describe('extract_innerlines macro', () => {
  it('should derive a non-empty inner border line between two adjacent polygons', async () => {
    const rows = await query(
      db,
      `FROM extract_innerlines('adjacent_polygons')
       SELECT ST_AsText(geom) AS wkt, ST_IsEmpty(geom) AS is_empty`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_empty).toBe(false);
    expect(String(rows[0].wkt)).toMatch(/LINESTRING|MULTILINESTRING/);
  });
});

describe('simplify_and_clean macro (polygon wrapper)', () => {
  it('should preserve the row count of the source polygon coverage', async () => {
    const rows = await query(
      db,
      `FROM simplify_and_clean('adjacent_polygons', 'geom', 0.3)
       SELECT COUNT(*) AS cnt`
    );
    expect(Number(rows[0].cnt)).toBe(2);
  });

  it('should expose the output geometry under the "geom" column name', async () => {
    const rows = await query(
      db,
      `WITH simplified AS (
         FROM simplify_and_clean('adjacent_polygons', 'geom', 0.3)
         SELECT *
       )
       SELECT SUM(ST_NPoints(geom)) AS total_points FROM simplified`
    );
    expect(Number(rows[0].total_points)).toBeGreaterThan(0);
  });
});
