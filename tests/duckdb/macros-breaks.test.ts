import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { breaks as breaksMacros } from '$lib/features/duckdb/macros/breaks';
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
  await db.connection.run(breaksMacros);
  await run(db, 'CREATE OR REPLACE TABLE vals100 (v INTEGER)');
  const vals = Array.from({ length: 100 }, (_, i) => `(${i + 1})`).join(',');
  await run(db, `INSERT INTO vals100 VALUES ${vals}`);
});

afterAll(async () => {
  await destroyTestInstance(db);
});

describe('quantile macro', () => {
  it('returns 3 breaks at [25, 50, 75] for nb=4 on values 1..100', async () => {
    const rows = await query(
      db,
      "SELECT quantile('vals100', 'v', 4) AS breaks"
    );
    expect(rows[0].breaks).toEqual([25, 50, 75]);
  });
});

describe('q6 macro', () => {
  it('returns 5 strictly-increasing breaks with first=5, mid=50, last=95 on 1..100', async () => {
    const rows = await query(db, "SELECT q6('vals100', 'v') AS breaks");
    const breaks = rows[0].breaks as number[];
    expect(breaks).toHaveLength(5);
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
    }
    expect(breaks[0]).toBe(5);
    expect(breaks[2]).toBe(50);
    expect(breaks[4]).toBe(95);
  });
});

describe('equi_width macro', () => {
  it('returns an array of nb-1 monotonically increasing boundaries', async () => {
    const rows = await query(
      db,
      "SELECT equi_width('vals100', 'v', 4) AS breaks"
    );
    const breaks = rows[0].breaks as number[];
    expect(breaks).toHaveLength(3);
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
    }
  });
});

describe('kmeans macro', () => {
  it('returns nb-1 cluster centers in ascending order', async () => {
    await run(db, 'CREATE OR REPLACE TABLE kmeans_data (v INTEGER)');
    await run(
      db,
      'INSERT INTO kmeans_data VALUES (1),(2),(3),(10),(11),(12),(20),(21),(22)'
    );
    // The macro initialises with LIMIT nb-1 seeds, so nb=4 yields 3 converged centers
    const rows = await query(
      db,
      "SELECT kmeans('kmeans_data', 'v', 4) AS clusters"
    );
    const clusters = rows[0].clusters as number[];
    expect(clusters).toHaveLength(3);
    for (let i = 1; i < clusters.length; i++) {
      expect(clusters[i]).toBeGreaterThan(clusters[i - 1]);
    }
    expect(clusters[0]).toBeLessThan(10);
    expect(clusters[clusters.length - 1]).toBeGreaterThan(15);
  });
});

describe('nested_means macro', () => {
  it('returns strictly increasing thresholds on a skewed distribution', async () => {
    await run(db, 'CREATE OR REPLACE TABLE skewed_data (v DOUBLE)');
    const vals = [1, 1, 1, 2, 2, 2, 3, 4, 5, 8, 13, 21, 34, 55, 89, 144]
      .map((v) => `(${v})`)
      .join(',');
    await run(db, `INSERT INTO skewed_data VALUES ${vals}`);
    const rows = await query(
      db,
      "SELECT nested_means('skewed_data', 'v', 4) AS breaks"
    );
    const breaks = rows[0].breaks as number[];
    expect(breaks.length).toBeGreaterThan(0);
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
    }
  });
});

describe('headtail2 macro', () => {
  it('returns at least 2 head/tail cuts on a power-law distribution', async () => {
    await run(db, 'CREATE OR REPLACE TABLE powerlaw_data (v DOUBLE)');
    const vals = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987]
      .map((v) => `(${v})`)
      .join(',');
    await run(db, `INSERT INTO powerlaw_data VALUES ${vals}`);
    const rows = await query(
      db,
      "SELECT headtail2('powerlaw_data', 'v') AS breaks"
    );
    const breaks = rows[0].breaks as number[];
    expect(breaks.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
    }
  });
});

describe('round_thresholds macro', () => {
  it('returns sorted human-readable values close to the raw breaks', async () => {
    const rows = await query(
      db,
      "SELECT round_thresholds([25.0, 50.0, 75.0], 'vals100', 'v') AS breaks"
    );
    const breaks = rows[0].breaks as number[];
    expect(breaks).toHaveLength(3);
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
    }
    for (let i = 0; i < breaks.length; i++) {
      expect(Math.abs(breaks[i] - [25, 50, 75][i]) / 75).toBeLessThan(0.01);
    }
  });
});
