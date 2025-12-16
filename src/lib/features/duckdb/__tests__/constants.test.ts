import { describe, expect, it } from 'vitest';
import { CACHE_CONSTANTS, DUCK_CONST } from '../constants';

describe('DuckDB Regex Patterns', () => {
  describe('REGEX.TABULAR', () => {
    it('should match tabular files (CSV, TSV, TXT)', () => {
      expect(DUCK_CONST.REGEX.TABULAR.test('data.csv')).toBe(true);
      expect(DUCK_CONST.REGEX.TABULAR.test('data.CSV')).toBe(true);
      expect(DUCK_CONST.REGEX.TABULAR.test('data.tsv')).toBe(true);
      expect(DUCK_CONST.REGEX.TABULAR.test('data.txt')).toBe(true);
      expect(DUCK_CONST.REGEX.TABULAR.test('data.text')).toBe(true);
    });

    it('should NOT match non-tabular files', () => {
      expect(DUCK_CONST.REGEX.TABULAR.test('data.json')).toBe(false);
      expect(DUCK_CONST.REGEX.TABULAR.test('data.parquet')).toBe(false);
      expect(DUCK_CONST.REGEX.TABULAR.test('data.geojson')).toBe(false);
    });
  });

  describe('REGEX.GEO', () => {
    it('should match geospatial files', () => {
      expect(DUCK_CONST.REGEX.GEO.test('map.geojson')).toBe(true);
      expect(DUCK_CONST.REGEX.GEO.test('map.GEOJSON')).toBe(true);
      expect(DUCK_CONST.REGEX.GEO.test('data.json')).toBe(true);
      expect(DUCK_CONST.REGEX.GEO.test('map.gpkg')).toBe(true);
      expect(DUCK_CONST.REGEX.GEO.test('map.kml')).toBe(true);
      expect(DUCK_CONST.REGEX.GEO.test('map.kmz')).toBe(true);
      expect(DUCK_CONST.REGEX.GEO.test('track.gpx')).toBe(true);
    });

    it('should NOT match non-geo files', () => {
      expect(DUCK_CONST.REGEX.GEO.test('data.csv')).toBe(false);
      expect(DUCK_CONST.REGEX.GEO.test('data.parquet')).toBe(false);
    });
  });

  describe('REGEX.PARQUET', () => {
    it('should match Parquet and GeoParquet files', () => {
      expect(DUCK_CONST.REGEX.PARQUET.test('data.parquet')).toBe(true);
      expect(DUCK_CONST.REGEX.PARQUET.test('data.PARQUET')).toBe(true);
      expect(DUCK_CONST.REGEX.PARQUET.test('map.geoparquet')).toBe(true);
    });

    it('should NOT match non-parquet files', () => {
      expect(DUCK_CONST.REGEX.PARQUET.test('data.csv')).toBe(false);
      expect(DUCK_CONST.REGEX.PARQUET.test('data.arrow')).toBe(false);
    });
  });

  describe('REGEX.ARROW', () => {
    it('should match Arrow files only', () => {
      expect(DUCK_CONST.REGEX.ARROW.test('data.arrow')).toBe(true);
      expect(DUCK_CONST.REGEX.ARROW.test('data.parquet')).toBe(false);
      expect(DUCK_CONST.REGEX.ARROW.test('data.csv')).toBe(false);
    });
  });

  describe('Column Validation Patterns', () => {
    it('should validate integers correctly', () => {
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test('123')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test('0')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test('-123')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test('12.34')).toBe(false);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_INTEGER.test('abc')).toBe(false);
    });

    it('should validate doubles correctly', () => {
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('123')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('-123')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('12.34')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('-0.5')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('abc')).toBe(false);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DOUBLE.test('12.34.56')).toBe(false);
    });

    it('should validate boolean numbers (0/1)', () => {
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_NUMBER.test('0')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_NUMBER.test('1')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_NUMBER.test('2')).toBe(false);
    });

    it('should validate boolean strings (true/false)', () => {
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_STRING.test('true')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_STRING.test('false')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_STRING.test('TRUE')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_BOOLEAN_STRING.test('yes')).toBe(false);
    });

    it('should validate ISO 8601 dates with time', () => {
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DATE.test('2023-01-15T14:30:00')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DATE.test('2023-01-15T14:30:00+02:00')).toBe(true);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DATE.test('2023-01-15')).toBe(false);
      expect(DUCK_CONST.REGEX.COLUMN_VALIDATION_DATE.test('01/15/2023')).toBe(false);
    });
  });
});

describe('Cache Constants', () => {
  it('should have correct Parquet magic bytes (PAR1)', () => {
    expect(CACHE_CONSTANTS.PARQUET_MAGIC).toEqual(new Uint8Array([0x50, 0x41, 0x52, 0x31]));
    expect(String.fromCharCode(...CACHE_CONSTANTS.PARQUET_MAGIC)).toBe('PAR1');
  });
});

describe('File Type Detection Matrix', () => {
  const testCases = [
    { file: 'data.csv', tabular: true, geo: false, parquet: false, arrow: false },
    { file: 'data.tsv', tabular: true, geo: false, parquet: false, arrow: false },
    { file: 'map.geojson', tabular: false, geo: true, parquet: false, arrow: false },
    { file: 'map.gpkg', tabular: false, geo: true, parquet: false, arrow: false },
    { file: 'data.parquet', tabular: false, geo: false, parquet: true, arrow: false },
    { file: 'data.geoparquet', tabular: false, geo: false, parquet: true, arrow: false },
    { file: 'data.arrow', tabular: false, geo: false, parquet: false, arrow: true }
  ];

  for (const { file, tabular, geo, parquet, arrow } of testCases) {
    it(`should correctly categorize ${file}`, () => {
      expect(DUCK_CONST.REGEX.TABULAR.test(file)).toBe(tabular);
      expect(DUCK_CONST.REGEX.GEO.test(file)).toBe(geo);
      expect(DUCK_CONST.REGEX.PARQUET.test(file)).toBe(parquet);
      expect(DUCK_CONST.REGEX.ARROW.test(file)).toBe(arrow);
    });
  }
});
