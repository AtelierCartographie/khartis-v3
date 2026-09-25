import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';

const mocks = vi.hoisted(() => ({
  queryMock: vi.fn(),
  analyseMock: vi.fn(async () => [{ name: 'nom', type_simple: 'string' }]),
  describeTableMock: vi.fn(async () => ({
    name: ['nom', 'geom'],
    type: ['VARCHAR', "GEOMETRY('EPSG:2154')"]
  })),
  createGeometryTableMock: vi.fn(async () => ({ numRows: 2 })),
  generateAttributesMock: vi.fn(async () => undefined)
}));

vi.mock('$lib/features/duckdb', async () => ({
  ...(await vi.importActual<object>(
    '$lib/features/duckdb/utils/basemap-join-key-columns.utils'
  )),
  ...(await vi.importActual<object>(
    '$lib/features/duckdb/utils/geometry-column.utils'
  )),
  ...(await vi.importActual<object>('$lib/features/duckdb/enums')),
  Duck: {
    query: mocks.queryMock,
    analyse: mocks.analyseMock,
    describe_table: mocks.describeTableMock,
    invalidateTableCache: vi.fn()
  },
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326',
    WEB_MERCATOR_CRS: 'EPSG:3857'
  }
}));

vi.mock('./custom-basemap-geometry.service', () => ({
  createCustomBasemapGeometryTableFromDuck: mocks.createGeometryTableMock
}));

vi.mock('./generate-basemap-attributes.service', () => ({
  generateCustomBasemapAttributes: mocks.generateAttributesMock
}));

const { Duck } = await import('$lib/features/duckdb');
const {
  createBasemapFromGeometryTable,
  getBasemapInnerlinesTableName,
  getBasemapLandTableName,
  getBasemapOuterlinesTableName,
  getBasemapCentroidsTableName
} = await import('./basemap-import.service');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('ST_GeometryType')) {
      return [{ geom_type: 'POLYGON' }];
    }
    if (sql.includes('ST_XMin')) {
      return [{ minX: -5, minY: 41, maxX: 9, maxY: 51 }];
    }
    return [];
  });
});

describe('createBasemapFromGeometryTable', () => {
  it('should expose the territory, outer limit and inner limits of a polygon coverage', async () => {
    const { basemap } = await createBasemapFromGeometryTable(
      Duck,
      'regions_geojson',
      { title: 'regions.geojson' }
    );

    expect(
      basemap.layers.map((layer) => ({
        title: layer.title_fr,
        type: layer.type,
        file: layer.file,
        style: layer.style
      }))
    ).toEqual([
      {
        title: 'Territoire',
        type: BasemapLayerType.LAND,
        file: getBasemapLandTableName('regions_geojson'),
        style: 'land'
      },
      {
        title: 'Limite extérieure',
        type: BasemapLayerType.LIMIT,
        file: getBasemapOuterlinesTableName('regions_geojson'),
        style: 'limit-outer'
      },
      {
        title: 'Limites',
        type: BasemapLayerType.LIMIT,
        file: getBasemapInnerlinesTableName('regions_geojson'),
        style: 'limit-level-0'
      },
      {
        title: 'Centroïdes',
        type: BasemapLayerType.CENTROID,
        file: getBasemapCentroidsTableName('regions_geojson'),
        style: null
      }
    ]);
    expect(basemap.isDatasetGeometry).toBe(true);
    expect(basemap.bbox).toEqual([-5, 41, 9, 51]);
    // Bounds come from the source table, so the CRS must describe that space.
    expect(basemap.proj_source).toBe('EPSG:2154');
  });

  it('should derive the boundary tables through the simplification macros', async () => {
    await createBasemapFromGeometryTable(Duck, 'regions_geojson', {
      title: 'regions.geojson'
    });

    const statements = mocks.queryMock.mock.calls.map(
      (call) => call[0] as string
    );
    expect(
      statements.some(
        (sql) =>
          sql.includes('extract_innerlines') &&
          sql.includes('regions_geojson__innerlines')
      )
    ).toBe(true);
    expect(
      statements.some(
        (sql) =>
          sql.includes('extract_outerlines') &&
          sql.includes('regions_geojson__outerlines')
      )
    ).toBe(true);
    expect(
      statements.some(
        (sql) =>
          sql.includes('extract_land(') && sql.includes('regions_geojson__land')
      )
    ).toBe(true);
  });

  it('should never rewrite the source table it derives from', async () => {
    await createBasemapFromGeometryTable(Duck, 'regions_geojson', {
      title: 'regions.geojson'
    });

    const rewrites = mocks.queryMock.mock.calls
      .map((call) => call[0] as string)
      .filter((sql) => /CREATE OR REPLACE TABLE "regions_geojson"\s/.test(sql));
    expect(rewrites).toEqual([]);
  });
});
