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
    it('should detect .shp as geospatial', () => {
      expect(isGeospatialFile('test.shp')).toBe(true);
    });

    it('should detect .gpkg as geospatial', () => {
      expect(isGeospatialFile('test.gpkg')).toBe(true);
    });

    it('should detect .kml as geospatial', () => {
      expect(isGeospatialFile('test.kml')).toBe(true);
    });

    it('should detect .kmz as geospatial', () => {
      expect(isGeospatialFile('test.kmz')).toBe(true);
    });

    it('should detect .gpx as geospatial', () => {
      expect(isGeospatialFile('test.gpx')).toBe(true);
    });

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

describe('Format Detection - PIPELINE_CONST', () => {
  describe('EXTENSIONS', () => {
    it('should include all tabular extensions', () => {
      expect(PIPELINE_CONST.EXTENSIONS.TABULAR).toContain('.csv');
      expect(PIPELINE_CONST.EXTENSIONS.TABULAR).toContain('.tsv');
      expect(PIPELINE_CONST.EXTENSIONS.TABULAR).toContain('.txt');
    });

    it('should include all geospatial extensions', () => {
      expect(PIPELINE_CONST.EXTENSIONS.GEO).toContain('.geojson');
      expect(PIPELINE_CONST.EXTENSIONS.GEO).toContain('.shp');
      expect(PIPELINE_CONST.EXTENSIONS.GEO).toContain('.gpkg');
      expect(PIPELINE_CONST.EXTENSIONS.GEO).toContain('.kml');
      expect(PIPELINE_CONST.EXTENSIONS.GEO).toContain('.kmz');
      expect(PIPELINE_CONST.EXTENSIONS.GEO).toContain('.gpx');
    });

    it('should include ZIP extensions', () => {
      expect(PIPELINE_CONST.EXTENSIONS.ZIP).toContain('.zip');
    });

    it('should have ALL as union of all categories', () => {
      const all = PIPELINE_CONST.EXTENSIONS.ALL;
      expect(all).toContain('.csv');
      expect(all).toContain('.geojson');
      expect(all).toContain('.zip');
    });
  });

  describe('LIMITS', () => {
    it('should have MAX_FILE_SIZE of 100MB', () => {
      expect(PIPELINE_CONST.LIMITS.MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
    });

    it('should have WARNING_FILE_SIZE of 50MB', () => {
      expect(PIPELINE_CONST.LIMITS.WARNING_FILE_SIZE).toBe(50 * 1024 * 1024);
    });
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
