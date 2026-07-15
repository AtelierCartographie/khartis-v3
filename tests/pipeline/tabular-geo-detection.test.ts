import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import path from 'node:path';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import type { DatasetResult } from '$lib/features/data-pipeline/types';
import {
  createTestInstance,
  destroyTestInstance,
  query,
  run,
  type TestDuckDB
} from './duckdb-node-helper';

const { duckQueryMock, initDuckDBMock, processFileInternalMock } = vi.hoisted(
  () => ({
    duckQueryMock: vi.fn(),
    initDuckDBMock: vi.fn(),
    processFileInternalMock: vi.fn()
  })
);

vi.mock('$lib/features/duckdb', () => ({
  Duck: { query: duckQueryMock },
  initDuckDB: initDuckDBMock
}));

vi.mock('$lib/features/data-pipeline/processors', () => ({
  processFileInternal: processFileInternalMock,
  createFileFromUpload: vi.fn(),
  createCompanionFilesFromUpload: vi.fn(),
  createFileFromUploadContent: vi.fn(),
  processRemoteFile: vi.fn(),
  processRemoteZipFile: vi.fn()
}));

import { applyTabularGeoDetection } from '$lib/features/data-pipeline/processors/tabular-geo-detection';
import { dataPipeline } from '$lib/features/data-pipeline/pipeline';

const FIXTURES_ROOT = path.resolve(
  __dirname,
  '../../static/tests-datasets/csv'
);

let db: TestDuckDB;

async function loadFixtureAsTable(
  fixtureName: string,
  tableName: string
): Promise<void> {
  const file = path.join(FIXTURES_ROOT, fixtureName).replace(/'/g, "''");
  await run(
    db,
    `CREATE OR REPLACE TABLE "${tableName}" AS FROM read_csv('${file}', header=true, delim=';')`
  );
}

async function describeDatasetColumns(
  tableName: string
): Promise<DatasetResult['columns']> {
  const rows = await query(db, `DESCRIBE "${tableName}"`);
  return rows.map((row) => ({
    name: String(row.column_name),
    values: [],
    type: /INT|DOUBLE|FLOAT|DECIMAL|BIGINT/i.test(String(row.column_type))
      ? 'numeric'
      : 'text',
    stats: {
      name: String(row.column_name),
      type: 'text',
      count: 0,
      nulls: 0,
      uniques: 0
    }
  })) as DatasetResult['columns'];
}

function makeDataset(
  tableName: string,
  columns: DatasetResult['columns']
): DatasetResult {
  return {
    id: `dataset-${tableName}`,
    name: `${tableName}.csv`,
    sourceFileId: `${tableName}.csv`,
    tableName,
    columns,
    rowCount: 5,
    metadata: { processedAt: new Date(), fileType: 'csv', parserUsed: 'DuckDB' }
  };
}

function geoColumnTypes(detection: GeoDetectionResult | undefined): string[] {
  return (detection?.geoColumns ?? []).map((column) => String(column.type));
}

beforeAll(async () => {
  db = await createTestInstance();
});

afterAll(async () => {
  await destroyTestInstance(db);
});

describe('applyTabularGeoDetection — DuckDB-table detection (F5/F6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    duckQueryMock.mockImplementation(async (sql: string) => query(db, sql));
  });

  it('detects custom-named GPS columns from the seveso fixture through the name hint', async () => {
    await loadFixtureAsTable(
      'sites-seveso-idf-custom-gps-columns.csv',
      'seveso_custom'
    );
    const columns = await describeDatasetColumns('seveso_custom');
    const dataset = makeDataset('seveso_custom', columns);

    await applyTabularGeoDetection(dataset);

    expect(dataset.geoDetection?.hasGeoColumns).toBe(true);
    const types = geoColumnTypes(dataset.geoDetection);
    expect(types).toContain('latitude');
    expect(types).toContain('longitude');
  });

  it('detects gcpnt_lat/gcpnt_lon GPS columns from the gcpnt fixture', async () => {
    await loadFixtureAsTable('tabular-gps-gcpnt-columns.csv', 'gcpnt_table');
    const columns = await describeDatasetColumns('gcpnt_table');
    const dataset = makeDataset('gcpnt_table', columns);

    await applyTabularGeoDetection(dataset);

    const sampleSql = String(duckQueryMock.mock.calls[0]?.[0]);
    expect(sampleSql).toContain('"gcpnt_lat"');
    expect(sampleSql).toContain('"gcpnt_lon"');

    const types = geoColumnTypes(dataset.geoDetection);
    expect(types).toContain('latitude');
    expect(types).toContain('longitude');
  });

  it('no longer pulls numeric id/name columns into the sampled candidates', async () => {
    await run(
      db,
      `CREATE OR REPLACE TABLE ids_table AS
       SELECT * FROM (VALUES (1, 'a', 12.5), (2, 'b', 3.25)) t(zone_id, label, surface_km2)`
    );
    const columns = await describeDatasetColumns('ids_table');
    const dataset = makeDataset('ids_table', columns);

    await applyTabularGeoDetection(dataset);

    const sampleSql = String(duckQueryMock.mock.calls[0]?.[0]);
    expect(sampleSql).toContain('"label"');
    expect(sampleSql).not.toContain('"zone_id"');
    expect(sampleSql).not.toContain('"surface_km2"');
  });

  it('reaches the all-columns fallback for numeric x/y datasets without hint or text columns', async () => {
    await loadFixtureAsTable('tabular-gps-xy-columns.csv', 'xy_table');
    const columns = await describeDatasetColumns('xy_table');
    const dataset = makeDataset('xy_table', columns);

    await applyTabularGeoDetection(dataset);

    const sampleSql = String(duckQueryMock.mock.calls[0]?.[0]);
    expect(sampleSql).toContain('"x"');
    expect(sampleSql).toContain('"y"');

    const types = geoColumnTypes(dataset.geoDetection);
    expect(types).toContain('latitude');
    expect(types).toContain('longitude');
  });
});

describe('processUploadedFile — geo-detection precedence (F5)', () => {
  const tableDetection: GeoDetectionResult = {
    hasGeoColumns: true,
    geoColumns: [
      { index: 0, columnName: 'commune', type: 'city', confidence: 0.9 }
    ],
    warnings: []
  };
  const sampleDetection: GeoDetectionResult = {
    hasGeoColumns: true,
    geoColumns: [
      { index: 0, columnName: 'commune', type: 'region', confidence: 0.4 }
    ],
    warnings: []
  };

  function uploadedFilePayload() {
    return {
      id: 'upload-1',
      name: 'data.csv',
      size: 10,
      type: 'text/csv',
      deepAnalysis: {
        rowCount: 5,
        columnCount: 1,
        columns: [],
        geoDetection: sampleDetection,
        qualityIssues: [],
        performanceWarnings: [],
        suggestions: []
      }
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    initDuckDBMock.mockResolvedValue(undefined);
  });

  it('keeps the DuckDB-table detection when the sample-based deepAnalysis is also present', async () => {
    const dataset = makeDataset('precedence_table', []);
    dataset.geoDetection = tableDetection;
    processFileInternalMock.mockResolvedValue(dataset);

    const result = await dataPipeline.processUploadedFile(
      uploadedFilePayload(),
      new File(['a;b\n1;2'], 'data.csv', { type: 'text/csv' })
    );

    expect('datasets' in result).toBe(false);
    if (!('datasets' in result)) {
      expect(result.geoDetection).toBe(tableDetection);
    }
  });

  it('fills from deepAnalysis when the table detection produced nothing', async () => {
    const dataset = makeDataset('hole_table', []);
    processFileInternalMock.mockResolvedValue(dataset);

    const result = await dataPipeline.processUploadedFile(
      uploadedFilePayload(),
      new File(['a;b\n1;2'], 'data.csv', { type: 'text/csv' })
    );

    expect('datasets' in result).toBe(false);
    if (!('datasets' in result)) {
      expect(result.geoDetection).toBe(sampleDetection);
      expect(result.analysis?.hasGeoData).toBe(true);
    }
  });
});
