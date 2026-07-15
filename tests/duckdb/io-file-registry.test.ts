import { describe, expect, it, vi } from 'vitest';

vi.mock('@duckdb/duckdb-wasm', () => ({
  DuckDBDataProtocol: { BROWSER_FILEREADER: 1 }
}));

import {
  extractFilename,
  generateUniqueTableName,
  getFileType,
  registerFiles
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
  it('should classify by the last extension when several are chained', () =>
    expect(getFileType('data.csv.gpkg')).toBe('geofile'));
  it('should ignore a trailing query string when classifying', () =>
    expect(getFileType('regions.gpkg?token=abc')).toBe('geofile'));
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

function createDbfWithFieldNames(fieldNames: string[]): File {
  const headerLength = 32 + fieldNames.length * 32 + 1;
  const bytes = new Uint8Array(headerLength + 1);
  bytes[0] = 0x03;
  bytes[8] = headerLength & 0xff;
  bytes[9] = (headerLength >> 8) & 0xff;

  fieldNames.forEach((fieldName, index) => {
    const offset = 32 + index * 32;
    for (
      let charIndex = 0;
      charIndex < Math.min(fieldName.length, 11);
      charIndex += 1
    ) {
      bytes[offset + charIndex] = fieldName.charCodeAt(charIndex);
    }
    bytes[offset + 11] = 'C'.charCodeAt(0);
    bytes[offset + 16] = 10;
  });

  bytes[headerLength - 1] = 0x0d;

  return new File([bytes], 'test.dbf', {
    type: 'application/x-dbf',
    lastModified: 1700000000000
  });
}

async function readDbfFieldNames(file: File): Promise<string[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const headerLength = bytes[8] | (bytes[9] << 8);
  const fieldNames: string[] = [];

  for (let offset = 32; offset + 32 <= headerLength; offset += 32) {
    if (bytes[offset] === 0x0d) {
      break;
    }

    let end = offset + 11;
    while (end > offset && bytes[end - 1] === 0) {
      end -= 1;
    }
    fieldNames.push(String.fromCharCode(...bytes.slice(offset, end)));
  }

  return fieldNames;
}

describe('registerFiles', () => {
  it('renames duplicate DBF field headers before registering shapefiles', async () => {
    const db = {
      registerFileHandle: vi.fn().mockResolvedValue(undefined)
    } as const;
    const registeredFiles = new Set<string>();
    const shp = new File(['shp'], 'test.shp', {
      type: 'application/x-shapefile',
      lastModified: 1700000000000
    });
    const dbf = createDbfWithFieldNames(['li_couleur_', 'li_couleur_']);

    await registerFiles(
      db as unknown as Parameters<typeof registerFiles>[0],
      registeredFiles,
      [shp, dbf],
      { shapefile: true }
    );

    const registeredDbf = db.registerFileHandle.mock.calls.find(([fileId]) =>
      String(fileId).endsWith('test.dbf')
    )?.[1] as File | undefined;

    expect(registeredDbf).toBeDefined();
    await expect(readDbfFieldNames(registeredDbf!)).resolves.toEqual([
      'li_couleur_',
      'li_couleu_2'
    ]);
  });
});
