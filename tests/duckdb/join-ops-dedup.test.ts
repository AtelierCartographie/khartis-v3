/**
 * Regression test for exact_claimed_ids deduplication logic.
 *
 * Verifies that ambiguous exact matches (e.g. "Sainte-Colombe" mapping to
 * 12 different commune ids) do NOT claim those ids globally, leaving fuzzy
 * matches (e.g. "Saint-Colombe" → same ids at ~0.98) available as candidates.
 *
 * See: https://github.com/AtelierCartographie/khartis-v3/pull/101
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
import {
  computeJoinSynthesis,
  computeJoinStats,
  finalizeJoin,
  getJoinedBasemapValues,
  getJoinedEntitiesPage,
  invalidateSimilarityCache,
  type DuckDBClientForJoin
} from '$lib/features/duckdb/orchestrator/join-ops';
import {
  JOINED_BASEMAP_COLUMN,
  MAX_JOIN_BUCKET_LIST_VALUES
} from '$lib/features/commons/constants/data.constants';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import type { DuckDBDataset } from '$lib/features/duckdb/types';
import { DuckDBSimplifiedType } from '$lib/features/duckdb/enums';
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

function makeDataset(
  tableName: string,
  columns: DuckDBDataset['columns'] = []
): DuckDBDataset {
  return {
    id: 'test-dataset',
    tableName,
    sourceFileId: 'test',
    name: 'test',
    columns,
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
    expect(quality.joinedCount).toBe(1);
    const joinedPage = await getJoinedEntitiesPage(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck,
      { offset: 0, limit: 10 }
    );
    expect(joinedPage.map((row) => row.dataValue)).toEqual(['Lyon']);

    // Sainte-Colombe: exact match but ambiguous (3 distinct ids) → TO_VERIFY
    const ste = quality.joinMappings.find(
      (e) => e.dataValue === 'Sainte-Colombe'
    );
    expect(ste).toBeDefined();

    // Saint-Colombe: must NOT be UNRECOGNIZED — it should still have fuzzy
    // candidates (the 3 Sainte-Colombe ids + potentially Saint-Colombe-sur-Rhône)
    expect(quality.unrecognizedEntities).not.toContain('Saint-Colombe');
    const st = quality.joinMappings.find(
      (e) => e.dataValue === 'Saint-Colombe'
    );
    expect(st).toBeDefined();
    // It should have match candidates
    expect(st!.basemapOptions.length).toBeGreaterThan(0);
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
    expect(quality.joinedCount).toBe(2);
    expect(quality.toVerifyCount).toBe(0);
    expect(quality.unrecognizedCount).toBe(0);
    const joinedPage = await getJoinedEntitiesPage(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck,
      { offset: 0, limit: 10 }
    );
    expect(joinedPage.map((row) => row.dataValue)).toEqual(['69123', 'Lyon']);
  });

  it('orders to-verify candidates by score and aligns the preselection with the finalized join', async () => {
    await run(db, `CREATE OR REPLACE TABLE user_data4 (geo VARCHAR)`);
    await run(db, `INSERT INTO user_data4 VALUES ('Saint-Colombe')`);

    const Duck = makeDuckClient(db);
    const dataset = makeDataset('user_data4', [
      { name: 'geo', type_simple: DuckDBSimplifiedType.STRING }
    ]);
    const quality = await computeJoinStats(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck
    );

    const st = quality.joinMappings.find(
      (e) => e.dataValue === 'Saint-Colombe'
    );
    expect(st).toBeDefined();
    expect(quality.toVerifyCount).toBe(1);

    // Candidates carry score/type/variant and come back best-first
    const candidates = st!.candidates!;
    expect(candidates.length).toBeGreaterThan(1);
    const scores = candidates.map((c) => c.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(candidates[0]).toMatchObject({
      id: 'SC_01',
      name: 'Sainte-Colombe',
      type: 'partial',
      variant: 'nom'
    });
    expect(candidates[0].score).toBeGreaterThan(0.9);
    expect(candidates[0].score).toBeLessThan(1);
    expect(st!.basemapOptions[0]).toBe('Sainte-Colombe');
    expect(st!.selectedMapping).toBe('Sainte-Colombe');

    // The finalized join must apply exactly the candidate the UI preselects
    await finalizeJoin(dataset, FAKE_BASEMAP_METADATA, 'geo', Duck);
    const joined = (await Duck.query(
      `SELECT "${JOINED_BASEMAP_COLUMN.ID}" AS id, "${JOINED_BASEMAP_COLUMN.LABEL}" AS label FROM user_data4`,
      { format: 'array' }
    )) as Array<{ id: string; label: string }>;
    expect(joined).toHaveLength(1);
    expect(joined[0].id).toBe(candidates[0].id);
    expect(joined[0].label).toBe(candidates[0].name);
  });

  it('disables fuzzy suggestions when the source column holds numeric codes', async () => {
    await run(db, `CREATE OR REPLACE TABLE user_codes (geo VARCHAR)`);
    await run(
      db,
      `INSERT INTO user_codes VALUES ('01234'), ('56789'), ('99999')`
    );

    const Duck = makeDuckClient(db);
    const dataset = makeDataset('user_codes');
    const quality = await computeJoinStats(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck
    );

    const joinedPage = await getJoinedEntitiesPage(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck,
      { offset: 0, limit: 10 }
    );
    expect(joinedPage.map((row) => row.dataValue)).toContain('01234');

    // '99999' is close to '56789'/'11111' in Jaro-Winkler terms, but fuzzy
    // matching between codes is noise: it must stay unrecognized.
    expect(quality.unrecognizedEntities).toContain('99999');
    expect(quality.joinMappings.some((e) => e.dataValue === '99999')).toBe(
      false
    );
  });

  it('disables fuzzy suggestions for fixed-length alphanumeric codes (ISO3-like)', async () => {
    await run(
      db,
      `INSERT INTO basemap_attributes VALUES
        ('FR001', 'FRA', 'iso', 'fra', '${TEST_BASEMAP}', 5),
        ('DE001', 'DEU', 'iso', 'deu', '${TEST_BASEMAP}', 5)`
    );
    await run(db, `CREATE OR REPLACE TABLE user_iso (geo VARCHAR)`);
    await run(db, `INSERT INTO user_iso VALUES ('FRA'), ('DEU'), ('FRB')`);

    const Duck = makeDuckClient(db);
    const dataset = makeDataset('user_iso');
    const quality = await computeJoinStats(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck
    );

    const joinedPage = await getJoinedEntitiesPage(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck,
      { offset: 0, limit: 10 }
    );
    expect(joinedPage.map((row) => row.dataValue)).toContain('FRA');

    // 'FRB' ≈ 'FRA' scores ~0.93 in Jaro-Winkler but is a distinct code
    expect(quality.unrecognizedEntities).toContain('FRB');
    expect(quality.joinMappings.some((e) => e.dataValue === 'FRB')).toBe(false);
  });

  it('keeps fuzzy suggestions for distinct place names with the same length', async () => {
    await run(
      db,
      `INSERT INTO basemap_attributes VALUES
        ('PAR', 'Paris', 'nom', 'paris', '${TEST_BASEMAP}', 5),
        ('LIL', 'Lille', 'nom', 'lille', '${TEST_BASEMAP}', 5),
        ('DIJ', 'Dijon', 'nom', 'dijon', '${TEST_BASEMAP}', 5)`
    );
    await run(db, `CREATE OR REPLACE TABLE user_place_names (geo VARCHAR)`);
    await run(
      db,
      `INSERT INTO user_place_names VALUES ('Parsi'), ('Lille'), ('Dijon')`
    );

    const Duck = makeDuckClient(db);
    const quality = await computeJoinStats(
      makeDataset('user_place_names'),
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck
    );

    const typo = quality.joinMappings.find((e) => e.dataValue === 'Parsi');
    expect(typo).toBeDefined();
    expect(typo!.candidates![0].name).toBe('Paris');
  });

  it('matches reordered names via word-sorted comparison (Korea, North → North Korea)', async () => {
    await run(
      db,
      `INSERT INTO basemap_attributes VALUES
        ('KP', 'Corée du Nord', 'name_fren', 'coree du nord', '${TEST_BASEMAP}', 5),
        ('KP', 'North Korea', 'name_engl', 'north korea', '${TEST_BASEMAP}', 5),
        ('KR', 'Corée du Sud', 'name_fren', 'coree du sud', '${TEST_BASEMAP}', 5),
        ('KR', 'Korea, Rep.', 'name_engl', 'korea rep', '${TEST_BASEMAP}', 5)`
    );
    await run(db, `CREATE OR REPLACE TABLE user_kp (geo VARCHAR)`);
    await run(db, `INSERT INTO user_kp VALUES ('Korea, North'), ('Lyon')`);

    const Duck = makeDuckClient(db);
    const quality = await computeJoinStats(
      makeDataset('user_kp'),
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck
    );

    // Prefix-weighted Jaro-Winkler alone prefers 'Korea, Rep.' (South Korea);
    // the word-sorted comparison must rank 'North Korea' (KP) first instead.
    const north = quality.joinMappings.find(
      (e) => e.dataValue === 'Korea, North'
    );
    expect(north).toBeDefined();
    expect(north!.candidates![0]).toMatchObject({
      id: 'KP',
      name: 'North Korea'
    });
    expect(north!.candidates![0].score).toBeGreaterThan(0.95);
    expect(north!.candidates![0].score).toBeLessThan(1);
  });

  it('excludes ignored values from the finalized join', async () => {
    await run(db, `CREATE OR REPLACE TABLE user_ignore (geo VARCHAR)`);
    await run(db, `INSERT INTO user_ignore VALUES ('Lyon'), ('69123')`);

    const Duck = makeDuckClient(db);
    const dataset = makeDataset('user_ignore', [
      { name: 'geo', type_simple: DuckDBSimplifiedType.STRING }
    ]);
    await finalizeJoin(dataset, FAKE_BASEMAP_METADATA, 'geo', Duck, {
      excludedValues: ['Lyon']
    });

    const rows = (await Duck.query(
      `SELECT geo, "${JOINED_BASEMAP_COLUMN.ID}" AS id FROM user_ignore ORDER BY geo`,
      { format: 'array' }
    )) as Array<{ geo: string; id: string | null }>;

    expect(rows.find((r) => r.geo === 'Lyon')!.id).toBeNull();
    expect(rows.find((r) => r.geo === '69123')!.id).toBe('LY_01');
  });

  it('keeps realistic typos as suggestions but drops distinct-place noise (cutoff 0.9)', async () => {
    await run(
      db,
      `INSERT INTO basemap_attributes VALUES
        ('TLS', 'Toulouse', 'nom', 'toulouse', '${TEST_BASEMAP}', 5),
        ('IRN', 'Iran', 'nom', 'iran', '${TEST_BASEMAP}', 5),
        ('FRA', 'France', 'nom', 'france', '${TEST_BASEMAP}', 5)`
    );
    await run(db, `CREATE OR REPLACE TABLE user_noise (geo VARCHAR)`);
    await run(
      db,
      `INSERT INTO user_noise VALUES ('Frnace'), ('Toulon'), ('Irak')`
    );

    const Duck = makeDuckClient(db);
    const quality = await computeJoinStats(
      makeDataset('user_noise'),
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck
    );

    // Realistic typo (JW ~0.96): must keep its suggestion
    const typo = quality.joinMappings.find((e) => e.dataValue === 'Frnace');
    expect(typo).toBeDefined();
    expect(typo!.candidates![0].name).toBe('France');

    // Distinct real places (toulon/toulouse 0.89, irak/iran 0.88): noise,
    // must stay unrecognized instead of carrying a misleading suggestion
    for (const noise of ['Toulon', 'Irak']) {
      expect(quality.unrecognizedEntities).toContain(noise);
      expect(quality.joinMappings.some((e) => e.dataValue === noise)).toBe(
        false
      );
    }
  });

  it('builds the similarity cache once across computeJoinStats then finalizeJoin', async () => {
    await run(db, `CREATE OR REPLACE TABLE user_data5 (geo VARCHAR)`);
    await run(db, `INSERT INTO user_data5 VALUES ('Lyon'), ('69123')`);

    const baseDuck = makeDuckClient(db);
    const querySpy = vi.fn(baseDuck.query);
    const Duck: DuckDBClientForJoin = { query: querySpy };
    const dataset = makeDataset('user_data5', [
      { name: 'geo', type_simple: DuckDBSimplifiedType.STRING }
    ]);

    const quality = await computeJoinStats(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck
    );
    await finalizeJoin(dataset, FAKE_BASEMAP_METADATA, 'geo', Duck);

    const cacheBuildCount = querySpy.mock.calls.filter(([sql]) => {
      return (
        typeof sql === 'string' &&
        sql.includes('CREATE OR REPLACE TEMP TABLE') &&
        sql.includes('__similarity_cache__')
      );
    }).length;
    expect(cacheBuildCount).toBe(1);

    const joined = (await Duck.query(
      `SELECT geo, "${JOINED_BASEMAP_COLUMN.ID}" AS id FROM user_data5 ORDER BY geo`,
      { format: 'array' }
    )) as Array<{ geo: string; id: string | null }>;
    expect(joined.every((row) => row.id === 'LY_01')).toBe(true);
    expect(quality.joinedCount).toBe(2);
  });

  it('builds the similarity cache only once for concurrent synthesis requests', async () => {
    await run(db, `CREATE OR REPLACE TABLE user_data3 (geo VARCHAR)`);
    await run(
      db,
      `INSERT INTO user_data3 VALUES ('Sainte-Colombe'), ('Saint-Colombe'), ('Lyon')`
    );

    const baseDuck = makeDuckClient(db);
    const querySpy = vi.fn(baseDuck.query);
    const Duck: DuckDBClientForJoin = {
      ...baseDuck,
      query: querySpy
    };
    const dataset = makeDataset('user_data3');

    const [first, second, third] = await Promise.all([
      computeJoinSynthesis(dataset, 'geo', Duck),
      computeJoinSynthesis(dataset, 'geo', Duck),
      computeJoinSynthesis(dataset, 'geo', Duck)
    ]);

    expect(second).toEqual(first);
    expect(third).toEqual(first);

    const cacheBuildCount = querySpy.mock.calls.filter(([sql]) => {
      return (
        typeof sql === 'string' &&
        sql.includes('CREATE OR REPLACE TEMP TABLE') &&
        sql.includes('__similarity_cache__')
      );
    }).length;

    expect(cacheBuildCount).toBe(1);
  });

  it('keeps exact SQL totals when the returned bucket lists are capped', async () => {
    await run(db, `CREATE OR REPLACE TABLE user_caps (geo VARCHAR)`);
    await run(
      db,
      `INSERT INTO user_caps
       SELECT 'zz_' || lpad(i::VARCHAR, 4, '0') FROM generate_series(1, 510) t(i)`
    );
    await run(db, `INSERT INTO user_caps VALUES ('Lyon')`);

    const Duck = makeDuckClient(db);
    const quality = await computeJoinStats(
      makeDataset('user_caps'),
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck
    );

    expect(quality.joinedCount).toBe(1);
    expect(quality.unrecognizedCount).toBe(510);
    expect(quality.unrecognizedEntities).toHaveLength(
      MAX_JOIN_BUCKET_LIST_VALUES
    );
    expect(quality.totalEntities).toBe(511);
  });

  it('paginates the joined bucket in stable order and honors exclusions', async () => {
    await run(db, `CREATE OR REPLACE TABLE user_page (geo VARCHAR)`);
    await run(
      db,
      `INSERT INTO user_page VALUES ('Lyon'), ('69123'), ('01234'), ('56789'), ('11111')`
    );

    const Duck = makeDuckClient(db);
    const dataset = makeDataset('user_page');
    const quality = await computeJoinStats(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck
    );
    expect(quality.joinedCount).toBe(5);

    const firstPage = await getJoinedEntitiesPage(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck,
      { offset: 0, limit: 2 }
    );
    const secondPage = await getJoinedEntitiesPage(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck,
      { offset: 2, limit: 2 }
    );
    expect(firstPage.map((row) => row.dataValue)).toEqual(['01234', '11111']);
    expect(secondPage.map((row) => row.dataValue)).toEqual(['56789', '69123']);

    const excluded = await computeJoinStats(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck,
      { excludedValues: ['Lyon'] }
    );
    expect(excluded.joinedCount).toBe(4);
    expect(excluded.totalEntities).toBe(4);

    const excludedPage = await getJoinedEntitiesPage(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck,
      { offset: 0, limit: 10, excludedValues: ['Lyon'] }
    );
    expect(excludedPage.map((row) => row.dataValue)).not.toContain('Lyon');

    const joinedValues = await getJoinedBasemapValues(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck
    );
    expect(joinedValues).toContain('Lyon');
    const joinedValuesExcluded = await getJoinedBasemapValues(
      dataset,
      FAKE_BASEMAP_METADATA,
      'geo',
      Duck,
      { excludedValues: ['Lyon', '69123'] }
    );
    expect(joinedValuesExcluded).not.toContain('Lyon');
  });
});
