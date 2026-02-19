import { describe, expect, it } from 'vitest';

const PARQUET_EXTENSIONS = ['.parquet', '.geoparquet', '.gpq', '.arrow'];

function canHandleParquet(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return PARQUET_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

describe('geoparquet extension detection', () => {
  it('handles .parquet extension', () => {
    expect(canHandleParquet('data.parquet')).toBe(true);
  });

  it('handles .geoparquet extension', () => {
    expect(canHandleParquet('data.geoparquet')).toBe(true);
  });

  it('handles .gpq extension', () => {
    expect(canHandleParquet('data.gpq')).toBe(true);
  });

  it('handles .arrow extension', () => {
    expect(canHandleParquet('data.arrow')).toBe(true);
  });

  it('handles uppercase extensions', () => {
    expect(canHandleParquet('DATA.PARQUET')).toBe(true);
    expect(canHandleParquet('DATA.GEOPARQUET')).toBe(true);
    expect(canHandleParquet('DATA.GPQ')).toBe(true);
    expect(canHandleParquet('DATA.ARROW')).toBe(true);
  });

  it('does not handle other extensions', () => {
    expect(canHandleParquet('data.csv')).toBe(false);
    expect(canHandleParquet('data.json')).toBe(false);
    expect(canHandleParquet('data.geojson')).toBe(false);
    expect(canHandleParquet('data.gpkg')).toBe(false);
  });

  it('handles files with path prefix', () => {
    expect(canHandleParquet('/path/to/data.gpq')).toBe(true);
    expect(canHandleParquet('C:\\Users\\data.geoparquet')).toBe(true);
  });
});
