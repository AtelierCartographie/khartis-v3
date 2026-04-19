import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyse as analyseMacros } from '$lib/features/duckdb/macros/analyse';
import { search_macros } from '$lib/features/duckdb/macros/search';
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
  await db.connection.run(analyseMacros);
  await db.connection.run(search_macros);
  await run(
    db,
    'CREATE OR REPLACE TABLE mixed (id INTEGER, label VARCHAR, active BOOLEAN)'
  );
  await run(
    db,
    "INSERT INTO mixed VALUES (1,'alpha',true),(2,'beta',false),(3,'gamma',true)"
  );
});

afterAll(async () => {
  await destroyTestInstance(db);
});

describe('describe_full macro', () => {
  it('returns one row per column with name and type_simple', async () => {
    const rows = await query(db, "FROM describe_full('mixed')");
    expect(rows).toHaveLength(3);
    const names = rows.map((r) => r.name);
    expect(names).toContain('id');
    expect(names).toContain('label');
    expect(names).toContain('active');
  });

  it('maps INTEGER to type_simple="numeric" and VARCHAR to "string"', async () => {
    const rows = await query(db, "FROM describe_full('mixed')");
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect((byName.id as Record<string, unknown>).type_simple).toBe('numeric');
    expect((byName.label as Record<string, unknown>).type_simple).toBe(
      'string'
    );
    expect((byName.active as Record<string, unknown>).type_simple).toBe(
      'boolean'
    );
  });
});

describe('normalize_text macro', () => {
  it('lowercases and trims plain ASCII input', async () => {
    const rows = await query(
      db,
      "SELECT normalize_text('  Hello World  ') AS result"
    );
    expect(rows[0].result).toBe('hello world');
  });

  it('replaces hyphens and special chars with spaces', async () => {
    const rows = await query(
      db,
      "SELECT normalize_text('saint-malo') AS result"
    );
    expect(rows[0].result).toBe('saint malo');
  });

  it('returns empty string for null input', async () => {
    const rows = await query(db, 'SELECT normalize_text(NULL) AS result');
    expect(rows[0].result).toBe('');
  });

  it('strips non-ASCII chars (accented letters are removed before strip_accents applies)', async () => {
    const rows = await query(
      db,
      "SELECT normalize_text('cote-d-or') AS result"
    );
    expect(rows[0].result).toBe('cote d or');
  });

  it('strips HTML-like markup before normalizing', async () => {
    const rows = await query(
      db,
      "SELECT normalize_text('<center><table><tr><td>The Pit</td><td>Tras Street</td></tr></table></center>') AS result"
    );
    expect(rows[0].result).toBe('the pit tras street');
  });
});

describe('strip_html_text macro', () => {
  it('projects HTML-like values to plain text', async () => {
    const rows = await query(
      db,
      "SELECT strip_html_text('<center><table><tr><td>The Pit</td><td>Tras&nbsp;Street &amp; Co</td></tr></table></center>') AS result"
    );
    expect(rows[0].result).toBe('The Pit Tras Street & Co');
  });

  it('preserves plain text with comparison operators', async () => {
    const rows = await query(
      db,
      "SELECT strip_html_text('temperature < 20 > 10') AS result"
    );
    expect(rows[0].result).toBe('temperature < 20 > 10');
  });
});
