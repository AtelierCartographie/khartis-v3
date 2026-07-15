import { describe, expect, it } from 'vitest';
import { normalizeToProcessedDataset } from '$lib/features/data-pipeline/utils/processed-dataset.utils';
import {
  ColumnType,
  type DatasetResult
} from '$lib/features/data-pipeline/types';

function makeDatasetResult(
  overrides: Partial<DatasetResult> = {}
): DatasetResult {
  return {
    id: 'ds1',
    name: 'test',
    tableName: 'tbl_test',
    sourceFileId: 'f1',
    format: 'csv',
    columns: [
      {
        name: 'id',
        type: ColumnType.NUMBER,
        stats: {
          name: 'id',
          type: ColumnType.NUMBER,
          count: 3,
          nulls: 0,
          uniques: 3
        }
      },
      {
        name: 'name',
        type: ColumnType.TEXT,
        stats: {
          name: 'name',
          type: ColumnType.TEXT,
          count: 3,
          nulls: 0,
          uniques: 3
        }
      }
    ],
    rowCount: 3,
    metadata: { processedAt: new Date(), fileType: 'csv', parserUsed: 'csv' },
    ...overrides
  };
}

describe('normalizeToProcessedDataset', () => {
  it('maps columns with type, nullable, and unique from stats', () => {
    const result = normalizeToProcessedDataset(makeDatasetResult());
    expect(result.columns).toHaveLength(2);
    expect(result.columns[0].name).toBe('id');
    expect(result.columns[0].type).toBe('number');
    expect(result.columns[0].unique).toBe(true);
    expect(result.columns[0].nullable).toBe(false);
  });

  it('maps known format values correctly', () => {
    for (const format of [
      'csv',
      'geojson',
      'shapefile',
      'geopackage',
      'geoparquet',
      'kml',
      'kmz'
    ] as const) {
      const result = normalizeToProcessedDataset(makeDatasetResult({ format }));
      expect(result.format).toBe(format);
    }
  });

  it('falls back to "csv" for unknown format', () => {
    const result = normalizeToProcessedDataset(
      makeDatasetResult({ format: 'unknown_xyz' as never })
    );
    expect(result.format).toBe('csv');
  });

  it('sets duckdbTableName from tableName', () => {
    const result = normalizeToProcessedDataset(makeDatasetResult());
    expect(result.duckdbTableName).toBe('tbl_test');
  });

  it('is idempotent: calling twice returns the same shape', () => {
    const once = normalizeToProcessedDataset(makeDatasetResult());
    const twice = normalizeToProcessedDataset(once);
    expect(twice.id).toBe(once.id);
    expect(twice.columns).toHaveLength(once.columns.length);
  });
});
