import { describe, expect, it } from 'vitest';
import { detectFileFormat } from '$lib/features/data-pipeline/core/format-detector';

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
