import { join } from 'node:path';
import type { BasemapMetadata } from '$lib/features/map/types/basemap.types';
import { JoinStatus } from '$lib/features/commons/constants/ui.constants';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  type TestDuckDB
} from '../../data-pipeline/__tests__/duckdb-node-helper';
import { join_macros } from '../macros/join';
import { FileType, type AnalysisResult, type DuckDBDataset } from '../types';
import {
  applyJoinCorrections,
  computeJoinStats,
  finalizeJoin,
  type DuckDBClientForJoin
} from './join-ops';

const FOSSIL_CSV_PATH = join(
  process.cwd(),
  'tests-datasets/csv/fossil-fuel-subsidies-gdp-2021.csv'
);

const TEST_BASEMAP: BasemapMetadata = {
  file: 'test-basemap.parquet',
  title: 'Test Basemap',
  description: 'Test basemap for join validation',
  source: 'tests',
  date: '2026',
  bbox: [-180, -90, 180, 90],
  projection: 'EPSG:4326',
  layers: []
};

function createDataset(tableName: string): DuckDBDataset {
  return {
    id: 'dataset-join-test',
    tableName,
    sourceFileId: 'source-file-test',
    name: 'Join test dataset',
    columns: [{ name: 'country', type_simple: 'string' } as AnalysisResult],
    rowCount: 6,
    metadata: {
      processedAt: new Date(),
      fileType: FileType.CSV
    }
  };
}

function createNodeDuckClient(db: TestDuckDB): DuckDBClientForJoin {
  return {
    async query(sql: string): Promise<unknown> {
      return query(db, sql);
    },
    async join_by_id(): Promise<unknown> {
      throw new Error('join_by_id not used in this test setup');
    },
    async apply_join_association(): Promise<unknown> {
      throw new Error('apply_join_association not used in this test setup');
    }
  };
}

async function loadJoinMacros(db: TestDuckDB): Promise<void> {
  const macroStatements = join_macros
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of macroStatements) {
    await db.connection.run(`${statement};`);
  }
}

async function seedJoinFixture(db: TestDuckDB): Promise<void> {
  const escapedCsvPath = FOSSIL_CSV_PATH.replace(/'/g, "''");

  await db.connection.run('DROP TABLE IF EXISTS source_join_cases');
  await db.connection.run('DROP TABLE IF EXISTS basemap_attributes');

  await db.connection.run(`
    CREATE TABLE source_join_cases AS
    WITH source_rows AS (
      SELECT Entity AS country
      FROM read_csv('${escapedCsvPath}', header = true)
      WHERE Entity IN ('Algeria', 'Angola', 'Argentina', 'Armenia', 'Australia')
    )
    SELECT country FROM source_rows
    UNION ALL
    SELECT 'Algeria' AS country
  `);

  await db.connection.run(`
    CREATE TABLE basemap_attributes (
      raw VARCHAR,
      id VARCHAR,
      variant VARCHAR,
      normalized VARCHAR,
      basemap VARCHAR,
      basemap_count BIGINT
    )
  `);

  await db.connection.run(`
    INSERT INTO basemap_attributes
    SELECT raw, id, variant, normalize_text_join(raw), 'test-basemap', 5
    FROM (
      VALUES
        ('Algeria', 'DZA', 'name'),
        ('Angola', 'AGO', 'name'),
        ('Argentina', 'ARG', 'name'),
        ('ARGENTINA', 'ARG_ALT', 'alt'),
        ('Armenie', 'ARM', 'name')
    ) AS rows(raw, id, variant)
  `);
}

describe('join-ops integration with test datasets', () => {
  let db: TestDuckDB;
  let duckClient: DuckDBClientForJoin;

  beforeAll(async () => {
    db = await createTestInstance();
    await loadJoinMacros(db);
    duckClient = createNodeDuckClient(db);
  });

  beforeEach(async () => {
    await seedJoinFixture(db);
  });

  afterAll(async () => {
    await destroyTestInstance(db);
  });

  it('classifies joined, to-verify, duplicate and unrecognized entities', async () => {
    const stats = await computeJoinStats(
      createDataset('source_join_cases'),
      TEST_BASEMAP,
      'country',
      duckClient
    );

    expect(stats.totalEntities).toBe(5);
    expect(stats.joinedCount).toBe(1);
    expect(stats.toVerifyCount).toBe(2);
    expect(stats.duplicateCount).toBe(1);
    expect(stats.unrecognizedCount).toBe(1);

    const statuses = new Map(
      stats.entities.map((entity) => [entity.dataValue, entity.status])
    );

    expect(statuses.get('Algeria')).toBe(JoinStatus.DUPLICATE);
    expect(statuses.get('Angola')).toBe(JoinStatus.JOINED);
    expect(statuses.get('Argentina')).toBe(JoinStatus.TO_VERIFY);
    expect(statuses.get('Armenia')).toBe(JoinStatus.TO_VERIFY);
    expect(statuses.get('Australia')).toBe(JoinStatus.UNRECOGNIZED);
  });

  it('applies corrections and improves join quality', async () => {
    await applyJoinCorrections(
      createDataset('source_join_cases'),
      'country',
      { Armenia: 'Armenie' },
      duckClient
    );

    const correctedRows = await query(
      db,
      `SELECT country, COUNT(*) as cnt
       FROM source_join_cases
       GROUP BY country
       ORDER BY country`
    );

    const correctedMap = new Map(
      correctedRows.map((row) => [String(row.country), Number(row.cnt)])
    );

    expect(correctedMap.get('Armenia')).toBeUndefined();
    expect(correctedMap.get('Armenie')).toBe(1);

    const stats = await computeJoinStats(
      createDataset('source_join_cases'),
      TEST_BASEMAP,
      'country',
      duckClient
    );

    expect(stats.joinedCount).toBe(2);
    expect(stats.toVerifyCount).toBe(1);
    expect(stats.duplicateCount).toBe(1);
    expect(stats.unrecognizedCount).toBe(1);
  });
});

describe('finalizeJoin behavior', () => {
  const dataset: DuckDBDataset = {
    id: 'dataset-finalize-test',
    tableName: 'dataset_table',
    sourceFileId: 'source-file-finalize',
    name: 'Finalize dataset',
    columns: [
      { name: 'country', type_simple: 'string' } as AnalysisResult,
      { name: 'lat', type_simple: 'numeric' } as AnalysisResult,
      { name: 'lon', type_simple: 'numeric' } as AnalysisResult
    ],
    rowCount: 10,
    metadata: {
      processedAt: new Date(),
      fileType: FileType.CSV
    },
    gpsMode: true,
    gpsColumns: { lat: 'lat', lon: 'lon' }
  };

  it('recomputes join results even when a previous join table exists', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (sql.includes('information_schema.tables')) {
        return [{ table_name: 'dataset_table_join_results' }];
      }
      if (sql.includes('COUNT(*) as cnt')) {
        return [{ cnt: 4 }];
      }
      return [];
    });
    const joinByIdMock = vi.fn(async () => []);
    const applyJoinAssociationMock = vi.fn(async () => []);

    const duckClient: DuckDBClientForJoin = {
      query: queryMock,
      join_by_id: joinByIdMock,
      apply_join_association: applyJoinAssociationMock
    };

    const result = await finalizeJoin(
      dataset,
      TEST_BASEMAP,
      'country',
      duckClient
    );

    expect(joinByIdMock).toHaveBeenCalledTimes(1);
    expect(applyJoinAssociationMock).toHaveBeenCalledWith(
      'dataset_table',
      'test-basemap'
    );
    expect(result).toEqual({
      joinedBasemap: 'test-basemap.parquet',
      geoColumn: 'country',
      gpsMode: false,
      gpsColumns: undefined
    });
  });

  it('forces join recomputation when skipJoinComputation is set but join table is missing', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (
        sql.includes('information_schema.tables') &&
        sql.includes('dataset_table_join_results')
      ) {
        return [];
      }
      if (
        sql.includes('information_schema.tables') &&
        sql.includes("table_name = 'basemap_attributes'")
      ) {
        return [{ table_name: 'basemap_attributes' }];
      }
      if (sql.includes('COUNT(*) as cnt')) {
        return [{ cnt: 2 }];
      }
      return [];
    });
    const joinByIdMock = vi.fn(async () => []);
    const applyJoinAssociationMock = vi.fn(async () => []);

    const duckClient: DuckDBClientForJoin = {
      query: queryMock,
      join_by_id: joinByIdMock,
      apply_join_association: applyJoinAssociationMock
    };

    await finalizeJoin(dataset, TEST_BASEMAP, 'country', duckClient, {
      skipJoinComputation: true
    });

    expect(joinByIdMock).toHaveBeenCalledTimes(1);
    expect(applyJoinAssociationMock).toHaveBeenCalledTimes(1);
  });

  it('finalizes OSM joins in GPS mode without running geocoding joins', async () => {
    const queryMock = vi.fn(async () => []);
    const joinByIdMock = vi.fn(async () => []);
    const applyJoinAssociationMock = vi.fn(async () => []);

    const duckClient: DuckDBClientForJoin = {
      query: queryMock,
      join_by_id: joinByIdMock,
      apply_join_association: applyJoinAssociationMock
    };

    const osmBasemap: BasemapMetadata = {
      ...TEST_BASEMAP,
      file: 'osm_carto_123'
    };

    const result = await finalizeJoin(dataset, osmBasemap, '', duckClient);

    expect(result).toEqual({
      joinedBasemap: 'osm_carto_123',
      gpsMode: true,
      gpsColumns: { lat: 'lat', lon: 'lon' }
    });
    expect(joinByIdMock).not.toHaveBeenCalled();
    expect(applyJoinAssociationMock).not.toHaveBeenCalled();
  });
});
