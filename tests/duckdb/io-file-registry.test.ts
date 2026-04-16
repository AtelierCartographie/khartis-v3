import { describe, expect, it, vi } from 'vitest';

vi.mock('@duckdb/duckdb-wasm', () => ({
  DuckDBDataProtocol: { BROWSER_FILEREADER: 1 }
}));

import {
  extractFilename,
  generateUniqueTableName,
  getFileType
} from '$lib/features/duckdb/io/file-registry';

describe('extractFilename', () => {
  it('extracts the last path segment', () => {
    expect(extractFilename('https://example.com/data/world.geojson')).toBe(
      'world.geojson'
    );
  });

  it('returns the input when no slash is present', () => {
    expect(extractFilename('data.csv')).toBe('data.csv');
  });

  it('returns empty string for a URL ending with a slash', () => {
    expect(extractFilename('https://example.com/')).toBe('');
  });
});

describe('getFileType', () => {
  it('classifies .csv as tabular', () =>
    expect(getFileType('data.csv')).toBe('tabular'));
  it('classifies .tsv as tabular', () =>
    expect(getFileType('data.tsv')).toBe('tabular'));
  it('classifies .geojson as geofile', () =>
    expect(getFileType('world.geojson')).toBe('geofile'));
  it('classifies .gpkg as geofile', () =>
    expect(getFileType('regions.gpkg')).toBe('geofile'));
  it('classifies .parquet as parquet', () =>
    expect(getFileType('data.parquet')).toBe('parquet'));
  it('classifies .geoparquet as parquet', () =>
    expect(getFileType('data.geoparquet')).toBe('parquet'));
  it('classifies .arrow as arrow', () =>
    expect(getFileType('data.arrow')).toBe('arrow'));
  it('falls back to tabular for unknown extensions', () =>
    expect(getFileType('data.unknown')).toBe('tabular'));
});

describe('generateUniqueTableName', () => {
  it('uses the base name when no collision', () => {
    expect(generateUniqueTableName('world.geojson', new Map())).toBe('world');
  });

  it('appends _N counter to avoid collisions', () => {
    const existing = new Map([['world', 'world']]);
    expect(generateUniqueTableName('world.geojson', existing)).toBe('world_1');
  });

  it('increments counter until a unique name is found', () => {
    const existing = new Map([
      ['world', '1'],
      ['world_1', '2']
    ]);
    expect(generateUniqueTableName('world.geojson', existing)).toBe('world_2');
  });

  it('normalizes accented characters in filenames', () => {
    const name = generateUniqueTableName('données.csv', new Map());
    expect(name).toMatch(/^[a-zA-Z0-9_]+$/);
  });

  it('strips path traversal characters', () => {
    const name = generateUniqueTableName('../../../etc/passwd.csv', new Map());
    expect(name).not.toContain('..');
    expect(name).not.toContain('/');
  });
});
