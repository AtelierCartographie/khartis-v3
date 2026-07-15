import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { analyse as analyseMacros } from '$lib/features/duckdb/macros/analyse';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

const bridge = vi.hoisted(() => ({
  execute: null as ((sql: string, format?: string) => Promise<unknown>) | null,
  queries: [] as string[]
}));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: (
    _connection: unknown,
    sql: string,
    options: { format?: string } = {}
  ) => {
    if (!bridge.execute) throw new Error('DuckDB bridge not initialized');
    bridge.queries.push(sql);
    return bridge.execute(sql, options.format);
  }
}));

import { analyse } from '$lib/features/duckdb/operations/analysis';
import type { DuckDBContext } from '$lib/features/duckdb/types';

let db: TestDuckDB;

function makeCtx(): DuckDBContext {
  return {
    connection: {},
    describeCache: new Map(),
    rowCountCache: new Map(),
    table_metadata: new Map()
  } as unknown as DuckDBContext;
}

function toTableLike(rows: Record<string, unknown>[]): {
  numRows: number;
  get(index: number): Record<string, unknown>;
  toArray(): Record<string, unknown>[];
} {
  return {
    numRows: rows.length,
    get: (index: number) => rows[index],
    toArray: () => rows
  };
}

function escapeString(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeIdent(value: string): string {
  return value.replace(/"/g, '""');
}

async function legacyColumnAnalysis(
  table: string,
  d: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const t = `'${escapeString(table)}'`;
  const c = `"${escapeIdent(String(d.name))}"`;

  const general = await query(db, `FROM summary_general(${t}, ${c})`)
    .then((rows) => rows[0] ?? null)
    .catch(() => null);

  if (d.type_simple === 'numeric') {
    const numeric = await query(db, `FROM summary_numeric(${t}, ${c})`)
      .then((rows) => rows[0] ?? null)
      .catch(() => null);
    const histogram = await query(
      db,
      `FROM histogram_numeric(${t}, ${c})`
    ).catch(() => null);
    return { ...d, ...(general ?? {}), ...(numeric ?? {}), histogram };
  }

  if (d.type_simple === 'date') {
    const dateSummary = await query(db, `FROM summary_date(${t}, ${c})`)
      .then((rows) => rows[0] ?? null)
      .catch(() => null);
    const histogram = await query(db, `FROM histogram_date(${t}, ${c})`).catch(
      () => null
    );
    return { ...d, ...(general ?? {}), ...(dateSummary ?? {}), histogram };
  }

  if (d.type_simple === 'string') {
    const histogram = await query(db, `FROM histogram_categorical(${t}, ${c})`);
    return { ...d, ...(general ?? {}), histogram };
  }

  return { ...d };
}

async function legacyAnalyse(
  table: string
): Promise<Record<string, unknown>[]> {
  const describeRows = await query(
    db,
    `FROM describe_full('${escapeString(table)}')`
  );
  const results: Record<string, unknown>[] = [];
  for (const d of describeRows) {
    results.push(await legacyColumnAnalysis(table, d));
  }
  return describeRows.map(
    (col) => results.find((r) => r.name === col.name) ?? col
  );
}

function materializeHistogram(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === 'object' &&
    'toArray' in value &&
    typeof value.toArray === 'function'
  ) {
    return value.toArray();
  }
  return value;
}

function materializeResults(
  results: Record<string, unknown>[]
): Record<string, unknown>[] {
  return results.map((column) =>
    'histogram' in column
      ? { ...column, histogram: materializeHistogram(column.histogram) }
      : column
  );
}

beforeAll(async () => {
  db = await createTestInstance();
  await run(db, 'SET threads TO 1');
  await db.connection.run(analyseMacros);
  bridge.execute = async (sql, format) => {
    const rows = await query(db, sql);
    return format === 'array' ? rows : toTableLike(rows);
  };

  await run(
    db,
    `CREATE TABLE analysed (
      id INTEGER,
      amount DOUBLE,
      big BIGINT,
      ratio DECIMAL(6,3),
      all_null DOUBLE,
      steady INTEGER,
      born DATE,
      seen TIMESTAMP,
      label VARCHAR,
      "Weird ""Category""" VARCHAR,
      active BOOLEAN
    )`
  );
  await run(
    db,
    `INSERT INTO analysed VALUES
      (1, -2.5, 9000000000, 1.250, NULL, 7, DATE '2020-01-05', TIMESTAMP '2020-01-05 08:30:00', 'alpha', 'north', true),
      (2, 3.75, 9000000001, 2.500, NULL, 7, DATE '2020-02-14', TIMESTAMP '2020-02-14 12:00:00', 'béta', 'south', false),
      (3, 10.0, 9000000002, 2.500, NULL, 7, DATE '2020-03-01', NULL, 'gamma', 'north', true),
      (4, NULL, 9000000003, NULL, NULL, 7, NULL, TIMESTAMP '2020-04-20 23:59:59', 'delta', NULL, NULL),
      (5, 0.0, 9000000010, 3.125, NULL, 7, DATE '2021-07-14', TIMESTAMP '2021-07-14 06:45:00', 'epsilon', 'unique', true),
      (6, -7.25, 9000000011, 0.001, NULL, 7, DATE '2022-11-30', TIMESTAMP '2022-11-30 18:15:30', 'zêta', 'south', false)`
  );

  const wideNumericExprs = Array.from({ length: 24 }, (_, k) =>
    k % 2 === 0
      ? `((i * ${k + 3}) % 23)::INTEGER AS "v${k}"`
      : `(i * ${k}.5 - ${k * 7}) AS "v${k}"`
  );
  await run(
    db,
    `CREATE TABLE wide AS SELECT
      ${wideNumericExprs.join(', ')},
      'cat_' || (i % 3) AS s0,
      CASE WHEN i % 5 = 0 THEN NULL ELSE 'val_' || (i % 11) END AS s1
    FROM range(40) t(i)`
  );

  await run(db, 'CREATE TABLE empty_t (a INTEGER, b VARCHAR)');
});

afterAll(async () => {
  await destroyTestInstance(db);
});

interface QueryProfile {
  describe: string[];
  rowCount: string[];
  general: string[];
  numeric: string[];
  date: string[];
  histogram: string[];
}

function profileQueries(queries: string[]): QueryProfile {
  return {
    describe: queries.filter((sql) => sql.includes('describe_full')),
    rowCount: queries.filter((sql) => sql.includes('num_rows')),
    general: queries.filter((sql) => sql.includes('first(alias(')),
    numeric: queries.filter((sql) => sql.includes('POSITIONAL JOIN')),
    date: queries.filter(
      (sql) =>
        sql.includes('_min"') &&
        !sql.includes('POSITIONAL JOIN') &&
        !sql.includes('row_number() OVER ()')
    ),
    histogram: queries.filter((sql) => sql.includes('row_number() OVER ()'))
  };
}

async function describeTypes(sql: string): Promise<Map<string, string>> {
  const rows = await query(db, `DESCRIBE ${sql}`);
  return new Map(
    rows.map((row) => [String(row.column_name), String(row.column_type)])
  );
}

describe('analyse output parity with per-column macro queries', () => {
  it('should return identical fields, values, and column order when analysing a mixed-type table', async () => {
    const expected = await legacyAnalyse('analysed');

    bridge.queries.length = 0;
    const results = await analyse(makeCtx(), 'analysed');
    const materialized = materializeResults(results);

    expect(materialized).toEqual(expected);
    materialized.forEach((column, index) => {
      expect(Object.keys(column)).toEqual(Object.keys(expected[index]));
    });
    expect(results.map((column) => column.name)).toEqual(
      expected.map((column) => column.name)
    );
  });

  it('should merge the per-column statistics into one query per type family', async () => {
    bridge.queries.length = 0;
    await analyse(makeCtx(), 'analysed');

    const profile = profileQueries(bridge.queries);
    expect(profile.describe).toHaveLength(1);
    expect(profile.rowCount).toHaveLength(1);
    expect(profile.general).toHaveLength(1);
    expect(profile.numeric).toHaveLength(1);
    expect(profile.date).toHaveLength(1);
    expect(profile.histogram).toHaveLength(1);
    const statisticQueries = bridge.queries.filter(
      (sql) => !sql.startsWith('DROP TABLE IF EXISTS')
    );
    expect(statisticQueries).toHaveLength(6);
  });

  it('should return identical results when the column count exceeds one merge batch', async () => {
    const expected = await legacyAnalyse('wide');

    bridge.queries.length = 0;
    const results = await analyse(makeCtx(), 'wide');

    expect(materializeResults(results)).toEqual(expected);
    const profile = profileQueries(bridge.queries);
    expect(profile.general).toHaveLength(2);
    expect(profile.numeric).toHaveLength(2);
    expect(profile.date).toHaveLength(0);
    expect(profile.histogram).toHaveLength(2);
    const statisticQueries = bridge.queries.filter(
      (sql) => !sql.startsWith('DROP TABLE IF EXISTS')
    );
    expect(statisticQueries).toHaveLength(8);
  });

  it('should return bare describe rows when the table is empty', async () => {
    const expected = await legacyAnalyse('empty_t');

    const results = await analyse(makeCtx(), 'empty_t');

    expect(materializeResults(results)).toEqual(expected);
  });

  it('should keep per-column result types identical to the per-column macros', async () => {
    const describeRows = await query(db, `FROM describe_full('analysed')`);
    const byFamily = (family: string): string[] =>
      describeRows
        .filter((row) => row.type_simple === family)
        .map((row) => String(row.name));
    const numericNames = byFamily('numeric');
    const dateNames = byFamily('date');
    const stringNames = byFamily('string');
    const analyzedNames = [...numericNames, ...dateNames, ...stringNames];

    bridge.queries.length = 0;
    await analyse(makeCtx(), 'analysed');
    const profile = profileQueries(bridge.queries);

    const assertSummaryTypes = async (
      mergedSql: string,
      names: string[],
      macro: string
    ): Promise<void> => {
      const mergedTypes = await describeTypes(mergedSql);
      for (const [index, name] of names.entries()) {
        const legacyTypes = await describeTypes(
          `FROM ${macro}('analysed', "${escapeIdent(name)}")`
        );
        for (const [field, legacyType] of legacyTypes) {
          expect(mergedTypes.get(`__c${index}_${field}`)).toBe(legacyType);
        }
      }
    };

    await assertSummaryTypes(
      profile.general[0],
      analyzedNames,
      'summary_general'
    );
    await assertSummaryTypes(
      profile.numeric[0],
      numericNames,
      'summary_numeric'
    );
    await assertSummaryTypes(profile.date[0], dateNames, 'summary_date');

    const histogramSpecs = [
      ...numericNames.map((name) => ({ name, macro: 'histogram_numeric' })),
      ...dateNames.map((name) => ({ name, macro: 'histogram_date' })),
      ...stringNames.map((name) => ({ name, macro: 'histogram_categorical' }))
    ];
    const mergedHistogramTypes = await describeTypes(profile.histogram[0]);
    for (const [index, spec] of histogramSpecs.entries()) {
      const legacyTypes = await describeTypes(
        `FROM ${spec.macro}('analysed', "${escapeIdent(spec.name)}")`
      );
      const expectedStruct = `STRUCT(${[...legacyTypes]
        .map(([field, fieldType]) => `${field} ${fieldType}`)
        .join(', ')})[]`;
      const mergedType = mergedHistogramTypes.get(`__c${index}`) ?? '';
      expect(mergedType.replace(/"/g, '')).toBe(expectedStruct);
    }
  });
});
