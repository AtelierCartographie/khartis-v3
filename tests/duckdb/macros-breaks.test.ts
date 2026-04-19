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

describe('macros vs reference implementations on real NUTS2 GDP data', () => {
  const TABLE = 'gdp_real';

  beforeAll(async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const geojson = JSON.parse(
      readFileSync(
        resolve(
          import.meta.dirname,
          '../../static/tests-datasets/geojson/nuts2_data.geojson'
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

  it('kmeans(5) produces monotonically increasing breaks different from equal-interval', async () => {
    const rows = await query(
      db,
      `SELECT kmeans('${TABLE}', 'gdp', 5) AS breaks`
    );
    const breaks = rows[0].breaks as number[];
    expect(breaks).toHaveLength(4);
    for (let i = 1; i < breaks.length; i++) {
      expect(breaks[i]).toBeGreaterThan(breaks[i - 1]);
    }
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
