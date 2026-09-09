/**
 * The fuzzy phase is budgeted in candidate x target-name pairs, and the budget
 * is all-or-nothing for per-value suggestions. Two things must survive it:
 * the basemap ranking, which used to disappear entirely one value past the old
 * candidate cap, and the ability to ask for the full pass anyway.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { join_macros } from '$lib/features/duckdb/macros/join';
import {
  computeJoinStats,
  computeJoinSynthesis,
  estimateFuzzyPassMs,
  estimateJoinFuzzyPass,
  invalidateSimilarityCache,
  runFullFuzzyPass,
  type DuckDBClientForJoin
} from '$lib/features/duckdb/orchestrator/join-ops';
import { MAX_FUZZY_AUTO_PAIRS } from '$lib/features/commons/constants/data.constants';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type { DuckDBDataset } from '$lib/features/duckdb/types';
import {
  createTestInstance,
  destroyTestInstance,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

let db: TestDuckDB;
let Duck: DuckDBClientForJoin;

const TEST_BASEMAP = 'test-budget';
const TARGET_NAMES = 6000;
const OVER_BUDGET_CANDIDATES =
  Math.floor(MAX_FUZZY_AUTO_PAIRS / TARGET_NAMES) + 1;

const FAKE_BASEMAP_METADATA: BasemapMetadata = {
  file: `${TEST_BASEMAP}.parquet`,
  title_fr: 'Test',
  title_en: 'Test',
  source: 'test',
  date: '2025',
  bbox: [0, 0, 1, 1],
  proj_source: 'EPSG:4326',
  proj_to: { type: 'identity' },
  layers: []
};

function makeDataset(tableName: string): DuckDBDataset {
  return {
    id: 'budget-dataset',
    tableName,
    sourceFileId: 'test',
    name: 'test',
    columns: [],
    rowCount: 0,
    metadata: { processedAt: new Date(), fileType: 'csv' as never }
  };
}

/** Zero-padded suffixes keep every name the same length, so each typo has one clear counterpart. */
async function seedBasemapAttributes(count: number): Promise<void> {
  await run(
    db,
    `CREATE OR REPLACE TABLE basemap_attributes (
      id VARCHAR, raw VARCHAR, variant VARCHAR,
      normalized VARCHAR, basemap VARCHAR, basemap_count INTEGER
    )`
  );
  await run(
    db,
    `INSERT INTO basemap_attributes
     SELECT
       'ID_' || printf('%05d', i),
       'Villeneuve-sur-Lot-' || printf('%05d', i),
       'nom',
       normalize_text_join('Villeneuve-sur-Lot-' || printf('%05d', i)),
       '${TEST_BASEMAP}',
       ${count}
     FROM range(${count}) t(i)`
  );
}

/** Every source value is a one-character deletion away from a basemap name. */
async function seedSource(table: string, count: number): Promise<void> {
  await run(db, `CREATE OR REPLACE TABLE ${table} (geo VARCHAR)`);
  await run(
    db,
    `INSERT INTO ${table}
     SELECT 'Villeneuve-sur-Lo-' || printf('%05d', i)
     FROM range(${count}) t(i)`
  );
}

beforeAll(async () => {
  db = await createTestInstance();
  await db.connection.run(join_macros);
  Duck = {
    async query(sql: string) {
      const reader = await db.connection.runAndReadAll(sql);
      return reader.getRowObjectsJson();
    }
  };
});

afterAll(async () => {
  await destroyTestInstance(db);
});

beforeEach(async () => {
  invalidateSimilarityCache();
  await seedBasemapAttributes(TARGET_NAMES);
});

describe('fuzzy pass budget', () => {
  it('withholds per-value suggestions past the budget', async () => {
    await seedSource('over_budget', OVER_BUDGET_CANDIDATES);
    const dataset = makeDataset('over_budget');

    const quality = await computeJoinStats(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck
    );

    expect(OVER_BUDGET_CANDIDATES * TARGET_NAMES).toBeGreaterThan(
      MAX_FUZZY_AUTO_PAIRS
    );
    expect(quality.toVerifyCount).toBe(0);
    expect(quality.unrecognizedCount).toBe(OVER_BUDGET_CANDIDATES);
  });

  it('still ranks basemaps past the budget, from a bounded sample', async () => {
    await seedSource('over_budget_rank', OVER_BUDGET_CANDIDATES);
    const dataset = makeDataset('over_budget_rank');

    const synthesis = await computeJoinSynthesis(dataset, 'geo', Duck);

    // Before the sample this returned [] whenever nothing matched exactly,
    // so Khartis could not even name the basemap the data belongs to.
    expect(synthesis.length).toBeGreaterThan(0);
    expect(synthesis[0].basemap).toBe(TEST_BASEMAP);
    expect(synthesis[0].shareCandidate).toBeGreaterThan(0);
  });

  it('reports the skipped pass and what it would cost', async () => {
    await seedSource('over_budget_estimate', OVER_BUDGET_CANDIDATES);
    const dataset = makeDataset('over_budget_estimate');

    const estimate = await estimateJoinFuzzyPass(dataset, 'geo', Duck);

    expect(estimate.withinBudget).toBe(false);
    expect(estimate.fullPassRequested).toBe(false);
    expect(estimate.candidates).toBe(OVER_BUDGET_CANDIDATES);
    expect(estimate.targetNames).toBe(TARGET_NAMES);
    expect(estimate.estimatedMs).toBe(
      estimateFuzzyPassMs(OVER_BUDGET_CANDIDATES, TARGET_NAMES)
    );
  });

  it('leaves a within-budget column untouched', async () => {
    await seedSource('within_budget', 10);
    const dataset = makeDataset('within_budget');

    const estimate = await estimateJoinFuzzyPass(dataset, 'geo', Duck);
    const quality = await computeJoinStats(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck
    );

    expect(estimate.withinBudget).toBe(true);
    expect(quality.toVerifyCount).toBeGreaterThan(0);
  });

  it('honours the requested full pass on every later rebuild', async () => {
    await seedSource('forced', 10);
    const dataset = makeDataset('forced');

    await runFullFuzzyPass(dataset, 'geo', Duck);
    invalidateSimilarityCache('forced', Duck);
    const estimate = await estimateJoinFuzzyPass(dataset, 'geo', Duck);

    // A correction drops the cache; the request must outlive it or the
    // suggestions the user waited for would vanish on the next refresh.
    expect(estimate.fullPassRequested).toBe(true);
    expect(estimate.withinBudget).toBe(true);
  });
});
