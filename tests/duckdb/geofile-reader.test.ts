import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DuckDBContext } from '$lib/features/duckdb/types';

const {
  executeQueryMock,
  registerFilesMock,
  addRowIdMock,
  convertGeoPackageToGeoJsonFileMock
} = vi.hoisted(() => ({
  executeQueryMock: vi.fn(),
  registerFilesMock: vi.fn(),
  addRowIdMock: vi.fn(),
  convertGeoPackageToGeoJsonFileMock: vi.fn()
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    DUCKDB: 'DUCKDB'
  },
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: executeQueryMock
}));

vi.mock('$lib/features/duckdb/io/file-registry', () => ({
  generateUniqueTableName: vi.fn(() => 'generated_table'),
  registerFiles: registerFilesMock
}));

vi.mock('$lib/features/duckdb/io/reader-utils', () => ({
  addRowId: addRowIdMock
}));

vi.mock('$lib/features/map/utils/geopackage-browser-fallback', () => ({
  convertGeoPackageToGeoJsonFile: convertGeoPackageToGeoJsonFileMock
}));

import { readGeofile } from '$lib/features/duckdb/io/geofile-reader';

function createContext(): DuckDBContext {
  return {
    db: {} as DuckDBContext['db'],
    connection: {} as DuckDBContext['connection'],
    loaded_files: new Map(),
    registered_files: new Set(),
    table_metadata: new Map(),
    describeCache: new Map(),
    rowCountCache: new Map(),
    extensionsLoaded: { spatial: true, httpfs: false },
    extensionLoadPromises: { spatial: null, httpfs: null },
    localExtensionRepositoryConfigured: false,
    threadsSupported: false,
    bundleVariant: 'eh'
  };
}

describe('readGeofile', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    registerFilesMock.mockImplementation(
      async (_db, _registeredFiles, files: File[]) => {
        files.forEach((file) => {
          Object.assign(file, { id: `registered:${file.name}` });
        });
      }
    );

    addRowIdMock.mockResolvedValue(undefined);
  });

  it('falls back to browser GeoJSON conversion for GeoPackage thread errors in mono-thread runtimes', async () => {
    const ctx = createContext();
    const gpkgFile = new File(['gpkg'], 'ADE 4.0 GPKG GLP ED Dec 5 2025.gpkg', {
      type: 'application/geopackage+sqlite3'
    });
    const fallbackGeoJsonFile = new File(
      ['{"type":"FeatureCollection","features":[]}'],
      'ADE 4.0 GPKG GLP ED Dec 5 2025.geojson',
      { type: 'application/geo+json' }
    );

    convertGeoPackageToGeoJsonFileMock.mockResolvedValue(fallbackGeoJsonFile);

    executeQueryMock
      .mockResolvedValueOnce([
        {
          layer_index: 1,
          layer_name: 'commune',
          feature_count: 12,
          crs_code: 5490,
          geom_name: 'geom',
          geom_type: 'MULTIPOLYGON'
        }
      ])
      .mockRejectedValueOnce(
        new Error('thread constructor failed: Resource temporarily unavailable')
      )
      .mockResolvedValueOnce([
        {
          layer_index: 1,
          layer_name: 'commune',
          feature_count: 12,
          crs_code: 4326,
          geom_name: 'geom',
          geom_type: 'MULTIPOLYGON'
        }
      ])
      .mockResolvedValueOnce(new Uint8Array());

    const tableName = await readGeofile(ctx, gpkgFile, {
      tablename: 'fx15_table'
    });

    expect(tableName).toBe('fx15_table');
    expect(convertGeoPackageToGeoJsonFileMock).toHaveBeenCalledWith(gpkgFile, {
      preferredLayer: 'commune'
    });
    expect(registerFilesMock).toHaveBeenCalledTimes(2);
    expect(ctx.loaded_files.get('fx15_table')).toBe(gpkgFile.name);
    expect(
      executeQueryMock.mock.calls.some(([_, sql]) =>
        String(sql).includes('PRAGMA threads=1')
      )
    ).toBe(false);
  });

  it('preserves projected geofile coordinates at ingest and skips eager reprojection', async () => {
    const ctx = createContext();
    const gpkgFile = new File(['gpkg'], 'test-l93.gpkg', {
      type: 'application/geopackage+sqlite3'
    });

    executeQueryMock
      .mockResolvedValueOnce([
        {
          layer_index: 1,
          layer_name: 'companies',
          feature_count: 11,
          crs_code: 2154,
          geom_name: 'geom',
          geom_type: 'MULTIPOLYGON'
        }
      ])
      .mockResolvedValueOnce(new Uint8Array());

    const tableName = await readGeofile(ctx, gpkgFile, {
      tablename: 'l93_table'
    });

    expect(tableName).toBe('l93_table');
    expect(addRowIdMock).toHaveBeenCalledWith(ctx.connection, 'l93_table');
    expect(
      executeQueryMock.mock.calls.some(([_, sql]) =>
        String(sql).includes('ST_Transform')
      )
    ).toBe(false);
  });

  it('should call addRowId without reprojection for WGS84 geofiles', async () => {
    const ctx = createContext();
    const geojsonFile = new File(['{}'], 'test-wgs84.geojson', {
      type: 'application/geo+json'
    });

    executeQueryMock
      .mockResolvedValueOnce([
        {
          layer_index: 1,
          layer_name: 'features',
          feature_count: 3,
          crs_code: 4326,
          geom_name: 'geom',
          geom_type: 'POLYGON'
        }
      ])
      .mockResolvedValueOnce(new Uint8Array());

    const tableName = await readGeofile(ctx, geojsonFile, {
      tablename: 'wgs84_table'
    });

    expect(tableName).toBe('wgs84_table');
    expect(addRowIdMock).toHaveBeenCalledWith(ctx.connection, 'wgs84_table');
  });
});
