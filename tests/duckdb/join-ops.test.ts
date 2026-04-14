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

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    initialize: vi.fn(),
    ensureAttributesLoaded: vi.fn(),
    loadGeometryIntoDuckDB: vi.fn()
  }
}));

vi.mock('$lib/features/map/utils/read-geojson-arrow', () => ({
  addGeoArrowMetadata: <T>(table: T) => table
}));

import {
  createTestInstance,
  destroyTestInstance,
  query,
  type TestDuckDB
} from '../pipeline/duckdb-node-helper';
import { join_macros } from '$lib/features/duckdb/macros/join';
import {
  FileType,
  type AnalysisResult,
  type DuckDBDataset
} from '$lib/features/duckdb/types';
import {
  applyJoinCorrections,
  computeJoinSynthesis,
  computeJoinStats,
  finalizeJoin,
  getJoinedArrowTable,
  type DuckDBClientForJoin
} from '$lib/features/duckdb/orchestrator/join-ops';

const FOSSIL_CSV_PATH = join(
  process.cwd(),
  'static/tests-datasets/csv/fossil-fuel-subsidies-gdp-2021.csv'
);

const TEST_BASEMAP: BasemapMetadata = {
  file: 'test-basemap.parquet',
  title_fr: 'Test Basemap',
  title_en: 'Test Basemap',
  source: 'tests',
  date: '2026',
  bbox: [-180, -90, 180, 90],
  proj_source: 'EPSG:4326',
  proj_to: { type: 'identity' },
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

  it('includes partial matches in join synthesis scores', async () => {
    const synthesis = await computeJoinSynthesis(
      createDataset('source_join_cases'),
      'country',
      duckClient
    );

    expect(synthesis).toEqual([
      {
        basemap: 'test-basemap',
        shareBasemap: 0.8,
        shareCandidate: 80
      }
    ]);
  });

  it('finalizes joins from cached similarity without associating toofar matches', async () => {
    await db.connection.run('DROP TABLE IF EXISTS finalize_source_cases');
    await db.connection.run(`
      CREATE TABLE finalize_source_cases AS
      SELECT * FROM (
        VALUES
          ('Angola'),
          ('Armenia'),
          ('Australia')
      ) AS rows(country)
    `);

    const result = await finalizeJoin(
      {
        ...createDataset('finalize_source_cases'),
        rowCount: 3
      },
      TEST_BASEMAP,
      'country',
      duckClient
    );

    const rows = await query(
      db,
      `SELECT country, basemap_id, basemap_label, typo_match
       FROM finalize_source_cases
       ORDER BY country`
    );

    expect(result).toEqual({
      joinedBasemap: 'test-basemap.parquet',
      geoColumn: 'country',
      gpsMode: false,
      gpsColumns: undefined
    });
    expect(rows).toEqual([
      {
        country: 'Angola',
        basemap_id: 'AGO',
        basemap_label: 'Angola',
        typo_match: 'exact'
      },
      {
        country: 'Armenia',
        basemap_id: 'ARM',
        basemap_label: 'Armenie',
        typo_match: 'partial'
      },
      {
        country: 'Australia',
        basemap_id: null,
        basemap_label: null,
        typo_match: null
      }
    ]);
  });

  it('preserves stable match_id as basemap_id and exposes raw value as basemap_label', async () => {
    await db.connection.run('DROP TABLE IF EXISTS finalize_broken_id_cases');
    await db.connection.run(`
      CREATE TABLE finalize_broken_id_cases AS
      SELECT * FROM (
        VALUES
          ('Germany'),
          ('France')
      ) AS rows(country)
    `);

    await db.connection.run('DELETE FROM basemap_attributes');
    await db.connection.run(`
      INSERT INTO basemap_attributes
      SELECT raw, id, variant, normalize_text_join(raw), 'test-basemap', 2
      FROM (
        VALUES
          ('DEU', 'DEU', 'iso3_code'),
          ('Germany', 'iso3_code', 'name_engl'),
          ('FRA', 'FRA', 'iso3_code'),
          ('France', 'iso3_code', 'name_engl')
      ) AS rows(raw, id, variant)
    `);

    await finalizeJoin(
      {
        ...createDataset('finalize_broken_id_cases'),
        rowCount: 2
      },
      TEST_BASEMAP,
      'country',
      duckClient
    );

    const rows = await query(
      db,
      `SELECT country, basemap_id, basemap_label, typo_match
       FROM finalize_broken_id_cases
       ORDER BY country`
    );

    expect(rows).toEqual([
      {
        country: 'France',
        basemap_id: 'iso3_code',
        basemap_label: 'France',
        typo_match: 'exact'
      },
      {
        country: 'Germany',
        basemap_id: 'iso3_code',
        basemap_label: 'Germany',
        typo_match: 'exact'
      }
    ]);
  });

  it('exports joined DuckDB geometry without forcing ST_AsWKB', async () => {
    const issuedSql: string[] = [];

    const duckClientWithCapture: DuckDBClientForJoin = {
      async query(sql: string): Promise<unknown> {
        issuedSql.push(sql);
        if (sql.includes('information_schema.columns')) {
          return [
            { column_name: 'iso3', data_type: 'VARCHAR' },
            { column_name: 'geom', data_type: 'GEOMETRY' }
          ];
        }
        return [];
      },
      async join_by_id(): Promise<unknown> {
        throw new Error('join_by_id not used in this test setup');
      },
      async apply_join_association(): Promise<unknown> {
        throw new Error('apply_join_association not used in this test setup');
      }
    };

    await getJoinedArrowTable(
      'source_join_cases',
      TEST_BASEMAP.file,
      duckClientWithCapture,
      async () => 'basemap_geometry',
      async () =>
        ({
          numRows: 0,
          schema: { metadata: new Map<string, string>() }
        }) as never
    );

    const createViewSql = issuedSql.find((sql) =>
      sql.includes('CREATE OR REPLACE VIEW')
    );

    expect(createViewSql).toContain('SELECT d.*, gu._geom_value AS geometry');
    expect(createViewSql).not.toContain('ST_AsWKB(gu._geom_value)');
  });

  it('keeps native GeoArrow geometry untouched when the basemap table is not a DuckDB GEOMETRY column', async () => {
    const issuedSql: string[] = [];

    const duckClientWithCapture: DuckDBClientForJoin = {
      async query(sql: string): Promise<unknown> {
        issuedSql.push(sql);
        if (sql.includes('information_schema.columns')) {
          return [
            { column_name: 'iso3', data_type: 'VARCHAR' },
            {
              column_name: 'geom',
              data_type: 'STRUCT(x DOUBLE, y DOUBLE)[][][]'
            }
          ];
        }
        return [];
      },
      async join_by_id(): Promise<unknown> {
        throw new Error('join_by_id not used in this test setup');
      },
      async apply_join_association(): Promise<unknown> {
        throw new Error('apply_join_association not used in this test setup');
      }
    };

    await getJoinedArrowTable(
      'source_join_cases',
      TEST_BASEMAP.file,
      duckClientWithCapture,
      async () => 'basemap_geometry',
      async () =>
        ({
          numRows: 0,
          schema: { metadata: new Map<string, string>() }
        }) as never
    );

    const createViewSql = issuedSql.find((sql) =>
      sql.includes('CREATE OR REPLACE VIEW')
    );

    expect(createViewSql).toContain('SELECT d.*, gu._geom_value AS geometry');
    expect(createViewSql).not.toContain('ST_AsWKB(gu._geom_value)');
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

  it('uses cached similarity finalization and does not call legacy join operations', async () => {
    const queryMock = vi.fn(async (sql: string) => {
      if (
        sql.includes('information_schema.tables') &&
        sql.includes("table_name = 'basemap_attributes'")
      ) {
        return [{ table_name: 'basemap_attributes' }];
      }
      if (sql.includes('COUNT(*) as cnt')) {
        return [{ cnt: 4 }];
      }
      if (sql.includes('information_schema.columns')) {
        return [];
      }
      if (
        sql.includes(
          'CREATE OR REPLACE TEMP TABLE "__similarity_cache__dataset_table"'
        )
      ) {
        return [];
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

    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes(
          'CREATE OR REPLACE TEMP TABLE "__similarity_cache__dataset_table"'
        )
      )
    ).toBe(true);
    expect(
      queryMock.mock.calls.some(([sql]) =>
        String(sql).includes('CREATE OR REPLACE TABLE "dataset_table" AS')
      )
    ).toBe(true);
    expect(joinByIdMock).not.toHaveBeenCalled();
    expect(applyJoinAssociationMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      joinedBasemap: 'test-basemap.parquet',
      geoColumn: 'country',
      gpsMode: false,
      gpsColumns: undefined
    });
  });

  it('fails when requested geo column does not exist in dataset', async () => {
    const queryMock = vi.fn(async () => []);
    const joinByIdMock = vi.fn(async () => []);
    const applyJoinAssociationMock = vi.fn(async () => []);

    const duckClient: DuckDBClientForJoin = {
      query: queryMock,
      join_by_id: joinByIdMock,
      apply_join_association: applyJoinAssociationMock
    };

    await expect(
      finalizeJoin(dataset, TEST_BASEMAP, 'unknown_geo_col', duckClient)
    ).rejects.toThrow("Column 'unknown_geo_col' not found in dataset");

    expect(queryMock).not.toHaveBeenCalled();
    expect(joinByIdMock).not.toHaveBeenCalled();
    expect(applyJoinAssociationMock).not.toHaveBeenCalled();
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

  it('fails OSM finalize when GPS columns are missing', async () => {
    const datasetWithoutGps: DuckDBDataset = {
      ...dataset,
      columns: [{ name: 'country', type_simple: 'string' } as AnalysisResult]
    };
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

    await expect(
      finalizeJoin(datasetWithoutGps, osmBasemap, '', duckClient)
    ).rejects.toThrow('GPS columns (latitude/longitude) not found in dataset');

    expect(queryMock).not.toHaveBeenCalled();
    expect(joinByIdMock).not.toHaveBeenCalled();
    expect(applyJoinAssociationMock).not.toHaveBeenCalled();
  });
});
