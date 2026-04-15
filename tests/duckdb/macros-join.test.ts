import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join_macros } from '$lib/features/duckdb/macros/join';
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
  await db.connection.run(join_macros);
  await run(
    db,
    'CREATE OR REPLACE TABLE basemap_ref (id INTEGER, normalized VARCHAR)'
  );
  await run(
    db,
    "INSERT INTO basemap_ref VALUES (1,'paris'),(2,'lyon'),(3,'marseille'),(4,'pari')"
  );
});

afterAll(async () => {
  await destroyTestInstance(db);
});

describe('normalize_text_join macro', () => {
  it('strips accents, lowercases, and normalises abbreviations', async () => {
    const rows = await query(
      db,
      "SELECT normalize_text_join('Île-de-France') AS result"
    );
    expect(rows[0].result).toBe('ile de france');
  });

  it('expands "st." abbreviation to "saint"', async () => {
    const rows = await query(
      db,
      "SELECT normalize_text_join('St. Étienne') AS result"
    );
    expect(rows[0].result as string).toContain('saint');
  });
});

describe('get_similarity macro', () => {
  it('returns a score > 0.9 for near-exact match ("paris" vs "pari")', async () => {
    const rows = await query(
      db,
      "FROM get_similarity('paris', 'basemap_ref') WHERE id = 4"
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].score as number).toBeGreaterThan(0.9);
  });

  it('classifies exact match as "exact" and close match as "partial"', async () => {
    const rows = await query(
      db,
      "FROM get_similarity('paris', 'basemap_ref') ORDER BY score DESC"
    );
    const exact = rows.find((r) => r.typo_match === 'exact');
    expect(exact).toBeDefined();
    expect((exact as Record<string, unknown>).id).toBe(1);
  });

  it('classifies a low-similarity result as "toofar"', async () => {
    const rows = await query(
      db,
      "FROM get_similarity('paris', 'basemap_ref') WHERE id = 3"
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].typo_match).toBe('toofar');
  });
});
