import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ColumnType } from '$lib/features/data-pipeline/types';

const { duckMock, geometryMock, qualityMock } = vi.hoisted(() => ({
  duckMock: {
    analyse: vi.fn(),
    get_row_count: vi.fn()
  },
  geometryMock: {
    extractGeometryInfo: vi.fn()
  },
  qualityMock: {
    computeQualityWarnings: vi.fn()
  }
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: duckMock
}));

vi.mock('$lib/features/data-pipeline/operations/geometry', () => geometryMock);
vi.mock('$lib/features/data-pipeline/operations/quality', () => qualityMock);

import {
  buildDatasetFromDuckTable,
  enrichColumns
} from '$lib/features/data-pipeline/operations/analysis';

describe('analysis operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enriches columns with normalized stats and types', () => {
    const result = enrichColumns([
      {
        name: 'value',
        type_simple: 'double',
        count: '10',
        nulls: '1',
        uniques: '9',
        mean: '2.5',
        median: '2',
        stddev: '1.2',
        share_integers: '0.2',
        share_floats: '0.8',
        share_rank_interval: '0.1',
        extent_magnitude: '10'
      }
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe(ColumnType.NUMBER);
    expect(result[0].stats.count).toBe(10);
    expect(result[0].stats.nulls).toBe(1);
    expect(result[0].stats.uniques).toBe(9);
    expect(result[0].stats.mean).toBe(2.5);
    expect(result[0].stats.median).toBe(2);
    expect(result[0].stats.stdDev).toBe(1.2);
  });

  it('maps simplified boolean types to ColumnType.BOOLEAN', () => {
    const result = enrichColumns([
      {
        name: 'published',
        type_simple: 'boolean',
        count: '3',
        nulls: '0',
        uniques: '2'
      }
    ]);

    expect(result[0].type).toBe(ColumnType.BOOLEAN);
    expect(result[0].stats.type).toBe(ColumnType.BOOLEAN);
  });

  it('builds dataset from DuckDB analysis and appends quality warnings', async () => {
    duckMock.analyse.mockResolvedValue([
      {
        name: 'id',
        type_simple: 'int',
        count: 3,
        nulls: 0,
        uniques: 3
      }
    ]);
    duckMock.get_row_count.mockResolvedValue(3);
    geometryMock.extractGeometryInfo.mockResolvedValue({
      type: 'Polygon',
      columnName: 'geom',
      bounds: [1, 2, 3, 4],
      centroid: [2, 3]
    });
    qualityMock.computeQualityWarnings.mockReturnValue(['quality-warning']);

    const dataset = await buildDatasetFromDuckTable(
      { initialized: true },
      {
        file: { name: 'file.geojson', size: 100, type: 'application/geo+json' },
        tableName: 'tbl',
        isGeoFile: true,
        format: 'geojson'
      }
    );

    expect(duckMock.analyse).toHaveBeenCalledWith('tbl', {});
    expect(duckMock.get_row_count).toHaveBeenCalledWith('tbl');
    expect(geometryMock.extractGeometryInfo).toHaveBeenCalledWith('tbl');

    expect(dataset.name).toBe('file.geojson');
    expect(dataset.tableName).toBe('tbl');
    expect(dataset.rowCount).toBe(3);
    expect(dataset.geometry?.type).toBe('Polygon');
    expect(dataset.analysis?.hasGeoData).toBe(true);
    expect(dataset.analysis?.warnings).toContain('quality-warning');
    expect(dataset.bounds).toEqual({
      minLon: 1,
      minLat: 2,
      maxLon: 3,
      maxLat: 4
    });
  });

  it('handles non-geo datasets without geometry info', async () => {
    duckMock.analyse.mockResolvedValue([
      {
        name: 'label',
        type_simple: 'varchar',
        count: 2,
        nulls: 0,
        uniques: 2
      }
    ]);
    duckMock.get_row_count.mockResolvedValue(2);
    geometryMock.extractGeometryInfo.mockResolvedValue(undefined);
    qualityMock.computeQualityWarnings.mockReturnValue([]);

    const dataset = await buildDatasetFromDuckTable(
      { initialized: true },
      {
        file: { name: 'file.csv', size: 10, type: 'text/csv' },
        tableName: 'tbl_csv',
        isGeoFile: false,
        format: 'csv'
      }
    );

    expect(dataset.geometry).toBeUndefined();
    expect(dataset.analysis?.hasGeoData).toBe(false);
    expect(dataset.analysis?.geoColumns).toEqual([]);
    expect(dataset.metadata.fileType).toBe('csv');
  });
});
