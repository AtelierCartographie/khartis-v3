import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { density_macros } from '$lib/features/duckdb/macros/density';
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
  await db.connection.run(density_macros);

  await run(db, 'CREATE OR REPLACE TABLE polys (geom GEOMETRY, pop INTEGER)');
  await run(
    db,
    `INSERT INTO polys VALUES
      (ST_GeomFromText('POLYGON((0 0, 10 0, 10 10, 0 10, 0 0))'), 1000),
      (ST_GeomFromText('POLYGON((10 0, 20 0, 20 10, 10 10, 10 0))'), 500),
      (ST_GeomFromText('POLYGON((0 10, 10 10, 10 20, 0 20, 0 10))'), 200)`
  );
});

afterAll(async () => {
  await destroyTestInstance(db);
});

describe('get_nice_ratio macro', () => {
  it('returns 1 when total population is under max_points', async () => {
    const rows = await query(
      db,
      'SELECT get_nice_ratio(\'polys\', "pop", 100000) AS ratio'
    );
    expect(rows[0].ratio).toBe(1);
  });

  it('returns a ratio > 1 when total population exceeds max_points', async () => {
    const rows = await query(
      db,
      'SELECT get_nice_ratio(\'polys\', "pop", 10) AS ratio'
    );
    expect(rows[0].ratio as number).toBeGreaterThan(1);
  });
});

describe('get_density_levels macro', () => {
  it('returns exactly 3 levels: more, standard, less', async () => {
    const rows = await query(
      db,
      'FROM get_density_levels(\'polys\', "pop", 100000) SELECT level ORDER BY level'
    );
    const levels = rows.map((r) => r.level as string).sort();
    expect(levels).toEqual(['less', 'more', 'standard']);
  });

  it('more ratio <= standard ratio <= less ratio (ordered levels)', async () => {
    const rows = await query(
      db,
      'FROM get_density_levels(\'polys\', "pop", 100000) SELECT level, ratio'
    );
    const byLevel = Object.fromEntries(
      rows.map((r) => [r.level, r.ratio as number])
    );
    expect(byLevel.more).toBeLessThanOrEqual(byLevel.standard);
    expect(byLevel.standard).toBeLessThanOrEqual(byLevel.less);
    // At least less must be strictly larger than more
    expect(byLevel.less).toBeGreaterThan(byLevel.more);
  });
});

describe('generate_dot_density macro', () => {
  it('generates at least some points with ratio=100', async () => {
    const rows = await query(
      db,
      'FROM generate_dot_density(\'polys\', "geom", "pop", 100) SELECT COUNT(*) AS cnt'
    );
    expect(Number(rows[0].cnt)).toBeGreaterThan(0);
  });

  it('generates fewer points with a higher ratio', async () => {
    const [lowRows, highRows] = await Promise.all([
      query(
        db,
        'FROM generate_dot_density(\'polys\', "geom", "pop", 10) SELECT COUNT(*) AS cnt'
      ),
      query(
        db,
        'FROM generate_dot_density(\'polys\', "geom", "pop", 200) SELECT COUNT(*) AS cnt'
      )
    ]);
    const cntLow = Number(lowRows[0].cnt);
    const cntHigh = Number(highRows[0].cnt);
    expect(cntLow).toBeGreaterThan(cntHigh);
  });
});
