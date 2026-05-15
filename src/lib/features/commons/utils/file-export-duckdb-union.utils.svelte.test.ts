import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessedDataset } from '$lib/features/data-pipeline';

const mocks = vi.hoisted(() => ({
  initDuckDB: vi.fn(),
  query: vi.fn(),
  copyToCsvAsString: vi.fn()
}));

vi.mock('$lib/features/duckdb', () => ({
  initDuckDB: mocks.initDuckDB,
  Duck: {
    query: mocks.query,
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
});
