import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';

const mocks = vi.hoisted(() => ({
  queryMock: vi.fn(),
  registerFilesMock: vi.fn(),
  readGeofileMock: vi.fn(),
  analyseMock: vi.fn(),
  convertGeoPackageToGeoJsonFileMock: vi.fn(),
  fetchArrowTableWithGeometryMock: vi.fn(),
  addGeoArrowMetadataFromDuckDBMock: vi.fn(),
  generateCustomBasemapAttributesMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  extractZipMock: vi.fn(),
  getShapefileFilesFromArchiveMock: vi.fn(),
  createFileFromExtractedMock: vi.fn()
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    query: mocks.queryMock,
    register_files: mocks.registerFilesMock,
    read_geofile: mocks.readGeofileMock,
    analyse: mocks.analyseMock
  },
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326',
    WEB_MERCATOR_CRS: 'EPSG:3857'
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/arrow-ops', () => ({
  fetchArrowTableWithGeometry: mocks.fetchArrowTableWithGeometryMock,
  addGeoArrowMetadataFromDuckDB: mocks.addGeoArrowMetadataFromDuckDBMock
}));

vi.mock('$lib/features/map/utils/generate-basemap-attributes', () => ({
  generateCustomBasemapAttributes: mocks.generateCustomBasemapAttributesMock
}));

vi.mock('$lib/features/map/utils/geopackage-browser-fallback', () => ({
  convertGeoPackageToGeoJsonFile: mocks.convertGeoPackageToGeoJsonFileMock
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    MAP: 'MAP'
  },
  logger: {
    warn: mocks.loggerWarnMock,
    error: mocks.loggerErrorMock,
    info: mocks.loggerInfoMock,
    debug: mocks.loggerDebugMock
  }
}));

vi.mock('$lib/paraglide/messages', () => ({
  error_shapefile_missing_components: ({
    components
  }: {
    components: string;
  }) => `Missing shapefile parts: ${components}`,
  error_shapefile_no_shp_found: () => 'Missing .shp file',
  basemap_import_modal_error_invalid_geometry: () => 'Invalid geometry',
  basemap_custom_source: () => 'User import',
  basemap_url_error_load: ({ status }: { status: string }) =>
    `Load error ${status}`,
  basemap_osm: () => 'OSM',
  osm_basemap_description: () => 'OSM description',
  osm_basemap_source: () => 'OSM source'
}));

vi.mock('$lib/features/data-pipeline/utils/zip-handler', () => ({
  extractZip: mocks.extractZipMock,
  getShapefileFilesFromArchive: mocks.getShapefileFilesFromArchiveMock,
  createFileFromExtracted: mocks.createFileFromExtractedMock
}));

import {
  getBasemapCentroidsTableName,
  getBasemapInnerlinesTableName,
  processBasemapImport
} from '$lib/features/map/utils/basemap-import.utils';

describe('processBasemapImport', () => {
  const rawTable = { numRows: 2, numCols: 1 };
  const arrowTable = { numRows: 2, numCols: 1, withMetadata: true };
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    mocks.fetchArrowTableWithGeometryMock.mockResolvedValue({
      table: rawTable,
      geomColumn: { column_name: 'geom', column_type: 'GEOMETRY' }
    });
    mocks.addGeoArrowMetadataFromDuckDBMock.mockResolvedValue(arrowTable);
    mocks.generateCustomBasemapAttributesMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  it('prepares imported polygon geofiles with snapping, innerlines and centroids', async () => {
    mocks.queryMock
      .mockResolvedValueOnce([{ geom_type: 'POLYGON' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ minX: -1, minY: -2, maxX: 3, maxY: 4 }]);
    mocks.analyseMock.mockResolvedValueOnce([{ name: 'geom', count: 2 }]);

    const result = await processBasemapImport(
      new File(['{}'], 'regions.geojson', { type: 'application/geo+json' })
    );

    expect(mocks.readGeofileMock).toHaveBeenCalledWith(expect.any(File), {
      tablename: 'custom_basemap_1700000000000',
      shapefile: false
    });
    expect(mocks.queryMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "FROM simplify_and_clean('custom_basemap_1700000000000__raw', 'geom', 0.0)"
      )
    );
    expect(mocks.queryMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "FROM extract_innerlines('custom_basemap_1700000000000')"
      )
    );
    expect(mocks.queryMock).toHaveBeenCalledWith(
      expect.stringContaining('ST_MaximumInscribedCircle("geom").center')
    );
    expect(result.basemap.layers).toEqual([
      {
        title_fr: 'custom_basemap_1700000000000',
        title_en: 'custom_basemap_1700000000000',
        type: BasemapLayerType.POLYGON,
        style: null
      },
      {
        title_fr: 'Limites',
        title_en: 'Limits',
        type: BasemapLayerType.LIMIT,
        file: getBasemapInnerlinesTableName('custom_basemap_1700000000000'),
        style: null
      },
      {
        title_fr: 'Centroïdes',
        title_en: 'Centroids',
        type: BasemapLayerType.CENTROID,
        file: getBasemapCentroidsTableName('custom_basemap_1700000000000'),
        style: null
      }
    ]);
    expect(result.geometryTable).toBe(arrowTable);
  });

  it('falls back to a direct geometry copy when polygon cleanup fails on invalid topology', async () => {
    mocks.queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT DISTINCT ST_GeometryType')) {
        return [{ geom_type: 'POLYGON' }];
      }
      if (
        sql.includes(
          'CREATE OR REPLACE TABLE "custom_basemap_1700000000000__raw"'
        )
      ) {
        return undefined;
      }
      if (
        sql.includes(
          "FROM simplify_and_clean('custom_basemap_1700000000000__raw', 'geom', 0.0)"
        )
      ) {
        throw new Error('TopologyException: side location conflict');
      }
      if (sql.includes('SELECT * FROM "custom_basemap_1700000000000__raw"')) {
        return undefined;
      }
      if (
        sql.includes("FROM extract_innerlines('custom_basemap_1700000000000')")
      ) {
        return undefined;
      }
      if (sql.includes('ST_PointOnSurface')) {
        return undefined;
      }
      if (sql.includes('ST_XMin(ST_Extent')) {
        return [{ minX: -1, minY: -2, maxX: 3, maxY: 4 }];
      }
      return undefined;
    });
    mocks.analyseMock.mockResolvedValueOnce([{ name: 'geom', count: 2 }]);

    const result = await processBasemapImport(
      new File(['{}'], 'invalid-regions.geojson', {
        type: 'application/geo+json'
      })
    );

    const issuedSql = mocks.queryMock.mock.calls.map(([sql]) => String(sql));
    expect(
      issuedSql.some((sql) =>
        sql.includes('SELECT * FROM "custom_basemap_1700000000000__raw"')
      )
    ).toBe(true);
    expect(mocks.loggerWarnMock).toHaveBeenCalledWith(
      'Basemap polygon cleanup failed, falling back to direct geometry copy',
      'MAP',
      expect.objectContaining({
        tableName: 'custom_basemap_1700000000000',
        geometryColumn: 'geom'
      })
    );
    expect(result.basemap.title_fr).toBe('invalid-regions');
    expect(result.geometryTable).toBe(arrowTable);
  });

  it('prepares imported line geofiles with a dedicated cleanup pipeline and representative points', async () => {
    mocks.queryMock
      .mockResolvedValueOnce([{ geom_type: 'LINESTRING' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ minX: 0, minY: 0, maxX: 1, maxY: 1 }]);
    mocks.analyseMock.mockResolvedValueOnce([{ name: 'geom', count: 5 }]);

    const result = await processBasemapImport(
      new File(['{}'], 'roads.geojson', { type: 'application/geo+json' })
    );

    const issuedSql = mocks.queryMock.mock.calls.map(([sql]) => String(sql));
    expect(
      issuedSql.some((sql) =>
        sql.includes(
          "FROM simplify_and_clean_linestring('custom_basemap_1700000000000__raw', 'geom', 0.0)"
        )
      )
    ).toBe(true);
    expect(issuedSql.some((sql) => sql.includes('extract_innerlines'))).toBe(
      false
    );
    expect(issuedSql.some((sql) => sql.includes('ST_PointOnSurface'))).toBe(
      true
    );
    expect(result.basemap.layers).toEqual([
      {
        title_fr: 'custom_basemap_1700000000000',
        title_en: 'custom_basemap_1700000000000',
        type: BasemapLayerType.LINE,
        style: null
      },
      {
        title_fr: 'Centroïdes',
        title_en: 'Centroids',
        type: BasemapLayerType.CENTROID,
        file: getBasemapCentroidsTableName('custom_basemap_1700000000000'),
        style: null
      }
    ]);
  });

  it('prepares imported multipoint geofiles with representative points only', async () => {
    mocks.queryMock
      .mockResolvedValueOnce([{ geom_type: 'MULTIPOINT' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ minX: 2, minY: 3, maxX: 4, maxY: 5 }]);
    mocks.analyseMock.mockResolvedValueOnce([{ name: 'geom', count: 6 }]);

    const result = await processBasemapImport(
      new File(['{}'], 'sites.geojson', { type: 'application/geo+json' })
    );

    const issuedSql = mocks.queryMock.mock.calls.map(([sql]) => String(sql));
    expect(
      issuedSql.some((sql) => sql.includes('simplify_and_clean_linestring'))
    ).toBe(false);
    expect(issuedSql.some((sql) => sql.includes('extract_innerlines'))).toBe(
      false
    );
    expect(issuedSql.some((sql) => sql.includes('ST_PointOnSurface'))).toBe(
      true
    );
    expect(result.basemap.layers).toEqual([
      {
        title_fr: 'custom_basemap_1700000000000',
        title_en: 'custom_basemap_1700000000000',
        type: BasemapLayerType.POINT,
        style: null
      },
      {
        title_fr: 'Centroïdes',
        title_en: 'Centroids',
        type: BasemapLayerType.CENTROID,
        file: getBasemapCentroidsTableName('custom_basemap_1700000000000'),
        style: null
      }
    ]);
  });

  it('falls back to browser GeoPackage conversion when DuckDB geofile import fails', async () => {
    const gpkgFile = new File(['sqlite'], 'islands.gpkg', {
      type: 'application/geopackage+sqlite3'
    });
    const fallbackFile = new File(['{}'], 'islands.geojson', {
      type: 'application/geo+json'
    });

    mocks.convertGeoPackageToGeoJsonFileMock.mockResolvedValue(fallbackFile);
    mocks.readGeofileMock
      .mockRejectedValueOnce(new Error('thread constructor failed'))
      .mockResolvedValueOnce(undefined);
    mocks.queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('DROP TABLE IF EXISTS')) {
        return undefined;
      }
      if (sql.includes('SELECT DISTINCT ST_GeometryType')) {
        return [{ geom_type: 'MULTIPOLYGON' }];
      }
      if (sql.includes('ST_XMin(ST_Extent')) {
        return [{ minX: -61.9, minY: 15.8, maxX: -60.9, maxY: 16.6 }];
      }
      return undefined;
    });
    mocks.analyseMock.mockResolvedValueOnce([{ name: 'geom', count: 32 }]);

    const result = await processBasemapImport(gpkgFile);

    expect(mocks.convertGeoPackageToGeoJsonFileMock).toHaveBeenCalledWith(
      gpkgFile
    );
    expect(mocks.readGeofileMock).toHaveBeenNthCalledWith(1, gpkgFile, {
      tablename: 'custom_basemap_1700000000000',
      shapefile: false
    });
    expect(mocks.readGeofileMock).toHaveBeenNthCalledWith(2, fallbackFile, {
      tablename: 'custom_basemap_1700000000000',
      shapefile: false
    });

    const issuedSql = mocks.queryMock.mock.calls.map(([sql]) => String(sql));
    expect(
      issuedSql.some((sql) =>
        sql.includes('DROP TABLE IF EXISTS "custom_basemap_1700000000000"')
      )
    ).toBe(true);
    expect(result.basemap.title_fr).toBe('islands');
    expect(result.geometryTable).toBe(arrowTable);
  });

  it('normalizes polygon geoparquet imports to the geom column before deriving helper layers', async () => {
    mocks.queryMock
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        {
          value: JSON.stringify({
            primary_column: 'geometry',
            columns: {
              geometry: {
                geometry_types: ['MultiPolygon']
              }
            }
          })
        }
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ minX: -5, minY: -6, maxX: 7, maxY: 8 }]);
    mocks.analyseMock.mockResolvedValueOnce([{ name: 'geom', count: 4 }]);

    const result = await processBasemapImport(
      new File(['parquet'], 'regions.parquet', {
        type: 'application/octet-stream'
      })
    );

    expect(mocks.queryMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "FROM simplify_and_clean('custom_basemap_1700000000000__raw', 'geometry', 0.0)"
      )
    );
    expect(result.basemap.layers[0]).toEqual({
      title_fr: 'custom_basemap_1700000000000',
      title_en: 'custom_basemap_1700000000000',
      type: BasemapLayerType.POLYGON,
      style: null
    });
  });
});
