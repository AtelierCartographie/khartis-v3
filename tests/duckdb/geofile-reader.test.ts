import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DuckDBContext } from '$lib/features/duckdb/types';

const {
  executeQueryMock,
  registerFilesMock,
  dropRegisteredFileMock,
  addRowIdMock
} = vi.hoisted(() => ({
  executeQueryMock: vi.fn(),
  registerFilesMock: vi.fn(),
  dropRegisteredFileMock: vi.fn(),
  addRowIdMock: vi.fn()
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
  addRowId: addRowIdMock,
  dropSyntheticFeatureIdColumn: vi.fn()
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
});
