import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessedDataset } from '$lib/features/data-pipeline';

const mocks = vi.hoisted(() => ({
  initDuckDB: vi.fn(),
  query: vi.fn(),
  describeTable: vi.fn(),
  copyToCsvAsString: vi.fn()
}));

vi.mock('$lib/features/duckdb', () => ({
  initDuckDB: mocks.initDuckDB,
  Duck: {
    query: mocks.query,
    describe_table: mocks.describeTable,
    copy_to_csv_as_string: mocks.copyToCsvAsString
  }
}));

const { exportProcessedDatasets } = await import('./file-export.utils');

function dataset(
  id: string,
  name: string,
  tableName: string,
  columns: ProcessedDataset['columns']
): ProcessedDataset {
  return {
    id,
    name,
    format: 'csv',
    data: [],
    rowCount: 0,
    columns,
    analysis: {
      columns: [],
      geoColumns: [],
      hasGeoData: false,
      rowCount: 0,
      warnings: []
    },
    duckdbTableName: tableName,
    createdAt: new Date('2026-04-30T00:00:00.000Z'),
    fileSize: 1,
    metadata: {
      processedAt: new Date('2026-04-30T00:00:00.000Z'),
      transformations: []
    }
  };
}

describe('DuckDB-backed CSV union exports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T00:00:00.000Z'));
    mocks.query.mockResolvedValue([]);
    mocks.describeTable.mockImplementation(async (tableName: string) => {
      if (tableName === 'table_a') {
        return {
          name: ['name', 'value'],
          type: ['VARCHAR', 'DOUBLE']
        };
      }

      return {
        name: ['name', 'other'],
        type: ['VARCHAR', 'VARCHAR']
      };
    });
    mocks.copyToCsvAsString.mockResolvedValue(
      'name,value,other,_source_dataset\\n'
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aligns heterogeneous dataset columns before UNION ALL', async () => {
    await exportProcessedDatasets(
      [
        dataset('dataset-a', 'Dataset A', 'table_a', [
          { name: 'name', type: 'string', nullable: false, unique: false },
          { name: 'value', type: 'number', nullable: true, unique: false }
        ]),
        dataset('dataset-b', 'Dataset B', 'table_b', [
          { name: 'name', type: 'string', nullable: false, unique: false },
          { name: 'other', type: 'string', nullable: true, unique: false }
        ])
      ],
      'csv'
    );

    const createViewQuery = String(mocks.query.mock.calls[0][0]);

    expect(createViewQuery).toContain(
      `SELECT "name", "value", NULL AS "other", 'Dataset A' as "_source_dataset" FROM "table_a"`
    );
    expect(createViewQuery).toContain(
      `SELECT "name", NULL AS "value", "other", 'Dataset B' as "_source_dataset" FROM "table_b"`
    );
    expect(createViewQuery).toContain(' UNION ALL ');
  });

  it('exports live calculated columns without joined basemap or geometry internals', async () => {
    mocks.describeTable.mockResolvedValue({
      name: [
        'name',
        'value',
        'calculated_value',
        'basemap_id',
        'basemap_label',
        'typo_match',
        'geom',
        '__id'
      ],
      type: [
        'VARCHAR',
        'DOUBLE',
        'DOUBLE',
        'VARCHAR',
        'VARCHAR',
        'BOOLEAN',
        "GEOMETRY('EPSG:4326')",
        'INTEGER'
      ]
    });

    await exportProcessedDatasets(
      [
        dataset('dataset-a', 'Dataset A', 'table_a', [
          { name: 'name', type: 'string', nullable: false, unique: false },
          { name: 'value', type: 'number', nullable: true, unique: false },
          { name: '__id', type: 'number', nullable: false, unique: true }
        ])
      ],
      'csv'
    );

    const createViewQuery = String(mocks.query.mock.calls[0][0]);

    expect(createViewQuery).toContain(
      'SELECT "name", "value", "calculated_value", "__id" FROM "table_a"'
    );
    expect(createViewQuery).not.toContain('basemap_id');
    expect(createViewQuery).not.toContain('basemap_label');
    expect(createViewQuery).not.toContain('typo_match');
    expect(createViewQuery).not.toContain('"geom"');
  });

  it('aligns calculated columns from the live schemas of multiple datasets', async () => {
    mocks.describeTable.mockImplementation(async (tableName: string) => {
      if (tableName === 'table_a') {
        return {
          name: ['name', 'calculated_a'],
          type: ['VARCHAR', 'DOUBLE']
        };
      }

      return {
        name: ['name', 'calculated_b'],
        type: ['VARCHAR', 'DOUBLE']
      };
    });

    await exportProcessedDatasets(
      [
        dataset('dataset-a', 'Dataset A', 'table_a', [
          { name: 'name', type: 'string', nullable: false, unique: false }
        ]),
        dataset('dataset-b', 'Dataset B', 'table_b', [
          { name: 'name', type: 'string', nullable: false, unique: false }
        ])
      ],
      'csv'
    );

    const createViewQuery = String(mocks.query.mock.calls[0][0]);

    expect(createViewQuery).toContain(
      `SELECT "name", "calculated_a", NULL AS "calculated_b", 'Dataset A' as "_source_dataset" FROM "table_a"`
    );
    expect(createViewQuery).toContain(
      `SELECT "name", NULL AS "calculated_a", "calculated_b", 'Dataset B' as "_source_dataset" FROM "table_b"`
    );
  });
});
