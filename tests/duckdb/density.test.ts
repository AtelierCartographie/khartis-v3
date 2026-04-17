import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { density_macros } from '$lib/features/duckdb/macros/density';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

async function loadDensityMacros(db: TestDuckDB): Promise<void> {
  const statements = density_macros
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await db.connection.run(`${statement};`);
  }
}

async function seedPolygons(db: TestDuckDB): Promise<void> {
  await db.connection.run('DROP TABLE IF EXISTS density_polys');
  // Three unit squares on the x axis, population values 100, 500, 2000.
  await db.connection.run(`
    CREATE TABLE density_polys AS
    SELECT
      id,
      ST_GeomFromText(wkt) AS geom,
      population
    FROM (
      VALUES
        (1, 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))', 100),
        (2, 'POLYGON((2 0, 3 0, 3 1, 2 1, 2 0))', 500),
        (3, 'POLYGON((4 0, 5 0, 5 1, 4 1, 4 0))', 2000)
    ) AS t(id, wkt, population)
  `);
}

describe('density macros', () => {
  let db: TestDuckDB;

  beforeAll(async () => {
    db = await createTestInstance();
    await db.connection.run('INSTALL spatial');
    await db.connection.run('LOAD spatial');
    await loadDensityMacros(db);
  });

  beforeEach(async () => {
    await seedPolygons(db);
    await db.connection.run('SELECT setseed(0.42)');
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  it('returns a nice 1-2-5 ratio from get_nice_ratio', async () => {
    const rows = await query(
      db,
      `SELECT get_nice_ratio('density_polys', population, max_points := 1000) AS ratio`
    );
    const ratio = Number(rows[0].ratio);
    expect(Number.isInteger(ratio)).toBe(true);
    expect(ratio).toBeGreaterThanOrEqual(1);
    const digits = [1, 2, 5];
    const base = 10 ** Math.floor(Math.log10(ratio));
    const normalized = Math.round(ratio / base);
    expect(digits).toContain(normalized);
  });

  it('returns 3 levels (more/standard/less) from get_density_levels', async () => {
    const rows = await query(
      db,
      `FROM get_density_levels('density_polys', population, max_points := 1000) SELECT level, ratio ORDER BY ratio`
    );
    const levels = rows.map((r) => String(r.level)).sort();
    expect(levels).toEqual(['less', 'more', 'standard']);
    const byLevel = Object.fromEntries(
      rows.map((r) => [String(r.level), Number(r.ratio)])
    );
    // more <= standard <= less
    expect(byLevel.more).toBeLessThanOrEqual(byLevel.standard);
    expect(byLevel.standard).toBeLessThanOrEqual(byLevel.less);
  });

  it('generates points whose count approaches the stochastic target', async () => {
    // With ratio=100 and total=2600, expected ≈ 26 points (± small stochastic noise).
    const rows = await query(
      db,
      `FROM generate_dot_density('density_polys', geom, population, 100) SELECT COUNT(*) AS cnt`
    );
    const count = Number(rows[0].cnt);
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThan(60);
  });

  it('emits POINT geometries inside the source polygons', async () => {
    const rows = await query(
      db,
      `WITH dots AS (
         FROM generate_dot_density('density_polys', geom, population, 100)
         SELECT geometry
       )
       SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN EXISTS (
           SELECT 1 FROM density_polys p WHERE ST_Contains(p.geom, dots.geometry)
         ) THEN 1 ELSE 0 END) AS inside
       FROM dots`
    );
    expect(Number(rows[0].total)).toBeGreaterThan(0);
    expect(Number(rows[0].inside)).toBe(Number(rows[0].total));
  });
});
