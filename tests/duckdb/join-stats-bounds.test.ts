/**
 * The enrichment join scores every unmatched source value against every target
 * value. Without a bound that residual is a cross join over the whole imported
 * column: measured at 28 s for 50 000 unmatched values against a 32 639-row
 * target, growing linearly (~400 s at 700 000).
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import { join_macros } from '$lib/features/duckdb/macros/join';
import { MAX_FUZZY_JOIN_CANDIDATES } from '$lib/features/commons/constants/data.constants';
import { JoinStatus } from '$lib/features/commons/constants/ui.constants';
import {
  createTestInstance,
  destroyTestInstance,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

let db: TestDuckDB;
const executedSql: string[] = [];

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    async query(sql: string) {
      executedSql.push(sql);
      const reader = await db.connection.runAndReadAll(sql);
      return reader.getRowObjectsJson();
    }
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/state.svelte', () => ({
  getFilters: () => []
}));

const { computeDatasetJoinStats } =
  await import('$lib/features/data-tab/services/join-stats.service');

const OPTIONS = {
  sourceTableName: 'src_table',
  sourceColumn: 'city',
  targetTableName: 'target_table',
  targetColumn: 'name'
};

async function seedTarget(values: string[]): Promise<void> {
  await run(db, 'CREATE OR REPLACE TABLE target_table (name VARCHAR)');
  if (values.length === 0) return;
  const rows = values.map((value) => `('${value}')`).join(', ');
  await run(db, `INSERT INTO target_table VALUES ${rows}`);
}

async function seedSource(values: string[]): Promise<void> {
  await run(db, 'CREATE OR REPLACE TABLE src_table (city VARCHAR)');
  if (values.length === 0) return;
  const rows = values.map((value) => `('${value}')`).join(', ');
  await run(db, `INSERT INTO src_table VALUES ${rows}`);
}

beforeAll(async () => {
  db = await createTestInstance();
  await db.connection.run(join_macros);
});

afterAll(async () => {
  await destroyTestInstance(db);
});

beforeEach(() => {
  executedSql.length = 0;
});

describe('enrichment join bounds', () => {
  it('grades exact, duplicate and unrecognized values without fuzzy noise', async () => {
    await seedTarget(['Paris', 'Lyon', 'Marseille']);
    await seedSource(['Paris', 'Lyon', 'Lyon', 'Berlin']);

    const stats = await computeDatasetJoinStats(OPTIONS);

    expect(stats.joinedCount).toBe(1);
    expect(stats.duplicateCount).toBe(1);
    expect(stats.unrecognizedCount).toBe(1);
    expect(stats.duplicateLines).toHaveLength(1);
    expect(stats.duplicateLines[0].dataValue).toBe('Lyon');
    expect(stats.duplicateLines[0].lines.map(Number)).toEqual([1, 2]);
  });

  it('suggests the near-miss target for a typo', async () => {
    await seedTarget(['Marseille', 'Bordeaux']);
    await seedSource(['Marseile']);

    const stats = await computeDatasetJoinStats(OPTIONS);

    expect(stats.toVerifyCount).toBe(1);
    const entity = stats.entities.find((e) => e.dataValue === 'Marseile');
    expect(entity?.status).toBe(JoinStatus.TO_VERIFY);
    expect(entity?.matches).toEqual(['Marseille']);
  });

  it('caps the suggestions per source value', async () => {
    const homonyms = Array.from(
      { length: 12 },
      (_, index) => `Villeneuve-sur-Lo${'t'.repeat(index + 1)}`
    );
    await seedTarget(homonyms);
    await seedSource(['Villeneuve-sur-Lo']);

    const stats = await computeDatasetJoinStats(OPTIONS);

    const entity = stats.entities.find(
      (e) => e.dataValue === 'Villeneuve-sur-Lo'
    );
    expect(entity?.matches?.length).toBeLessThanOrEqual(5);
  });

  it('never inlines source values as SQL literals', async () => {
    await seedTarget(['Paris']);
    await seedSource(['Sentinelle-Ville', 'Sentinelle-Ville', 'Berlin']);

    await computeDatasetJoinStats(OPTIONS);

    const inlined = executedSql.filter((sql) =>
      sql.includes("'Sentinelle-Ville'")
    );
    expect(inlined).toEqual([]);
  });

  it('drops the fuzzy phase past the candidate cap instead of cross-joining', async () => {
    await seedTarget(['Paris', 'Lyon']);
    const oversized = Array.from(
      { length: MAX_FUZZY_JOIN_CANDIDATES + 1 },
      (_, index) => `Inconnue-${index}`
    );
    await seedSource(oversized);

    const stats = await computeDatasetJoinStats(OPTIONS);

    expect(stats.unrecognizedCount).toBe(MAX_FUZZY_JOIN_CANDIDATES + 1);
    expect(stats.toVerifyCount).toBe(0);
  });

  it('still suggests at the candidate cap', async () => {
    await seedTarget(['Marseille']);
    const atCap = Array.from(
      { length: MAX_FUZZY_JOIN_CANDIDATES - 1 },
      (_, index) => `Inconnue-${index}`
    );
    await seedSource([...atCap, 'Marseile']);

    const stats = await computeDatasetJoinStats(OPTIONS);

    expect(stats.toVerifyCount).toBe(1);
    expect(
      stats.entities.find((e) => e.dataValue === 'Marseile')?.matches
    ).toEqual(['Marseille']);
  });

  it('drops its temp tables so a later run cannot read stale candidates', async () => {
    await seedTarget(['Paris']);
    await seedSource(['Paris']);

    await computeDatasetJoinStats(OPTIONS);

    const reader = await db.connection.runAndReadAll(
      `SELECT table_name FROM information_schema.tables
       WHERE table_name IN ('__join_stats_candidates__', '__join_stats_target__')`
    );
    expect(reader.getRowObjectsJson()).toEqual([]);
  });
});
