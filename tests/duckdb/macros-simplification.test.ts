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

  // Two adjacent valid squares plus a touching OGC-invalid self-intersecting
  // "bowtie". GEOS topology ops (ST_ReducePrecision in the snap step,
  // ST_Intersection in extract_innerlines) throw on such geometry, so both must
  // repair validity (ST_MakeValid) before any topology operation.
  await run(
    db,
    'CREATE OR REPLACE TABLE invalid_coverage (_gid INTEGER, geom GEOMETRY)'
  );
  await run(
    db,
    `INSERT INTO invalid_coverage VALUES
      (1, ST_GeomFromText('POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))')),
      (2, ST_GeomFromText('POLYGON((10 0, 20 0, 20 10, 10 10, 10 0))')),
      (3, ST_GeomFromText('POLYGON((20 0, 30 10, 30 0, 20 10, 20 0))'))`
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

  it('should keep only the shared edge, not the outline of the coverage', async () => {
    const rows = await query(
      db,
      `FROM extract_innerlines('adjacent_polygons')
       SELECT ST_Length(geom) AS length`
    );
    // The x=10 edge is 10 long; the 20x10 outline would add 60.
    expect(Number(rows[0].length)).toBeCloseTo(10, 6);
  });

  it('should return nothing for a coverage whose polygons do not touch', async () => {
    await run(
      db,
      'CREATE OR REPLACE TABLE disjoint_polygons (_gid INTEGER, geom GEOMETRY)'
    );
    await run(
      db,
      `INSERT INTO disjoint_polygons VALUES
        (1, ST_GeomFromText('POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))')),
        (2, ST_GeomFromText('POLYGON((30 0, 40 0, 40 10, 30 10, 30 0))'))`
    );

    const rows = await query(
      db,
      `FROM extract_innerlines('disjoint_polygons')
       SELECT ST_IsEmpty(geom) AS is_empty`
    );
    expect(rows[0].is_empty).toBe(true);
  });

  it('should not throw on an OGC-invalid polygon and still derive inner borders', async () => {
    const rows = await query(
      db,
      `FROM extract_innerlines('invalid_coverage')
       SELECT ST_AsText(geom) AS wkt, ST_IsEmpty(geom) AS is_empty`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_empty).toBe(false);
    expect(String(rows[0].wkt)).toMatch(/LINESTRING|MULTILINESTRING/);
  });
});

describe('noded_coverage macro', () => {
  it('leaves the coverage untouched at the default factor', async () => {
    const rows = await query(
      db,
      `FROM noded_coverage('noisy_polygon')
       SELECT ST_AsText(geom) AS wkt`
    );
    expect(rows).toHaveLength(1);
    // 10.00001 and 0.0000001 survive: nothing is snapped without a factor.
    expect(String(rows[0].wkt)).toContain('10.00001');
  });

  it('snaps near-duplicate vertices onto the grid when given a factor', async () => {
    const rows = await query(
      db,
      `FROM noded_coverage('noisy_polygon', noding_factor := 0.0001)
       SELECT ST_AsText(geom) AS wkt, ST_Area(geom) AS area`
    );
    expect(rows).toHaveLength(1);
    expect(String(rows[0].wkt)).not.toContain('10.00001');
    // The 10x10 square keeps its area: the grid moves vertices, not shapes.
    expect(Number(rows[0].area)).toBeCloseTo(100, 3);
  });
});

describe('extract_land macro', () => {
  it('should dissolve a polygon coverage into a single territory', async () => {
    const rows = await query(
      db,
      `FROM extract_land('adjacent_polygons')
       SELECT ST_Area(geom) AS area, ST_NumGeometries(geom) AS parts`
    );
    expect(rows).toHaveLength(1);
    // The two 10x10 squares merge instead of staying side by side.
    expect(Number(rows[0].area)).toBeCloseTo(200, 6);
    expect(Number(rows[0].parts)).toBe(1);
  });

  it('should not throw on an OGC-invalid polygon', async () => {
    const rows = await query(
      db,
      `FROM extract_land('invalid_coverage')
       SELECT ST_IsEmpty(geom) AS is_empty`
    );
    expect(rows[0].is_empty).toBe(false);
  });

  it('should still dissolve the coverage when it is re-noded first', async () => {
    const rows = await query(
      db,
      `FROM extract_land('adjacent_polygons', noding_factor := 0.000001)
       SELECT ST_Area(geom) AS area, ST_NumGeometries(geom) AS parts`
    );
    expect(Number(rows[0].area)).toBeCloseTo(200, 6);
    expect(Number(rows[0].parts)).toBe(1);
  });
});

describe('extract_outerlines macro', () => {
  it('should derive the outer contour of a polygon coverage without the shared edge', async () => {
    const rows = await query(
      db,
      `FROM extract_outerlines('adjacent_polygons')
       SELECT ST_AsText(geom) AS wkt, ST_Length(geom) AS length`
    );
    expect(rows).toHaveLength(1);
    expect(String(rows[0].wkt)).toMatch(/LINESTRING|MULTILINESTRING/);
    // Perimeter of the 20x10 dissolved rectangle; the x=10 inner edge is excluded.
    expect(Number(rows[0].length)).toBeCloseTo(60, 6);
  });

  it('should not throw on an OGC-invalid polygon and still derive the contour', async () => {
    const rows = await query(
      db,
      `FROM extract_outerlines('invalid_coverage')
       SELECT ST_IsEmpty(geom) AS is_empty, ST_AsText(geom) AS wkt`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_empty).toBe(false);
    expect(String(rows[0].wkt)).toMatch(/LINESTRING|MULTILINESTRING/);
  });

  it('should expose the hole contour when the coverage encloses one', async () => {
    await run(
      db,
      'CREATE OR REPLACE TABLE holed_coverage (_gid INTEGER, geom GEOMETRY)'
    );
    await run(
      db,
      `INSERT INTO holed_coverage VALUES
        (1, ST_GeomFromText('POLYGON((0 0, 30 0, 30 30, 0 30, 0 0), (10 10, 20 10, 20 20, 10 20, 10 10))'))`
    );

    const rows = await query(
      db,
      `FROM extract_outerlines('holed_coverage')
       SELECT ST_NumGeometries(geom) AS parts, ST_Length(geom) AS length`
    );
    expect(Number(rows[0].parts)).toBe(2);
    expect(Number(rows[0].length)).toBeCloseTo(120 + 40, 6);
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

  it('should not throw on an OGC-invalid polygon and keep every row', async () => {
    const rows = await query(
      db,
      `FROM simplify_and_clean('invalid_coverage', 'geom', 0.3)
       SELECT COUNT(*) AS cnt`
    );
    expect(Number(rows[0].cnt)).toBe(3);
  });
});
