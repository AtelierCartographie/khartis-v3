import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getCsvErrorLine,
  matchesDuckDBError,
  type DuckDBErrorKind
} from '$lib/features/duckdb/utils/duckdb-error.utils';
import {
  createTestInstance,
  destroyTestInstance,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

// 'file-unreadable', 'multiple-layers', 'crs-not-found' and 'thread-pool' come
// from the WASM build (its file system, its GDAL and PROJ setup, pthreads):
// the native engine words those failures differently or never raises them.
const KINDS: DuckDBErrorKind[] = [
  'missing-table',
  'out-of-memory',
  'csv',
  'file-unreadable',
  'multiple-layers',
  'crs-not-found',
  'thread-pool'
];

describe('DuckDB error classification', () => {
  let db: TestDuckDB;
  let dir: string;

  async function failureOf(sql: string): Promise<unknown> {
    try {
      await run(db, sql);
    } catch (error) {
      return error;
    }
    throw new Error(`expected a failure from: ${sql}`);
  }

  function kindsOf(error: unknown): DuckDBErrorKind[] {
    return KINDS.filter((kind) => matchesDuckDBError(error, kind));
  }

  beforeAll(async () => {
    db = await createTestInstance();
    dir = mkdtempSync(join(tmpdir(), 'khartis-duckdb-error-'));
  });

  afterAll(async () => {
    await destroyTestInstance(db);
    rmSync(dir, { recursive: true, force: true });
  });

  it('should classify a missing table when a query reads a dropped table', async () => {
    const error = await failureOf('SELECT * FROM "dropped_table"');

    expect(kindsOf(error)).toEqual(['missing-table']);
  });

  it('should classify an out-of-memory failure when the memory limit is exceeded', async () => {
    await run(db, `SET memory_limit = '1MB'`);
    const error = await failureOf(
      'SELECT list(range) FROM range(10000000)'
    ).finally(() => run(db, `SET memory_limit = '1GB'`));

    expect(kindsOf(error)).toEqual(['out-of-memory']);
  });

  it('should classify a CSV failure and read its line when a value does not convert', async () => {
    const file = join(dir, 'typed.csv');
    writeFileSync(file, 'a,b\n1,2\nx,4\n');

    const error = await failureOf(
      `SELECT * FROM read_csv('${file}', columns = {'a': 'INTEGER', 'b': 'INTEGER'}, header = true)`
    );

    expect(kindsOf(error)).toEqual(['csv']);
    expect(getCsvErrorLine(error)).toBe(3);
  });

  it('should classify a CSV failure when the file is not UTF-8', async () => {
    const file = join(dir, 'binary.csv');
    writeFileSync(file, Buffer.from([0, 159, 146, 150, 0, 0, 1]));

    const error = await failureOf(`SELECT * FROM read_csv('${file}')`);

    expect(kindsOf(error)).toEqual(['csv']);
    expect(getCsvErrorLine(error)).toBe(1);
  });
});
