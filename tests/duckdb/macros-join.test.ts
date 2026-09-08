import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join_macros } from '$lib/features/duckdb/macros/join';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

let db: TestDuckDB;

beforeAll(async () => {
  db = await createTestInstance();
  await db.connection.run(join_macros);
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
