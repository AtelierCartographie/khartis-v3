import { describe, expect, it } from 'vitest';
import { DUCK_CONST } from '../constants';

describe('DUCK_CONST.REGEX patterns', () => {
  describe('PARQUET regex', () => {
    it('matches .parquet extension', () => {
      expect(DUCK_CONST.REGEX.PARQUET.test('file.parquet')).toBe(true);
    });

    it('matches .geoparquet extension', () => {
      expect(DUCK_CONST.REGEX.PARQUET.test('file.geoparquet')).toBe(true);
    });

    it('matches .gpq extension', () => {
      expect(DUCK_CONST.REGEX.PARQUET.test('file.gpq')).toBe(true);
    });

    it('matches uppercase extensions', () => {
      expect(DUCK_CONST.REGEX.PARQUET.test('file.PARQUET')).toBe(true);
      expect(DUCK_CONST.REGEX.PARQUET.test('FILE.GEOPARQUET')).toBe(true);
      expect(DUCK_CONST.REGEX.PARQUET.test('FILE.GPQ')).toBe(true);
    });

    it('does not match non-parquet extensions', () => {
      expect(DUCK_CONST.REGEX.PARQUET.test('file.csv')).toBe(false);
      expect(DUCK_CONST.REGEX.PARQUET.test('file.json')).toBe(false);
    });
  });

  describe('TABULAR regex', () => {
    it('matches .csv extension', () => {
      expect(DUCK_CONST.REGEX.TABULAR.test('file.csv')).toBe(true);
    });

    it('matches .tsv extension', () => {
      expect(DUCK_CONST.REGEX.TABULAR.test('file.tsv')).toBe(true);
    });

    it('matches .txt extension', () => {
      expect(DUCK_CONST.REGEX.TABULAR.test('file.txt')).toBe(true);
    });

    it('matches .text extension', () => {
      expect(DUCK_CONST.REGEX.TABULAR.test('file.text')).toBe(true);
    });

    it('matches uppercase extensions', () => {
      expect(DUCK_CONST.REGEX.TABULAR.test('file.CSV')).toBe(true);
      expect(DUCK_CONST.REGEX.TABULAR.test('file.TSV')).toBe(true);
    });
  });

  describe('GEO regex', () => {
    it('matches .geojson extension', () => {
      expect(DUCK_CONST.REGEX.GEO.test('file.geojson')).toBe(true);
    });

    it('matches .json extension', () => {
      expect(DUCK_CONST.REGEX.GEO.test('file.json')).toBe(true);
    });

    it('matches .gpkg extension', () => {
      expect(DUCK_CONST.REGEX.GEO.test('file.gpkg')).toBe(true);
    });

    it('matches .kml extension', () => {
      expect(DUCK_CONST.REGEX.GEO.test('file.kml')).toBe(true);
    });

    it('matches .kmz extension', () => {
      expect(DUCK_CONST.REGEX.GEO.test('file.kmz')).toBe(true);
    });

    it('matches .gpx extension', () => {
      expect(DUCK_CONST.REGEX.GEO.test('file.gpx')).toBe(true);
    });

    it('matches uppercase extensions', () => {
      expect(DUCK_CONST.REGEX.GEO.test('file.GEOJSON')).toBe(true);
      expect(DUCK_CONST.REGEX.GEO.test('file.JSON')).toBe(true);
    });
  });

  describe('ARROW regex', () => {
    it('matches .arrow extension', () => {
      expect(DUCK_CONST.REGEX.ARROW.test('file.arrow')).toBe(true);
    });

    it('matches uppercase extension', () => {
      expect(DUCK_CONST.REGEX.ARROW.test('file.ARROW')).toBe(true);
    });

    it('does not match other extensions', () => {
      expect(DUCK_CONST.REGEX.ARROW.test('file.parquet')).toBe(false);
    });
  });
});
