/**
 * Regression test for restoreNormalizedColumnNames.
 *
 * DuckDB's `read_csv(..., normalize_names=true)` prefixes an underscore to any
 * column whose name is a keyword (name, year, zone, level, type, group…) or
 * starts with a digit (year columns "2020" → "_2020"). These names are very
 * common in real data, so we strip the prefix back — but only when it is safe
 * (keyword/digit-led name, no collision) and never on internal columns.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createTestInstance,
  destroyTestInstance,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

const hoisted = vi.hoisted(() => ({
  connection: null as {
    runAndReadAll: (sql: string) => Promise<unknown>;
  } | null
}));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: async (_connection: unknown, sql: string) => {
    const reader = (await hoisted.connection!.runAndReadAll(sql)) as {
      getRowObjectsJson: () => unknown[];
    };
    return reader.getRowObjectsJson();
  }
}));

import { restoreNormalizedColumnNames } from '$lib/features/duckdb/io/reader-utils';

let db: TestDuckDB;

async function columnsOf(table: string): Promise<string[]> {
  const reader = await db.connection.runAndReadAll(
    `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}'`
  );
  return (reader.getRowObjectsJson() as Array<{ column_name: string }>).map(
    (row) => row.column_name
  );
}

describe('restoreNormalizedColumnNames', () => {
  beforeAll(async () => {
    db = await createTestInstance();
    hoisted.connection = db.connection;
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  it('strips the leading underscore from keyword and digit-led column names', async () => {
    await db.connection.run(
      `CREATE OR REPLACE TABLE t1 AS
       SELECT 1 AS "_name", 2 AS "_year", 3 AS "_zone", 4 AS "_2020",
              5 AS population, 6 AS "__id"`
    );

    await restoreNormalizedColumnNames(db.connection as never, 't1');

    const cols = await columnsOf('t1');
    expect(cols).toContain('name');
    expect(cols).toContain('year');
    expect(cols).toContain('zone');
    expect(cols).toContain('2020');
    expect(cols).toContain('population');
    // internal column (double underscore) must be left untouched
    expect(cols).toContain('__id');
    expect(cols).not.toContain('_name');
    expect(cols).not.toContain('_2020');
  });

  it('leaves non-keyword underscore names and avoids collisions', async () => {
    await db.connection.run(
      `CREATE OR REPLACE TABLE t2 AS
       SELECT 1 AS "_custom", 2 AS "name", 3 AS "_name"`
    );

    await restoreNormalizedColumnNames(db.connection as never, 't2');

    const cols = await columnsOf('t2');
    // "_custom" is not a keyword/digit name → untouched
    expect(cols).toContain('_custom');
    // "name" already exists → "_name" must NOT be renamed (collision)
    expect(cols).toContain('name');
    expect(cols).toContain('_name');
  });
});
