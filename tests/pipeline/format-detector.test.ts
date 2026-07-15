import { describe, expect, it } from 'vitest';
import {
  detectFileFormat,
  generateTableName
} from '$lib/features/data-pipeline/core/format-detector';

describe('detectFileFormat', () => {
  it('prioritises parquet over csv when both could match', () => {
    expect(detectFileFormat('data.parquet')).toBe('geoparquet');
    expect(detectFileFormat('data.geoparquet')).toBe('geoparquet');
    expect(detectFileFormat('data.gpq')).toBe('geoparquet');
  });

  it('detects csv/tsv/txt as tabular', () => {
    expect(detectFileFormat('data.csv')).toBe('csv');
    expect(detectFileFormat('data.tsv')).toBe('csv');
    expect(detectFileFormat('data.txt')).toBe('csv');
  });

  it('detects geo formats by extension', () => {
    expect(detectFileFormat('data.geojson')).toBe('geojson');
    expect(detectFileFormat('data.json')).toBe('geojson');
    expect(detectFileFormat('data.shp')).toBe('shapefile');
    expect(detectFileFormat('data.gpkg')).toBe('geopackage');
    expect(detectFileFormat('data.kml')).toBe('kml');
    expect(detectFileFormat('data.kmz')).toBe('kmz');
    expect(detectFileFormat('data.gpx')).toBe('gpx');
  });

  it('handles multi-dot filenames — uses last extension', () => {
    expect(detectFileFormat('my.data.csv')).toBe('csv');
    expect(detectFileFormat('archive.tar.gz')).toBe('unknown');
  });

  it('returns unknown for unsupported extension', () => {
    expect(detectFileFormat('data.exe')).toBe('unknown');
    expect(detectFileFormat('data.xlsx')).toBe('unknown');
  });
});

describe('generateTableName', () => {
  it('should derive the same name on every call when a sourceFileId is provided', () => {
    const sourceFileId = '0d6c7c14-9d5c-4d0e-8f0a-1b2c3d4e5f60';

    const first = generateTableName('naissances 2018.csv', sourceFileId);
    const second = generateTableName('naissances 2018.csv', sourceFileId);

    expect(first).toBe(second);
    expect(first).toBe('naissances_2018_0d6c7c14_9d5c_4d0e_8f0a_1b2c3d4e5f60');
  });

  it('should keep names distinct when the same file is imported twice', () => {
    const first = generateTableName('data.csv', 'aaaaaaaa-1111');
    const second = generateTableName('data.csv', 'bbbbbbbb-2222');

    expect(first).not.toBe(second);
  });

  it('should prefix names that do not start with a letter', () => {
    expect(generateTableName('2018-births.csv', 'abc123')).toBe(
      't_2018_births_abc123'
    );
  });

  it('should fall back to a timestamp suffix without sourceFileId', () => {
    expect(generateTableName('data.csv')).toMatch(/^data_[a-z0-9]+$/);
  });
});
