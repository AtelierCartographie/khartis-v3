import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { markTableMutated } from '$lib/features/duckdb/cache/cache-manager';
import {
  buildTableInBackground,
  isBuiltTableFresh,
  isTableBuildPending,
  waitForTableBuild
} from '$lib/features/duckdb/operations/background-table-build';
import {
  trackQuery,
  waitForQueryIdle
} from '$lib/features/duckdb/core/query-activity';
import type { DuckDBContext } from '$lib/features/duckdb/types';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

let db: TestDuckDB;

const statements: string[] = [];

const duck = {
  query: (sql: string) => {
    statements.push(sql);
    return query(db, sql);
  },
  invalidateTableCache: () => undefined
};

const mutationContext = {
  describeCache: new Map(),
  rowCountCache: new Map()
} as unknown as DuckDBContext;

beforeAll(async () => {
  db = await createTestInstance();
});

afterAll(async () => {
  await destroyTestInstance(db);
});

beforeEach(async () => {
  await run(
    db,
    `CREATE OR REPLACE TABLE source AS
     SELECT i AS id, i * 1.5 AS value FROM range(4500) t(i)`
  );
  await run(db, 'DELETE FROM source WHERE id % 7 = 0');
  statements.length = 0;
});

async function tableNames(): Promise<string[]> {
  const rows = await query(
    db,
    "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'target%'"
  );
  return rows.map((row) => String(row.table_name));
}

describe('buildTableInBackground', () => {
  it('writes the whole projection in source order, across rowid gaps', async () => {
    buildTableInBackground(duck, {
      sourceTable: 'source',
      targetTable: 'target',
      projection: '* REPLACE (value * 2 AS value)'
    });
    expect(isTableBuildPending('target')).toBe(true);

    expect(await isBuiltTableFresh('target')).toBe(true);
    expect(isTableBuildPending('target')).toBe(false);

    const mismatches = await query(
      db,
      `SELECT count(*) AS n FROM
         (SELECT id, value * 2 AS value FROM source) s
         POSITIONAL JOIN target t
       WHERE s.id <> t.id OR s.value <> t.value OR t.id IS NULL`
    );
    const counts = await query(
      db,
      'SELECT (SELECT count(*) FROM source) AS source_rows, (SELECT count(*) FROM target) AS target_rows'
    );
    expect(Number(mismatches[0].n)).toBe(0);
    expect(Number(counts[0].target_rows)).toBe(Number(counts[0].source_rows));
    expect(await tableNames()).toEqual(['target']);
    expect(
      statements.filter((sql) => sql.includes('INSERT INTO'))
    ).toHaveLength(4);
    expect(
      statements.some((sql) => sql.includes('CREATE OR REPLACE TABLE "target"'))
    ).toBe(false);
  });

  it('no longer reports the table as fresh once its source mutates', async () => {
    buildTableInBackground(duck, {
      sourceTable: 'source',
      targetTable: 'target',
      projection: '*'
    });
    await waitForTableBuild('target');

    markTableMutated(mutationContext, 'source');

    expect(await isBuiltTableFresh('target')).toBe(false);
  });

  it('keeps only the latest of two overlapping builds', async () => {
    buildTableInBackground(duck, {
      sourceTable: 'source',
      targetTable: 'target',
      projection: '* REPLACE (0 AS value)'
    });
    buildTableInBackground(duck, {
      sourceTable: 'source',
      targetTable: 'target',
      projection: '* REPLACE (1 AS value)'
    });

    expect(await isBuiltTableFresh('target')).toBe(true);
    const values = await query(
      db,
      'SELECT DISTINCT value FROM target ORDER BY value'
    );
    expect(values.map((row) => Number(row.value))).toEqual([1]);
    expect(await tableNames()).toEqual(['target']);
  });
});

describe('waitForQueryIdle', () => {
  it('holds background work while a foreground query is running', async () => {
    let finishForeground = () => {};
    const foreground = trackQuery(
      () =>
        new Promise<void>((resolve) => {
          finishForeground = resolve;
        })
    );
    let idle = false;
    const waiting = waitForQueryIdle(5).then(() => {
      idle = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(idle).toBe(false);

    finishForeground();
    await foreground;
    await waiting;
    expect(idle).toBe(true);
  });
});
