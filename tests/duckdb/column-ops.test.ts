import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  changeColumnType,
  type DuckDBClient
} from '$lib/features/duckdb/orchestrator/column-ops';
import { DUCK_CONST } from '$lib/features/duckdb/constants';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

let db: TestDuckDB;
let tempDir: string;

beforeAll(async () => {
  db = await createTestInstance();
  tempDir = await mkdtemp(join(tmpdir(), 'khartis-column-ops-'));
});

afterAll(async () => {
  await destroyTestInstance(db);
  await rm(tempDir, { recursive: true, force: true });
});

function duckClient(): DuckDBClient {
  return {
    async query(sql: string, options?: { format?: string }): Promise<unknown> {
      if (options?.format === 'array') {
        return query(db, sql);
      }
      await db.connection.run(sql);
      return undefined;
    },
    analyse: vi.fn(async () => []),
    drop_rows: vi.fn(async () => undefined)
  };
}

describe('changeColumnType', () => {
  it('converts numeric-compatible values and nulls invalid values when forcing a number type', async () => {
    await run(db, 'DROP TABLE IF EXISTS "type_change_try_cast"');
    await run(
      db,
      `CREATE TABLE "type_change_try_cast" (id INTEGER, value VARCHAR)`
    );
    await run(
      db,
      `INSERT INTO "type_change_try_cast" VALUES
        (1, '12.5'),
        (2, '...'),
        (3, 'not-a-number'),
        (4, NULL)`
    );

    const Duck = duckClient();
    await changeColumnType('type_change_try_cast', 'value', 'DOUBLE', Duck);

    const rows = await query(
      db,
      `SELECT id, value, typeof(value) AS value_type
       FROM "type_change_try_cast"
       ORDER BY id`
    );

    expect(rows).toEqual([
      { id: 1, value: 12.5, value_type: 'DOUBLE' },
      { id: 2, value: null, value_type: 'DOUBLE' },
      { id: 3, value: null, value_type: 'DOUBLE' },
      { id: 4, value: null, value_type: 'DOUBLE' }
    ]);
  });

  it('parses comma-decimal and thousands-separated values when forcing a number type', async () => {
    await run(db, 'DROP TABLE IF EXISTS "type_change_comma"');
    await run(
      db,
      `CREATE TABLE "type_change_comma" (id INTEGER, value VARCHAR)`
    );
    // Mixed column: the 'N/D' token blocks import-time auto-normalization, so it
    // reaches manual coercion as VARCHAR with French comma decimals.
    await run(
      db,
      `INSERT INTO "type_change_comma" VALUES
        (1, '1,5'),
        (2, '2,3'),
        (3, '1.234,56'),
        (4, '1 234,5'),
        (5, 'N/D')`
    );

    const Duck = duckClient();
    const result = await changeColumnType(
      'type_change_comma',
      'value',
      'DOUBLE',
      Duck
    );

    const rows = await query(
      db,
      `SELECT id, value FROM "type_change_comma" ORDER BY id`
    );

    expect(rows).toEqual([
      { id: 1, value: 1.5 },
      { id: 2, value: 2.3 },
      { id: 3, value: 1234.56 },
      { id: 4, value: 1234.5 },
      { id: 5, value: null }
    ]);
    expect(result.invalidatedCount).toBe(1);
  });

  it('does not interpret US thousands as comma decimals', async () => {
    await run(db, 'DROP TABLE IF EXISTS "type_change_us"');
    await run(db, `CREATE TABLE "type_change_us" (id INTEGER, value VARCHAR)`);
    await run(
      db,
      `INSERT INTO "type_change_us" VALUES (1, '1,234'), (2, '1,234,567')`
    );

    const Duck = duckClient();
    await changeColumnType('type_change_us', 'value', 'DOUBLE', Duck);

    const rows = await query(
      db,
      `SELECT id, value FROM "type_change_us" ORDER BY id`
    );

    expect(rows).toEqual([
      { id: 1, value: 1234 },
      { id: 2, value: 1234567 }
    ]);
  });

  it('tolerates unparsable values when forcing a date type instead of failing', async () => {
    await run(db, 'DROP TABLE IF EXISTS "type_change_date"');
    await run(
      db,
      `CREATE TABLE "type_change_date" (id INTEGER, value VARCHAR)`
    );
    await run(
      db,
      `INSERT INTO "type_change_date" VALUES
        (1, '2024-01-15'),
        (2, 'not-a-date')`
    );

    const Duck = duckClient();
    const result = await changeColumnType(
      'type_change_date',
      'value',
      'DATE',
      Duck
    );

    const rows = await query(
      db,
      `SELECT id, typeof(value) AS value_type, value IS NULL AS is_null
       FROM "type_change_date" ORDER BY id`
    );

    expect(rows).toEqual([
      { id: 1, value_type: 'DATE', is_null: false },
      { id: 2, value_type: 'DATE', is_null: true }
    ]);
    expect(result.invalidatedCount).toBe(1);
  });
});

describe('DUCK_CONST.DEFAULT.NULL_VALUES', () => {
  it("treats '...' as a DuckDB CSV null value", async () => {
    const csvPath = join(tempDir, 'null-values.csv');
    await writeFile(csvPath, 'value\n...\n42\n', 'utf8');
    const escapedPath = csvPath.replace(/'/g, "''");

    await run(db, 'DROP TABLE IF EXISTS "csv_null_values"');
    await run(
      db,
      `CREATE TABLE "csv_null_values" AS
       FROM read_csv('${escapedPath}', header=true, nullstr=${DUCK_CONST.DEFAULT.NULL_VALUES})`
    );

    const rows = await query(
      db,
      `SELECT
         CAST(COUNT(*) FILTER (WHERE value IS NULL) AS INTEGER) AS null_count,
         CAST(COUNT(*) FILTER (WHERE value = 42) AS INTEGER) AS numeric_count
       FROM "csv_null_values"`
    );

    expect(rows).toEqual([{ null_count: 1, numeric_count: 1 }]);
  });
});
