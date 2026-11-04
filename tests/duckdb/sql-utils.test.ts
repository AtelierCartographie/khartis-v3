import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  sqlIdentifier,
  sqlNamePart,
  sqlString,
  sqlTempName
} from '$lib/features/commons/utils/sql.utils';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

describe('sql.utils', () => {
  let db: TestDuckDB;

  beforeAll(async () => {
    db = await createTestInstance();
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  it('should round-trip names and values when they contain quotes', async () => {
    const table = 'pop "2024"; DROP TABLE x; --';
    const column = `commune's "nom"`;
    const value = `L'Haÿ-les-Roses "centre"`;

    await run(
      db,
      `CREATE TABLE ${sqlIdentifier(table)} (${sqlIdentifier(column)} VARCHAR)`
    );
    await run(
      db,
      `INSERT INTO ${sqlIdentifier(table)} VALUES (${sqlString(value)})`
    );

    const rows = await query(
      db,
      `SELECT ${sqlIdentifier(column)} AS v FROM ${sqlIdentifier(table)}
       WHERE ${sqlIdentifier(column)} = ${sqlString(value)}`
    );
    const columns = await query(
      db,
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = ${sqlString(table)}`
    );

    expect(rows).toEqual([{ v: value }]);
    expect(columns).toEqual([{ column_name: column }]);
  });

  it('should build distinct usable names when called twice with the same input', async () => {
    const first = sqlTempName('tmp', 'données 2024.csv');
    const second = sqlTempName('tmp', 'données 2024.csv');

    expect(first).not.toBe(second);
    expect(sqlNamePart('données 2024.csv')).toBe('donn_es_2024_csv');
    await run(db, `CREATE TEMP TABLE ${first} AS SELECT 1 AS a`);
    expect(await query(db, `SELECT a FROM ${first}`)).toEqual([{ a: 1 }]);
  });
});
