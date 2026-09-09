import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { join_macros } from '$lib/features/duckdb/macros/join';
import { FUZZY_SEARCH } from '$lib/features/commons/constants/detection.constants';
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

const CUTOFF = FUZZY_SEARCH.SCORE_CUTOFF;

const FULL_SCORE = `GREATEST(
  jaro_winkler_similarity(a, b, ${CUTOFF}),
  0.99 * jaro_winkler_similarity(a_sorted, b_sorted, ${CUTOFF})
)`;

const SHORT_CIRCUIT_SCORE = `CASE
  WHEN a_sorted = a AND b_sorted = b
  THEN jaro_winkler_similarity(a, b, ${CUTOFF})
  ELSE ${FULL_SCORE}
END`;

const SCORED_PAIRS = `
  WITH pairs(raw_a, raw_b) AS (VALUES
    ('Korea North', 'North Korea'),
    ('Congo Dem Rep', 'Dem Rep Congo'),
    ('Amerique du Nord Etats Unis', 'Etats-Unis d Amerique'),
    ('Frnace', 'France'),
    ('Gremany', 'Germany'),
    ('Marseile', 'Marseille'),
    ('Barseille', 'Marseille'),
    ('Saint-Denis', 'Saint-Denis-sur-Coise'),
    ('Cote Ivoire', 'Cote d Ivoire'),
    ('Toulon', 'Toulouse'),
    ('Unknownland', 'Finland')
  ),
  forms AS (
    SELECT
      normalize_text_join(raw_a) AS a,
      normalize_text_join(raw_b) AS b,
      array_to_string(list_sort(string_split(normalize_text_join(raw_a), ' ')), ' ') AS a_sorted,
      array_to_string(list_sort(string_split(normalize_text_join(raw_b), ' ')), ' ') AS b_sorted
    FROM pairs
  )
  SELECT a, b, ${FULL_SCORE} AS full_score, ${SHORT_CIRCUIT_SCORE} AS short_score
  FROM forms`;

describe('fuzzy scoring short-circuit', () => {
  it('scores every pair exactly like the full GREATEST', async () => {
    const rows = await query(db, SCORED_PAIRS);

    expect(rows).toHaveLength(11);
    for (const row of rows) {
      expect(Number(row.short_score)).toBe(Number(row.full_score));
    }
  });

  it('keeps recovering reordered names through the sorted form', async () => {
    const rows = await query(db, SCORED_PAIRS);
    const reordered = rows.filter((row) => row.a === 'korea north');

    expect(reordered).toHaveLength(1);
    expect(Number(reordered[0].short_score)).toBeCloseTo(0.99, 10);
  });

  it('leaves calibrated near-misses below the cutoff', async () => {
    const rows = await query(db, SCORED_PAIRS);
    const nearMiss = rows.find((row) => row.a === 'toulon');

    expect(Number(nearMiss?.short_score)).toBe(0);
  });
});
