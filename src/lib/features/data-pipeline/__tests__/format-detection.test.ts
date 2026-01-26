import { describe, expect, it } from 'vitest';
import { isGeospatialFile, isParquetFile, PIPELINE_CONST } from '../constants';
import {
  CSV_TEST_FILES,
  GEOJSON_TEST_FILES,
  ZIP_TEST_FILES,
  loadTestFile
} from './test-file-loader';

describe('Format Detection - isGeospatialFile', () => {
  describe('CSV files', () => {
    it('should NOT detect CSV files as geospatial', () => {
      Object.values(CSV_TEST_FILES.VALID).forEach((path) => {
        const file = loadTestFile(path);
        expect(isGeospatialFile(file.name)).toBe(false);
      });
    });

    it('should NOT detect malformed CSV files as geospatial', () => {
      Object.values(CSV_TEST_FILES.MALFORMED).forEach((path) => {
        const file = loadTestFile(path);
        expect(isGeospatialFile(file.name)).toBe(false);
      });
    });
  });

  describe('GeoJSON files', () => {
    it('should detect GeoJSON files as geospatial', () => {
      Object.values(GEOJSON_TEST_FILES).forEach((path) => {
        const file = loadTestFile(path);
        expect(isGeospatialFile(file.name)).toBe(true);
      });
    });
  });

  describe('Other geospatial extensions', () => {
    it('should NOT detect .geoparquet as geospatial (it is parquet)', () => {
      expect(isGeospatialFile('test.geoparquet')).toBe(false);
      expect(isParquetFile('test.geoparquet')).toBe(true);
    });
  });

  describe('ZIP files', () => {
    it('should NOT detect ZIP files as geospatial', () => {
      Object.values(ZIP_TEST_FILES).forEach((path) => {
        const file = loadTestFile(path);
        expect(isGeospatialFile(file.name)).toBe(false);
      });
    });
  });
});

describe('Format Detection - isParquetFile', () => {
  it('should detect .parquet files', () => {
    expect(isParquetFile('data.parquet')).toBe(true);
  });

  it('should detect .geoparquet files', () => {
    expect(isParquetFile('data.geoparquet')).toBe(true);
  });

  it('should NOT detect CSV files as parquet', () => {
    expect(isParquetFile('data.csv')).toBe(false);
  });

  it('should NOT detect GeoJSON files as parquet', () => {
    expect(isParquetFile('data.geojson')).toBe(false);
  });

  it('should handle case-insensitive detection', () => {
    expect(isParquetFile('DATA.PARQUET')).toBe(true);
    expect(isParquetFile('Data.GeoParquet')).toBe(true);
  });
});

describe('Format Detection - File name parsing', () => {
  it('should handle files with multiple dots', () => {
    expect(isGeospatialFile('map.data.2024.geojson')).toBe(true);
    expect(isGeospatialFile('data.backup.csv')).toBe(false);
  });

  it('should handle files with spaces', () => {
    expect(isGeospatialFile('my map data.geojson')).toBe(true);
    expect(isGeospatialFile('my data file.csv')).toBe(false);
  });

  it('should handle files with special characters', () => {
    expect(isGeospatialFile('données_géo.geojson')).toBe(true);
    expect(isGeospatialFile('données.csv')).toBe(false);
  });

  it('should be case insensitive', () => {
    expect(isGeospatialFile('MAP.GEOJSON')).toBe(true);
    expect(isGeospatialFile('Map.GeoJSON')).toBe(true);
    expect(isGeospatialFile('data.CSV')).toBe(false);
  });
});
