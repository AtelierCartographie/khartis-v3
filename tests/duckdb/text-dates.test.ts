import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  promoteTextDateColumns,
  resolveBestTextDateFormat,
  type RowsQuery
} from '$lib/features/duckdb/io/text-dates';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

let db: TestDuckDB;
const rows: RowsQuery = (sql) =>
  query(db, sql) as Promise<Record<string, unknown>[]>;

async function columnTypes(table: string): Promise<Record<string, string>> {
  const result = await query(
    db,
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table}'`
  );
  return Object.fromEntries(
    result.map((row) => [String(row.column_name), String(row.data_type)])
  );
}

beforeAll(async () => {
  db = await createTestInstance();
  await run(
    db,
    `CREATE TABLE dates AS SELECT * FROM (VALUES
      ('15/01/2020', '2020-01', '15/01/2020 10:30', '2020-01-15', '01/02/2020', 'Lyon', '__x'),
      ('30/06/2021', '2021-06', '30/06/2021 08:00', '2021-02-30', '13/02/2020', 'Paris', '__x'),
      ('01/12/2023', '2023-12', '01/12/2023 00:00', '2023-12-01', '', 'Nice', '__x'),
      (NULL, NULL, NULL, NULL, NULL, NULL, '__x')
    ) AS t(day_first, year_month, day_first_time, with_invalid, ambiguous, city, __internal)`
  );
});

afterAll(async () => {
  await destroyTestInstance(db);
});

describe('promoteTextDateColumns', () => {
  it('should convert text columns whose every value is a date in one format', async () => {
    const promoted = await promoteTextDateColumns(rows, 'dates');

    expect(promoted.sort()).toEqual([
      'ambiguous',
      'day_first',
      'day_first_time',
      'year_month'
    ]);
    const types = await columnTypes('dates');
    expect(types.day_first).toBe('DATE');
    expect(types.year_month).toBe('DATE');
    expect(types.day_first_time).toBe('TIMESTAMP');
    expect(types.city).toBe('VARCHAR');

    const [first] = await query(
      db,
      "SELECT strftime(day_first, '%Y-%m-%d') AS d, strftime(year_month, '%Y-%m-%d') AS ym, strftime(ambiguous, '%Y-%m-%d') AS amb FROM dates WHERE city = 'Lyon'"
    );
    expect(first).toEqual({
      d: '2020-01-15',
      ym: '2020-01-01',
      amb: '2020-02-01'
    });
  });

  it('should keep a column as text when one value is not a valid date', async () => {
    const types = await columnTypes('dates');
    expect(types.with_invalid).toBe('VARCHAR');
  });

  it('should pick the format most values parse with when the user forces a date', async () => {
    const format = await resolveBestTextDateFormat(
      rows,
      'dates',
      'with_invalid'
    );
    expect(format?.pattern).toBe('%Y-%m-%d');
  });

  it('should type every date layout of the fixture the CSV sniffer leaves as text', async () => {
    const fixture = resolve(
      'tests-datasets/csv/dates-departements-formats.csv'
    );
    await run(
      db,
      `CREATE TABLE fixture AS FROM read_csv('${fixture}', header=true, decimal_separator=',')`
    );

    await promoteTextDateColumns(rows, 'fixture');

    expect(await columnTypes('fixture')).toMatchObject({
      code: 'VARCHAR',
      date_iso: 'DATE',
      date_fr: 'DATE',
      date_us: 'DATE',
      annee_mois: 'DATE',
      date_heure_fr: 'TIMESTAMP',
      date_avec_invalide: 'VARCHAR',
      annee: 'BIGINT'
    });
    const [mismatch] = await query(
      db,
      'SELECT COUNT(*) FILTER (WHERE date_fr <> date_iso OR date_us <> date_iso) AS n FROM fixture'
    );
    expect(Number(mismatch.n)).toBe(0);
  });
});
