import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  executeQueryMock: vi.fn(),
  registerFilesMock: vi.fn(),
  addRowIdMock: vi.fn(),
  runInTransactionMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerSuccessMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerDebugMock: vi.fn()
}));

vi.mock('$lib/features/duckdb/core/query', () => ({
  executeQuery: mocks.executeQueryMock
}));

vi.mock('$lib/features/duckdb/io/file-registry', () => ({
  generateUniqueTableName: vi.fn(() => 'generated_table'),
  registerFiles: mocks.registerFilesMock
}));

vi.mock('$lib/features/duckdb/io/reader-utils', () => ({
  addRowId: mocks.addRowIdMock
}));

vi.mock('$lib/features/duckdb/core/transaction', () => ({
  runInTransaction: mocks.runInTransactionMock
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    DUCKDB: 'DUCKDB'
  },
  logger: {
    info: mocks.loggerInfoMock,
    success: mocks.loggerSuccessMock,
    error: mocks.loggerErrorMock,
    debug: mocks.loggerDebugMock
  }
}));

import { readGeofile } from '$lib/features/duckdb/io/geofile-reader';

describe('readGeofile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runInTransactionMock.mockImplementation(async (_conn, fn) => fn());
    mocks.addRowIdMock.mockResolvedValue(undefined);
    mocks.registerFilesMock.mockResolvedValue(undefined);
    mocks.executeQueryMock.mockImplementation(async (_conn, query) => {
      const sql = String(query);

      if (sql.startsWith('LOAD spatial')) {
        return undefined;
      }

      if (sql.includes('SELECT unnest(layers) AS layer')) {
        return [
          {
            layer_index: 1,
            layer_name: 'chef_lieu_de_commune',
            feature_count: 32,
            crs_code: 5490,
            geom_name: 'geometrie',
            geom_type: 'Point'
          },
          {
            layer_index: 2,
            layer_name: 'commune',
            feature_count: 32,
            crs_code: 5490,
            geom_name: 'geometrie',
            geom_type: 'Multi Polygon'
          },
          {
            layer_index: 3,
            layer_name: 'region',
            feature_count: 1,
            crs_code: 5490,
            geom_name: 'geometrie',
            geom_type: 'Multi Polygon'
          },
          {
            layer_index: 4,
            layer_name: 'layer_styles',
            feature_count: 18,
            crs_code: null,
            geom_name: null,
            geom_type: null
          }
        ];
      }

      return undefined;
    });
  });

  it('auto-selects the richest polygon layer in a multi-layer geofile', async () => {
    const ctx = {
      connection: {},
      db: {},
      registered_files: new Map(),
      loaded_files: new Map(),
      extensionsLoaded: { spatial: false, httpfs: false }
    } as never;

    const file = new File(['content'], 'admin-express.gpkg');
    Object.assign(file, { id: 'admin-express.gpkg' });

    await readGeofile(ctx, file, { tablename: 'custom_basemap_test' });

    const issuedSql = mocks.executeQueryMock.mock.calls.map(([, sql]) =>
      String(sql)
    );
    expect(
      issuedSql.some((sql) =>
        sql.includes("FROM ST_Read('admin-express.gpkg', layer = 'commune')")
      )
    ).toBe(true);
    expect(mocks.loggerInfoMock).toHaveBeenCalledWith(
      'Auto-selected spatial layer from multi-layer geofile',
      'DUCKDB',
      expect.objectContaining({
        filename: 'admin-express.gpkg',
        layerCount: 4,
        selectedLayer: 'commune'
      })
    );
  });
});
