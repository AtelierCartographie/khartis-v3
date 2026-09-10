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

  it('returns tied breaks on zero-inflated data, merged downstream by sanitizeBreaks', async () => {
    await run(db, 'CREATE OR REPLACE TABLE quantile_ties (v DOUBLE)');
    await run(db, 'INSERT INTO quantile_ties SELECT 0 FROM range(10)');
    await run(db, 'INSERT INTO quantile_ties VALUES (1),(2),(3),(4),(5)');
    const rows = await query(
      db,
      "SELECT quantile('quantile_ties', 'v', 5) AS breaks"
    );
    expect(rows[0].breaks).toEqual([0, 0, 0, 2]);
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
  it('returns nb upper-bound cuts ending at max for values 1..100 with nb=4', async () => {
    const rows = await query(
      db,
      "SELECT equi_width('vals100', 'v', 4) AS breaks"
    );
    const breaks = rows[0].breaks as number[];
    expect(breaks).toHaveLength(4);
    expect(breaks).toEqual([25, 50, 75, 100]);
  });

  it('returns nb monotonically increasing breaks matching min+k*(max-min)/nb', async () => {
    const rows = await query(
      db,
      "SELECT equi_width('vals100', 'v', 5) AS breaks"
    );
    const breaks = rows[0].breaks as number[];
    expect(breaks).toEqual([20, 40, 60, 80, 100]);
  });
});

describe('kmeans macro', () => {
  beforeAll(async () => {
    await run(db, 'CREATE OR REPLACE TABLE kmeans_data (v INTEGER)');
    await run(
      db,
      'INSERT INTO kmeans_data VALUES (1),(2),(3),(10),(11),(12),(20),(21),(22)'
    );
    await run(db, 'CREATE OR REPLACE TABLE kmeans_zero_inflated (v DOUBLE)');
    await run(db, 'INSERT INTO kmeans_zero_inflated SELECT 0 FROM range(80)');
    await run(db, 'INSERT INTO kmeans_zero_inflated VALUES (5),(6),(7),(100)');
  });

  it('returns nb-1 ascending inter-cluster midpoint breaks for nb classes', async () => {
    const rows = await query(
      db,
      "SELECT kmeans('kmeans_data', 'v', 4) AS breaks"
    );
    expect(rows[0].breaks).toEqual([6.5, 11.5, 16]);
  });

  it('places breaks at inter-cluster midpoints, never inside a cluster', async () => {
    await run(db, 'CREATE OR REPLACE TABLE kmeans_three_clusters (v INTEGER)');
    await run(
      db,
      'INSERT INTO kmeans_three_clusters VALUES (1),(2),(3),(100),(101),(102),(1000),(1001),(1002)'
    );
    const rows = await query(
      db,
      "SELECT kmeans('kmeans_three_clusters', 'v', 3) AS breaks"
    );
    expect(rows[0].breaks).toEqual([51.5, 551]);
  });

  it('resolves exactly k clusters when the data has exactly k clusters', async () => {
    await run(db, 'CREATE OR REPLACE TABLE kmeans_four_clusters (v INTEGER)');
    await run(
      db,
      'INSERT INTO kmeans_four_clusters VALUES (1),(2),(10),(11),(20),(21),(30),(31)'
    );
    const rows = await query(
      db,
      "SELECT kmeans('kmeans_four_clusters', 'v', 4) AS breaks"
    );
    expect(rows[0].breaks).toEqual([6, 15.5, 25.5]);
  });

  it('returns identical breaks whatever the physical row order', async () => {
    await run(
      db,
      `CREATE OR REPLACE TABLE kmeans_order_asc AS
         FROM kmeans_zero_inflated ORDER BY v ASC`
    );
    await run(
      db,
      `CREATE OR REPLACE TABLE kmeans_order_desc AS
         FROM kmeans_zero_inflated ORDER BY v DESC`
    );
    const [fileOrder, asc, desc] = await Promise.all([
      query(db, "SELECT kmeans('kmeans_zero_inflated', 'v', 5) AS breaks"),
      query(db, "SELECT kmeans('kmeans_order_asc', 'v', 5) AS breaks"),
      query(db, "SELECT kmeans('kmeans_order_desc', 'v', 5) AS breaks")
    ]);
    expect(fileOrder[0].breaks).toEqual([2.5, 5.5, 6.5, 53.5]);
    expect(asc[0].breaks).toEqual(fileOrder[0].breaks);
    expect(desc[0].breaks).toEqual(fileOrder[0].breaks);
  });

  it('returns distinct breaks on zero-inflated data instead of collapsing classes', async () => {
    const rows = await query(
      db,
      "SELECT kmeans('kmeans_zero_inflated', 'v', 5) AS breaks"
    );
    const breaks = rows[0].breaks as number[];
    expect(breaks).toHaveLength(4);
    expect(new Set(breaks).size).toBe(breaks.length);
  });

  it('returns fewer but distinct breaks when the data holds fewer clusters than nb', async () => {
    await run(db, 'CREATE OR REPLACE TABLE kmeans_two_values (v DOUBLE)');
    await run(db, 'INSERT INTO kmeans_two_values SELECT 0 FROM range(80)');
    await run(db, 'INSERT INTO kmeans_two_values SELECT 21.4 FROM range(20)');
    const rows = await query(
      db,
      "SELECT kmeans('kmeans_two_values', 'v', 5) AS breaks"
    );
    expect(rows[0].breaks).toEqual([10.7]);
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

  it('keeps thresholds sharing one sparse gap distinct instead of merging them', async () => {
    await run(db, 'CREATE OR REPLACE TABLE vals_sparse (v INTEGER)');
    const dense = Array.from({ length: 100 }, (_, i) => `(${i + 1})`).join(',');
    await run(db, `INSERT INTO vals_sparse VALUES ${dense}, (27367)`);

    const raw = [11728, 15638, 19547, 23457];
    const rows = await query(
      db,
      `SELECT round_thresholds([${raw.map((v) => `${v}.0`).join(', ')}], 'vals_sparse', 'v') AS breaks`
    );
    const breaks = rows[0].breaks as number[];

    expect(breaks).toHaveLength(raw.length);
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
    }
    // Every threshold must stay inside the gap between its neighbouring observed values.
    for (const value of breaks) {
      expect(value).toBeGreaterThanOrEqual(100);
      expect(value).toBeLessThanOrEqual(27367);
    }
  });

  it('rounds a threshold whose gap admits a rounder value', async () => {
    const rows = await query(
      db,
      "SELECT round_thresholds([49.4], 'vals100', 'v') AS breaks"
    );

    expect(rows[0].breaks).toEqual([50]);
  });
});

describe('macros vs reference implementations on real NUTS2 GDP data', () => {
  const TABLE = 'gdp_real';

  beforeAll(async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const geojson = JSON.parse(
      readFileSync(
        resolve(
          import.meta.dirname,
          '../../tests-datasets/geojson/nuts2_data.geojson'
        ),
        'utf8'
      )
    ) as {
      features: Array<{ properties: { GDP_CAP_PPS_2022?: number | null } }>;
    };
    const values = geojson.features
      .map((f) => f.properties.GDP_CAP_PPS_2022)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    await run(db, `CREATE OR REPLACE TABLE ${TABLE} (gdp DOUBLE)`);
    await run(
      db,
      `INSERT INTO ${TABLE} VALUES ${values.map((v) => `(${v})`).join(',')}`
    );
  });

  it('quantile(5) matches quantile_disc at [0.2, 0.4, 0.6, 0.8]', async () => {
    const rows = await query(
      db,
      `SELECT quantile('${TABLE}', 'gdp', 5) AS breaks`
    );
    // Python reference for nuts2 GDP sorted: quantile_disc picks sorted[floor(n*p)]
    expect(rows[0].breaks).toEqual([21000, 26800, 33600, 41200]);
  });

  it('equi_width(5) matches min + k*(max-min)/5 and includes max as last upper bound', async () => {
    const rows = await query(
      db,
      `SELECT equi_width('${TABLE}', 'gdp', 5) AS breaks`
    );
    expect(rows[0].breaks).toEqual([26800, 45400, 64000, 82600, 101200]);
  });

  it('kmeans(5) produces deterministic midpoint breaks different from equal-interval', async () => {
    const rows = await query(
      db,
      `SELECT kmeans('${TABLE}', 'gdp', 5) AS breaks`
    );
    const breaks = rows[0].breaks as number[];
    expect(breaks).toEqual([19900, 28650, 38000, 55050]);
    expect(breaks).not.toEqual([26800, 45400, 64000, 82600]);
    for (const b of breaks) {
      expect(b).toBeGreaterThan(8200);
      expect(b).toBeLessThan(101200);
    }
  });

  it('q6 returns 5 breaks at fixed percentiles [0.05, 0.275, 0.5, 0.725, 0.95]', async () => {
    const rows = await query(db, `SELECT q6('${TABLE}', 'gdp') AS breaks`);
    expect(rows[0].breaks).toEqual([14100, 23900, 30000, 38600, 56700]);
  });

  it('nested_means produces breaks within [min, max] and monotonically increasing', async () => {
    const rows = await query(
      db,
      `SELECT nested_means('${TABLE}', 'gdp', 4) AS breaks`
    );
    const breaks = rows[0].breaks as number[];
    expect(breaks.length).toBeGreaterThan(0);
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
    }
    for (const b of breaks) {
      expect(b).toBeGreaterThanOrEqual(8200);
      expect(b).toBeLessThanOrEqual(101200);
    }
  });

  it('headtail2 returns >=1 break within range for GDP distribution', async () => {
    const rows = await query(
      db,
      `SELECT headtail2('${TABLE}', 'gdp') AS breaks`
    );
    const breaks = rows[0].breaks as number[];
    expect(breaks.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
    }
    for (const b of breaks) {
      expect(b).toBeGreaterThan(8200);
      expect(b).toBeLessThan(101200);
    }
  });

  it('each macro returns a DISTINCT set of breaks (no silent fallback to equal-interval)', async () => {
    const [q, ei, km, q6m] = await Promise.all([
      query(db, `SELECT quantile('${TABLE}', 'gdp', 5) AS breaks`),
      query(db, `SELECT equi_width('${TABLE}', 'gdp', 5) AS breaks`),
      query(db, `SELECT kmeans('${TABLE}', 'gdp', 5) AS breaks`),
      query(db, `SELECT q6('${TABLE}', 'gdp') AS breaks`)
    ]);
    // Compare interior breaks only (strip equi_width's trailing max)
    const interior = (b: unknown) => {
      const arr = b as number[];
      return JSON.stringify(arr.filter((v) => v < 101200));
    };
    expect(interior(q[0].breaks)).not.toEqual(interior(ei[0].breaks));
    expect(interior(km[0].breaks)).not.toEqual(interior(ei[0].breaks));
    expect(interior(q6m[0].breaks)).not.toEqual(interior(ei[0].breaks));
    expect(interior(q[0].breaks)).not.toEqual(interior(km[0].breaks));
  });
});
