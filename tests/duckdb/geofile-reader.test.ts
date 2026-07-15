import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DuckDBContext } from '$lib/features/duckdb/types';

const {
  executeQueryMock,
  registerFilesMock,
  dropRegisteredFileMock,
  addRowIdMock,
  convertGeoPackageToGeoJsonFileMock
} = vi.hoisted(() => ({
  executeQueryMock: vi.fn(),
  registerFilesMock: vi.fn(),
  dropRegisteredFileMock: vi.fn(),
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
  dropRegisteredFile: dropRegisteredFileMock,
  generateUniqueTableName: vi.fn(() => 'generated_table'),
  registerFiles: registerFilesMock
}));

vi.mock('$lib/features/duckdb/io/reader-utils', () => ({
  addRowId: addRowIdMock
}));

vi.mock('$lib/features/map/utils/geopackage-browser-fallback.utils', () => ({
  convertGeoPackageToGeoJsonFile: convertGeoPackageToGeoJsonFileMock
}));

import { readGeofile } from '$lib/features/duckdb/io/geofile-reader';

function createContext(): DuckDBContext {
  return {
    db: {} as DuckDBContext['db'],
    connection: {} as DuckDBContext['connection'],
    loaded_files: new Map(),
    registered_files: new Set(),
    table_files: new Map(),
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the browser GeoPackage fallback before ST_Read in mono-thread runtimes', async () => {
    vi.stubGlobal('window', {});

    const ctx = createContext();
    const gpkgFile = new File(['gpkg'], 'compagnies-herault-l93.gpkg', {
      type: 'application/geopackage+sqlite3'
    });
    const fallbackGeoJsonFile = new File(
      ['{"type":"FeatureCollection","features":[]}'],
      'compagnies-herault-l93.geojson',
      { type: 'application/geo+json' }
    );

    convertGeoPackageToGeoJsonFileMock.mockResolvedValue(fallbackGeoJsonFile);
    executeQueryMock
      .mockResolvedValueOnce([
        {
          layer_index: 1,
          layer_name: 'features',
          feature_count: 11,
          crs_code: 4326,
          geom_name: 'geom',
          geom_type: 'MULTIPOLYGON'
        }
      ])
      .mockResolvedValueOnce(new Uint8Array());

    const tableName = await readGeofile(ctx, gpkgFile, {
      tablename: 'compagnies_table'
    });

    expect(tableName).toBe('compagnies_table');
    expect(convertGeoPackageToGeoJsonFileMock).toHaveBeenCalledWith(gpkgFile, {
      preferredLayer: undefined
    });
    expect(registerFilesMock).toHaveBeenCalledTimes(2);
    expect(addRowIdMock).toHaveBeenCalledWith(
      ctx.connection,
      'compagnies_table'
    );
    expect(ctx.loaded_files.get('compagnies_table')).toBe(gpkgFile.name);
    expect(
      executeQueryMock.mock.calls.some(([_, sql]) =>
        String(sql).includes('registered:compagnies-herault-l93.gpkg')
      )
    ).toBe(false);
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

  it('drops the geofile handle once the table is materialized', async () => {
    const ctx = createContext();
    const geojsonFile = new File(['{}'], 'zones.geojson', {
      type: 'application/geo+json'
    });

    executeQueryMock
      .mockResolvedValueOnce([
        {
          layer_index: 1,
          layer_name: 'zones',
          feature_count: 2,
          crs_code: 4326,
          geom_name: 'geom',
          geom_type: 'POLYGON'
        }
      ])
      .mockResolvedValueOnce(new Uint8Array());

    await readGeofile(ctx, geojsonFile, { tablename: 'zones_table' });

    expect(dropRegisteredFileMock).toHaveBeenCalledTimes(1);
    expect(dropRegisteredFileMock).toHaveBeenCalledWith(
      ctx.db,
      ctx.registered_files,
      'registered:zones.geojson'
    );
    expect(ctx.table_files.has('zones_table')).toBe(false);
  });

  it('keeps shapefile handles registered and records the exact id for later cleanup', async () => {
    const ctx = createContext();
    const shpFile = new File(['shp'], 'roads.shp', {
      type: 'application/octet-stream'
    });

    executeQueryMock
      .mockResolvedValueOnce([
        {
          layer_index: 1,
          layer_name: 'roads',
          feature_count: 4,
          crs_code: 4326,
          geom_name: 'geom',
          geom_type: 'LINESTRING'
        }
      ])
      .mockResolvedValueOnce(new Uint8Array());

    await readGeofile(ctx, shpFile, {
      tablename: 'roads_table',
      shapefile: true
    });

    expect(dropRegisteredFileMock).not.toHaveBeenCalled();
    expect(ctx.table_files.get('roads_table')).toBe('registered:roads.shp');
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
