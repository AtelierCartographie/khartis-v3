/**
 * Regression test for exact_claimed_ids deduplication logic.
 *
 * Verifies that ambiguous exact matches (e.g. "Sainte-Colombe" mapping to
 * 12 different commune ids) do NOT claim those ids globally, leaving fuzzy
 * matches (e.g. "Saint-Colombe" → same ids at ~0.98) available as candidates.
 *
 * See: https://github.com/AtelierCartographie/khartis-v3/pull/101
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { join_macros } from '$lib/features/duckdb/macros/join';
import {
  computeJoinStats,
  invalidateSimilarityCache,
  type DuckDBClientForJoin
} from '$lib/features/duckdb/orchestrator/join-ops';
import { JoinStatus } from '$lib/features/commons/constants/ui.constants';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type { DuckDBDataset } from '$lib/features/duckdb/types';
import {
  createTestInstance,
  destroyTestInstance,
  run,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';

let db: TestDuckDB;

/**
 * Minimal DuckDBClientForJoin adapter wrapping @duckdb/node-api for tests.
 */
function makeDuckClient(testDb: TestDuckDB): DuckDBClientForJoin {
  return {
    async query(sql: string, options?: { format?: string }) {
      const reader = await testDb.connection.runAndReadAll(sql);
      if (options?.format === 'array') {
        return reader.getRowObjectsJson();
      }
      return reader.getRowObjectsJson();
    },
    async join_by_id() {
      throw new Error('not implemented in test');
    },
    async apply_join_association() {
      throw new Error('not implemented in test');
    }
  };
}

const TEST_BASEMAP = 'test-communes';

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
    id: 'test-dataset',
    tableName,
    sourceFileId: 'test',
    name: 'test',
    columns: [],
    rowCount: 0,
    metadata: { processedAt: new Date(), fileType: 'csv' as never }
  };
}

beforeAll(async () => {
  db = await createTestInstance();
  // Install join macros (normalize_text_join is required by ensureSimilarityCached)
  await db.connection.run(join_macros);
});

afterAll(async () => {
  await destroyTestInstance(db);
});

describe('exact_claimed_ids deduplication', () => {
  beforeEach(async () => {
    invalidateSimilarityCache();

    // Basemap attributes: 3 communes named "Sainte-Colombe" with different ids,
    // plus 1 unique commune "Lyon" for a simple unambiguous exact match.
    await run(
      db,
      `CREATE OR REPLACE TABLE basemap_attributes (
        id VARCHAR, raw VARCHAR, variant VARCHAR,
        normalized VARCHAR, basemap VARCHAR, basemap_count INTEGER
      )`
    );

    // Build normalized values to match what normalize_text_join produces
    const entries = [
      // 3 distinct communes all named "Sainte-Colombe" (ambiguous exact)
      `('SC_01', 'Sainte-Colombe', 'nom', 'sainte colombe', '${TEST_BASEMAP}', 5)`,
      `('SC_02', 'Sainte-Colombe', 'nom', 'sainte colombe', '${TEST_BASEMAP}', 5)`,
      `('SC_03', 'Sainte-Colombe', 'nom', 'sainte colombe', '${TEST_BASEMAP}', 5)`,
      // Their code variants (unambiguous exact per code)
      `('SC_01', '01234', 'code', '01234', '${TEST_BASEMAP}', 5)`,
      `('SC_02', '56789', 'code', '56789', '${TEST_BASEMAP}', 5)`,
      `('SC_03', '11111', 'code', '11111', '${TEST_BASEMAP}', 5)`,
      // 1 unique commune "Lyon" (unambiguous exact)
      `('LY_01', 'Lyon', 'nom', 'lyon', '${TEST_BASEMAP}', 5)`,
      `('LY_01', '69123', 'code', '69123', '${TEST_BASEMAP}', 5)`,
      // 1 unique commune "Saint-Colombe-sur-Rhône"
      `('SCR_01', 'Saint-Colombe-sur-Rhône', 'nom', 'saint colombe sur rhone', '${TEST_BASEMAP}', 5)`,
      `('SCR_01', '22222', 'code', '22222', '${TEST_BASEMAP}', 5)`
    ];
    await run(
      db,
      `INSERT INTO basemap_attributes VALUES ${entries.join(',\n')}`
    );
  });

  it('does not over-claim ids from ambiguous exact matches (Sainte-Colombe / Saint-Colombe)', async () => {
    // User dataset: "Saint-Colombe" should fuzzy-match the 3 Sainte-Colombe ids
    // because "sainte colombe" ≈ "saint colombe" (JW ~0.98). Since the exact
    // match "Sainte-Colombe" is ambiguous (3 ids), none of those ids should be
    // claimed, and "Saint-Colombe" must still get candidates.
    await run(db, `CREATE OR REPLACE TABLE user_data (geo VARCHAR)`);
    await run(
      db,
      `INSERT INTO user_data VALUES ('Sainte-Colombe'), ('Saint-Colombe'), ('Lyon')`
    );

    const Duck = makeDuckClient(db);
    const dataset = makeDataset('user_data');
    const quality = await computeJoinStats(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck
    );

    // Lyon: unambiguous exact match → JOINED
    const lyon = quality.entities.find((e) => e.dataValue === 'Lyon');
    expect(lyon).toBeDefined();
    expect(lyon!.status).toBe(JoinStatus.JOINED);

    // Sainte-Colombe: exact match but ambiguous (3 distinct ids) → TO_VERIFY
    const ste = quality.entities.find((e) => e.dataValue === 'Sainte-Colombe');
    expect(ste).toBeDefined();
    expect(ste!.status).toBe(JoinStatus.TO_VERIFY);

    // Saint-Colombe: must NOT be UNRECOGNIZED — it should still have fuzzy
    // candidates (the 3 Sainte-Colombe ids + potentially Saint-Colombe-sur-Rhône)
    const st = quality.entities.find((e) => e.dataValue === 'Saint-Colombe');
    expect(st).toBeDefined();
    expect(st!.status).not.toBe(JoinStatus.UNRECOGNIZED);
    // It should have match candidates
    expect(st!.matches!.length).toBeGreaterThan(0);
  });

  it('still claims ids for unambiguous exact matches', async () => {
    // When an exact match is unambiguous (1 candidate → 1 id), that id should
    // still be excluded from partial candidates of other rows.
    await run(db, `CREATE OR REPLACE TABLE user_data2 (geo VARCHAR)`);
    await run(db, `INSERT INTO user_data2 VALUES ('Lyon'), ('69123')`);

    const Duck = makeDuckClient(db);
    const dataset = makeDataset('user_data2');
    const quality = await computeJoinStats(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck
    );

    // Both "Lyon" and "69123" map to LY_01 via exact match
    const lyon = quality.entities.find((e) => e.dataValue === 'Lyon');
    expect(lyon).toBeDefined();
    expect(lyon!.status).toBe(JoinStatus.JOINED);

    const code = quality.entities.find((e) => e.dataValue === '69123');
    expect(code).toBeDefined();
    expect(code!.status).toBe(JoinStatus.JOINED);
  });
});
