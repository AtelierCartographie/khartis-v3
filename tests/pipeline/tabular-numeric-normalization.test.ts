import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { analyse as analyseMacros } from '$lib/features/duckdb/macros/analyse';
import { normalizeFormattedNumericColumns } from '$lib/features/data-pipeline/operations/tabular-numeric-normalization';
import {
  createTestInstance,
  destroyTestInstance,
  query,
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

  it('converts several eligible columns in one rewrite, preserving column order and __id', async () => {
    await run(db, 'DROP TABLE IF EXISTS tbl_multi');
    await run(
      db,
      `CREATE TABLE tbl_multi (
        label VARCHAR, eu_amount VARCHAR, plain VARCHAR,
        thousands VARCHAR, __id INTEGER
      )`
    );
    await run(
      db,
      `INSERT INTO tbl_multi VALUES
        ('a', '1.234,50', 'x', '1,234', 1),
        ('b', '789,50', 'y', '5,678', 2)`
    );
    const duck = wrapDuckDB(db);
    duck.invalidateTableCache = vi.fn();

    const converted = await normalizeFormattedNumericColumns('tbl_multi', duck);

    expect(converted).toEqual(['eu_amount', 'thousands']);
    expect(duck.invalidateTableCache).toHaveBeenCalledTimes(1);
    expect(duck.invalidateTableCache).toHaveBeenCalledWith('tbl_multi');

    const columns = await query(
      db,
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name='tbl_multi' ORDER BY ordinal_position`
    );
    expect(columns.map((column) => column.column_name)).toEqual([
      'label',
      'eu_amount',
      'plain',
      'thousands',
      '__id'
    ]);
    expect(String(columns[1].data_type).toLowerCase()).toContain('double');
    expect(String(columns[3].data_type).toLowerCase()).toMatch(
      /bigint|hugeint|int/
    );

    const rows = await query(db, 'SELECT * FROM tbl_multi ORDER BY __id');
    expect(rows.map((row) => row.label)).toEqual(['a', 'b']);
    expect(rows.map((row) => Number(row.eu_amount))).toEqual([1234.5, 789.5]);
    expect(rows.map((row) => row.plain)).toEqual(['x', 'y']);
    expect(rows.map((row) => Number(row.thousands))).toEqual([1234, 5678]);
    expect(rows.map((row) => Number(row.__id))).toEqual([1, 2]);
  });

  it('keeps the single ALTER path when only one column is eligible', async () => {
    await run(db, 'DROP TABLE IF EXISTS tbl_single_among_many');
    await run(
      db,
      `CREATE TABLE tbl_single_among_many (
        label VARCHAR, eu_amount VARCHAR, __id INTEGER
      )`
    );
    await run(
      db,
      `INSERT INTO tbl_single_among_many VALUES
        ('a', '1.234,50', 1),
        ('b', '789,50', 2)`
    );
    const duck = wrapDuckDB(db);
    duck.invalidateTableCache = vi.fn();

    const converted = await normalizeFormattedNumericColumns(
      'tbl_single_among_many',
      duck
    );

    expect(converted).toEqual(['eu_amount']);
    expect(duck.invalidateTableCache).toHaveBeenCalledTimes(1);
    const type = await getColumnType('tbl_single_among_many', 'eu_amount');
    expect(type.toLowerCase()).toContain('double');
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
