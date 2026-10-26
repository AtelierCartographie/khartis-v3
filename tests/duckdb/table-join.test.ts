/**
 * A table-to-table join (enriching a geo file with a table) goes through the
 * same similarity cache and grading as a catalog join, against a target built
 * from one column of the other table.
 *
 * The fuzzy residual is bounded by a budget on candidate x target pairs: an
 * unbounded cross join measured 28 s for 50 000 unmatched values against a
 * 32 639-row target. Only the over-budget side is asserted, since staying under
 * it means performing up to MAX_FUZZY_AUTO_PAIRS comparisons by design.
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
import { MAX_FUZZY_AUTO_PAIRS } from '$lib/features/commons/constants/data.constants';
import {
  computeTargetJoinStats,
  createEnrichedTable,
  getJoinTargetValues,
  invalidateSimilarityCache,
  prepareTableJoinTarget,
  type DuckDBClientForJoin
} from '$lib/features/duckdb/orchestrator/join-ops';
import {
  createTestInstance,
  destroyTestInstance,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

let db: TestDuckDB;

async function query(sql: string): Promise<unknown> {
  const reader = await db.connection.runAndReadAll(sql);
  return reader.getRowObjectsJson();
}

const Duck: DuckDBClientForJoin = { query };

vi.mock('$lib/features/duckdb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/features/duckdb')>()),
  Duck: { query }
}));

const { findBestColumnPair, findBestTargetColumn } =
  await import('$lib/features/data-tab/services/target-column-ranking.service');

const TARGET = { targetTableName: 'target_table', targetColumn: 'name' };
const SOURCE = { tableName: 'src_table' };

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

async function seedGenerated(
  table: string,
  column: string,
  prefix: string,
  count: number
): Promise<void> {
  await run(db, `CREATE OR REPLACE TABLE ${table} (${column} VARCHAR)`);
  await run(
    db,
    `INSERT INTO ${table} SELECT '${prefix}' || i FROM range(${count}) t(i)`
  );
}

async function grade(source = SOURCE) {
  const target = await prepareTableJoinTarget(Duck, TARGET);
  return computeTargetJoinStats(source, target, 'city', Duck);
}

function suggestionsFor(
  quality: Awaited<ReturnType<typeof grade>>,
  value: string
): string[] | undefined {
  return quality.joinMappings
    .find((mapping) => mapping.dataValue === value)
    ?.candidates?.map((candidate) => candidate.name);
}

beforeAll(async () => {
  db = await createTestInstance();
  await db.connection.run(join_macros);
});

afterAll(async () => {
  await destroyTestInstance(db);
});

beforeEach(() => {
  invalidateSimilarityCache();
});

describe('table-to-table join grading', () => {
  it('grades exact, duplicate and unrecognized values without fuzzy noise', async () => {
    await seedTarget(['Paris', 'Lyon', 'Marseille']);
    await seedSource(['Paris', 'Lyon', 'Lyon', 'Berlin']);

    const quality = await grade();

    expect(quality.joinedCount).toBe(1);
    expect(quality.duplicateCount).toBe(1);
    expect(quality.unrecognizedCount).toBe(1);
    expect(quality.duplicateLines).toHaveLength(1);
    expect(quality.duplicateLines[0].dataValue).toBe('Lyon');
    expect(quality.duplicateLines[0].lines.map(Number)).toEqual([1, 2]);
  });

  it('suggests the near-miss target for a typo', async () => {
    await seedTarget(['Marseille', 'Bordeaux']);
    await seedSource(['Marseile']);

    const quality = await grade();

    expect(quality.toVerifyCount).toBe(1);
    expect(suggestionsFor(quality, 'Marseile')).toEqual(['Marseille']);
  });

  it('should leave unknown INSEE codes unrecognized when a near code exists', async () => {
    // 26371 ≈ 26317 scores 0.95 in Jaro-Winkler: similarity between codes is
    // noise, and a to-verify entity is joined, so it must never land there.
    await seedTarget(['26317', '75056', '19224', '25534', '2A004']);
    await seedSource(['26317', '2A004', '26371', '75115', '19223', '25533']);

    const quality = await grade();

    expect(quality.joinedCount).toBe(2);
    expect(quality.toVerifyCount).toBe(0);
    expect(quality.unrecognizedCount).toBe(4);
    expect(quality.unrecognizedEntities).toContain('26371');
  });

  it('should leave a value unrecognized when its only candidate is already joined', async () => {
    await seedTarget(['Marseille', 'Bordeaux']);
    await seedSource(['Marseille', 'Marseile']);

    const quality = await grade();

    expect(quality.joinedCount).toBe(1);
    expect(quality.toVerifyCount).toBe(0);
    expect(quality.unrecognizedEntities).toEqual(['Marseile']);
  });

  it('should keep a free near-miss as the match of a to-verify value', async () => {
    await seedTarget(['Marseille', 'Bordeaux']);
    await seedSource(['Bordeaux', 'Marseile']);

    const quality = await grade();

    expect(suggestionsFor(quality, 'Marseile')).toEqual(['Marseille']);
  });

  it('should grade a value ambiguous when two target spellings normalize alike', async () => {
    await seedTarget(['Saint-Denis', 'Saint Denis', 'Lyon']);
    await seedSource(['saint denis', 'Lyon']);

    const quality = await grade();

    expect(quality.joinedCount).toBe(1);
    expect(quality.toVerifyCount).toBe(1);
    expect(suggestionsFor(quality, 'saint denis')?.sort()).toEqual([
      'Saint Denis',
      'Saint-Denis'
    ]);
  });

  it('drops the fuzzy phase past the pair budget instead of cross-joining', async () => {
    const targets = 6000;
    const candidates = Math.floor(MAX_FUZZY_AUTO_PAIRS / targets) + 1;
    await seedGenerated('target_table', 'name', 'Cible-', targets);
    await seedGenerated('src_table', 'city', 'Inconnue-', candidates);

    const quality = await grade();

    expect(candidates * targets).toBeGreaterThan(MAX_FUZZY_AUTO_PAIRS);
    expect(quality.unrecognizedCount).toBe(candidates);
    expect(quality.toVerifyCount).toBe(0);
  });

  it('scales the candidate allowance with the target size', async () => {
    // Same candidate count, a target small enough to stay inside the budget:
    // a fixed candidate cap would have refused both, the budget refuses only
    // the one whose product is too large.
    const candidates = Math.floor(MAX_FUZZY_AUTO_PAIRS / 6000) + 1;
    await seedTarget(['Marseille', 'Bordeaux']);
    await seedGenerated('src_table', 'city', 'Inconnue-', candidates - 1);
    await run(db, `INSERT INTO src_table VALUES ('Marseile')`);

    const quality = await grade();

    expect(candidates * 2).toBeLessThanOrEqual(MAX_FUZZY_AUTO_PAIRS);
    expect(quality.toVerifyCount).toBe(1);
    expect(suggestionsFor(quality, 'Marseile')).toEqual(['Marseille']);
  });

  it('should grade against the rebuilt target, not a cache of the previous one', async () => {
    await seedTarget(['Paris']);
    await seedSource(['Lyon']);
    expect((await grade()).joinedCount).toBe(0);

    await seedTarget(['Paris', 'Lyon']);

    expect((await grade()).joinedCount).toBe(1);
  });

  it('keeps overlapping gradings of two sources apart', async () => {
    await seedTarget(['Paris', 'Lyon']);
    await seedSource(['Paris', 'Lyon', 'Lyon', 'Berlin']);
    await run(db, 'CREATE OR REPLACE TABLE other_src (city VARCHAR)');
    await run(db, `INSERT INTO other_src VALUES ('Paris'), ('Lyonn')`);

    const target = await prepareTableJoinTarget(Duck, TARGET);
    const [withDuplicates, withTypo] = await Promise.all([
      computeTargetJoinStats(SOURCE, target, 'city', Duck),
      computeTargetJoinStats({ tableName: 'other_src' }, target, 'city', Duck)
    ]);

    expect(withDuplicates.duplicateLines).toHaveLength(1);
    expect(withTypo.toVerifyCount).toBe(1);
  });

  it('lists every target value for manual correction', async () => {
    await seedTarget(['Lyon', 'Paris', 'Lyon']);

    const target = await prepareTableJoinTarget(Duck, TARGET);

    expect(await getJoinTargetValues(Duck, target)).toEqual(['Lyon', 'Paris']);
  });
});

describe('enriched table', () => {
  beforeEach(async () => {
    await run(
      db,
      `CREATE OR REPLACE TABLE target_table AS
       SELECT * FROM (VALUES ('A', 'Alpha'), ('B', 'Beta'), ('C', 'Gamma'))
       t(code, name)`
    );
    await run(
      db,
      `CREATE OR REPLACE TABLE src_table AS
       SELECT * FROM (VALUES ('alpha', 120), ('Betta', 80), ('Gamma', 160), ('Gamma', 999))
       t(city, population)`
    );
  });

  async function enrich(
    corrections: Record<string, string>,
    excludedValues: string[] = []
  ) {
    await run(db, 'DROP TABLE IF EXISTS enriched');
    await createEnrichedTable(Duck, {
      ...TARGET,
      sourceTableName: 'src_table',
      sourceColumn: 'city',
      sourceColumns: ['population'],
      corrections,
      excludedValues,
      enrichedTableName: 'enriched'
    });
    return (await query(
      'SELECT code, name, population FROM enriched ORDER BY code'
    )) as Array<{ code: string; name: string; population: number | null }>;
  }

  it('should join on normalized values and apply a correction to the source value', async () => {
    const rows = await enrich({ Betta: 'Beta' });

    expect(rows.map((row) => row.population)).toEqual([120, 80, 160]);
  });

  it('should keep every target row and leave an excluded value unjoined', async () => {
    const rows = await enrich({}, ['Gamma']);

    expect(rows.map((row) => row.code)).toEqual(['A', 'B', 'C']);
    expect(rows.map((row) => row.population)).toEqual([120, null, null]);
  });
});

describe('enrichment target column suggestion', () => {
  it('picks the target column that holds the source codes', async () => {
    await run(
      db,
      `CREATE OR REPLACE TABLE target_table AS
       SELECT * FROM (VALUES
         ('Abergement', '01001', 'A1'),
         ('Ambérieu', '01004', 'A4'),
         ('Paris', '75056', '01001')
       ) t(nom, code_insee, code_postal)`
    );
    await seedSource(['01001', '01004', '75056']);

    const best = await findBestTargetColumn({
      sourceTableName: 'src_table',
      sourceColumn: 'city',
      targetTableName: 'target_table',
      targetColumns: ['nom', 'code_postal', 'code_insee']
    });

    expect(best?.column).toBe('code_insee');
  });

  it('should score the share of distinct source values the best column holds', async () => {
    await seedTarget(['Paris', 'Lyon', 'Marseille']);
    await seedSource(['PARIS', 'Lyon', 'Lyon', 'Berlin', 'Madrid']);

    const best = await findBestTargetColumn({
      sourceTableName: 'src_table',
      sourceColumn: 'city',
      targetTableName: 'target_table',
      targetColumns: ['name']
    });

    expect(best).toEqual({ column: 'name', matchShare: 50 });
  });

  it('should pick the source and target columns that share the most values', async () => {
    await run(
      db,
      `CREATE OR REPLACE TABLE target_table AS
       SELECT * FROM (VALUES ('A', 'Alpha'), ('B', 'Beta'), ('C', 'Gamma'))
       t(code, name)`
    );
    await run(
      db,
      `CREATE OR REPLACE TABLE src_table AS
       SELECT * FROM (VALUES ('Alpha', 'x'), ('Beta', 'y'), ('Delta', 'z'))
       t(nom, other)`
    );

    const pair = await findBestColumnPair({
      sourceTableName: 'src_table',
      sourceColumns: ['other', 'nom'],
      targetTableName: 'target_table',
      targetColumns: ['code', 'name']
    });

    expect(pair).toEqual({
      sourceColumn: 'nom',
      targetColumn: 'name',
      matchShare: (2 / 3) * 100
    });
  });

  it('suggests nothing when no target column shares a value', async () => {
    await seedTarget(['Paris', 'Lyon']);
    await seedSource(['Berlin']);

    const best = await findBestTargetColumn({
      sourceTableName: 'src_table',
      sourceColumn: 'city',
      targetTableName: 'target_table',
      targetColumns: ['name']
    });

    expect(best).toBeNull();
  });
});
