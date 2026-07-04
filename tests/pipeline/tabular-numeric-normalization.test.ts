import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { analyse as analyseMacros } from '$lib/features/duckdb/macros/analyse';
import { normalizeFormattedNumericColumns } from '$lib/features/data-pipeline/operations/tabular-numeric-normalization';
import {
  createTestInstance,
  destroyTestInstance,
  run,
  type TestDuckDB
} from './duckdb-node-helper';

interface DuckQueryClient {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  invalidateTableCache?(tableName: string): void;
}

function wrapDuckDB(db: TestDuckDB): DuckQueryClient {
  return {
    async query(sql: string): Promise<unknown> {
      const reader = await db.connection.runAndReadAll(sql);
      return reader.getRowObjectsJson();
    }
  };
}

let db: TestDuckDB;

beforeAll(async () => {
  db = await createTestInstance();
  await db.connection.run(analyseMacros);
});

afterAll(async () => {
  await destroyTestInstance(db);
});

async function createTable(name: string, rows: string[]): Promise<void> {
  await run(db, `DROP TABLE IF EXISTS "${name}"`);
  await run(db, `CREATE TABLE "${name}" (value VARCHAR)`);
  for (const row of rows) {
    await run(db, `INSERT INTO "${name}" VALUES ('${row}')`);
  }
}

async function getColumnType(
  tableName: string,
  column: string
): Promise<string> {
  const reader = await db.connection.runAndReadAll(
    `SELECT data_type FROM information_schema.columns WHERE table_name='${tableName}' AND column_name='${column}'`
  );
  const rows = reader.getRowObjectsJson() as Record<string, unknown>[];
  return String(rows[0]?.data_type ?? '');
}

describe('normalizeFormattedNumericColumns', () => {
  it('promotes european-formatted decimals (comma separator) to DOUBLE', async () => {
    await createTable('tbl_eu_decimal', ['2.148.000,50', '789,50', '18,50']);
    const duck = wrapDuckDB(db);
    duck.invalidateTableCache = vi.fn();
    const converted = await normalizeFormattedNumericColumns(
      'tbl_eu_decimal',
      duck
    );
    expect(converted).toContain('value');
    expect(duck.invalidateTableCache).toHaveBeenCalledWith('tbl_eu_decimal');
    const type = await getColumnType('tbl_eu_decimal', 'value');
    expect(type.toLowerCase()).toContain('double');
  });

  it('promotes comma-thousands integers to BIGINT (no decimal-like values)', async () => {
    await createTable('tbl_comma_int', ['1,234', '5,678', '9,012']);
    await normalizeFormattedNumericColumns('tbl_comma_int', wrapDuckDB(db));
    const type = await getColumnType('tbl_comma_int', 'value');
    expect(['bigint', 'integer', 'int8', 'int64', 'hugeint']).toContain(
      type.toLowerCase()
    );
  });

  it('does not promote a column when at least one value is non-convertible', async () => {
    await createTable('tbl_mixed_text', ['1', '2', 'not-a-number', '4']);
    const converted = await normalizeFormattedNumericColumns(
      'tbl_mixed_text',
      wrapDuckDB(db)
    );
    expect(converted).not.toContain('value');
    const type = await getColumnType('tbl_mixed_text', 'value');
    expect(type.toLowerCase()).toMatch(/varchar|text/);
  });

  it('skips a column that has no formatted values (no separators)', async () => {
    await createTable('tbl_no_format', ['100', '200', '300']);
    const converted = await normalizeFormattedNumericColumns(
      'tbl_no_format',
      wrapDuckDB(db)
    );
    expect(converted).not.toContain('value');
  });

  it('returns empty array when table has no string columns', async () => {
    await run(db, 'DROP TABLE IF EXISTS tbl_integers');
    await run(db, 'CREATE TABLE tbl_integers (id INTEGER, amount DOUBLE)');
    await run(db, 'INSERT INTO tbl_integers VALUES (1, 1.5), (2, 2.5)');
    const converted = await normalizeFormattedNumericColumns(
      'tbl_integers',
      wrapDuckDB(db)
    );
    expect(converted).toHaveLength(0);
  });
});
