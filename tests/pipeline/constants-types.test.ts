import { describe, expect, it } from 'vitest';

import {
  PIPELINE_CONST,
  isGeospatialFile
} from '$lib/features/data-pipeline/constants';
import {
  ColumnType,
  computeCentroid,
  fromDuckDBType,
  isNumericType,
  isZipDatasetResult,
  validationFailure,
  validationSuccess,
  type DatasetResult,
  type ZipDatasetResult
} from '$lib/features/data-pipeline/types';

describe('pipeline constants and type helpers', () => {
  it('detects geospatial file extensions case-insensitively', () => {
    expect(isGeospatialFile('map.GEOJSON')).toBe(true);
    expect(isGeospatialFile('shape.shp')).toBe(true);
    expect(isGeospatialFile('table.csv')).toBe(false);
  });

  it('keeps expected extension groups', () => {
    expect(PIPELINE_CONST.EXTENSIONS.TABULAR).toContain('.csv');
    expect(PIPELINE_CONST.EXTENSIONS.GEO).toContain('.geojson');
    expect(PIPELINE_CONST.EXTENSIONS.ZIP).toContain('.zip');
  });

  it('maps DuckDB types to internal column types', () => {
    expect(fromDuckDBType('BOOLEAN')).toBe(ColumnType.BOOLEAN);
    expect(fromDuckDBType('TIMESTAMP')).toBe(ColumnType.DATE);
    expect(fromDuckDBType('INTEGER')).toBe(ColumnType.NUMBER);
    expect(fromDuckDBType('DOUBLE')).toBe(ColumnType.NUMBER);
    expect(fromDuckDBType('GEOMETRY')).toBe(ColumnType.GEOMETRY);
    expect(fromDuckDBType('VARCHAR')).toBe(ColumnType.TEXT);
  });

  it('checks numeric type helper', () => {
    expect(isNumericType(ColumnType.NUMBER)).toBe(true);
    expect(isNumericType(ColumnType.TEXT)).toBe(false);
  });

  it('computes centroid from bounds', () => {
    expect(computeCentroid([-10, -20, 30, 40])).toEqual([10, 10]);
  });

  it('builds validation helpers', () => {
    expect(validationSuccess()).toEqual({
      isValid: true,
      errors: [],
      warnings: []
    });
    expect(validationFailure(['a'], ['b'])).toEqual({
      isValid: false,
      errors: ['a'],
      warnings: ['b']
    });
  });

  it('discriminates zip dataset result', () => {
    const single = {
      id: 'd1',
      name: 'dataset',
      sourceFileId: 'f1',
      tableName: 'tbl',
      columns: [],
      rowCount: 0,
      metadata: {
        processedAt: new Date(),
        fileType: 'csv',
        parserUsed: 'duck',
        transformations: []
      }
    } as unknown as DatasetResult;

    const zip = {
      datasets: [single],
      sourceZipName: 'archive.zip',
      totalFiles: 1,
      processedFiles: 1,
      skippedFiles: []
    } satisfies ZipDatasetResult;

    expect(isZipDatasetResult(single)).toBe(false);
    expect(isZipDatasetResult(zip)).toBe(true);
  });
});
