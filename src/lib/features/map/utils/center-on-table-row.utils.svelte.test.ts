import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  duckQuery: vi.fn(),
  centerOnDataPoint: vi.fn(),
  basemapInitialize: vi.fn(),
  loadGeometryIntoDuckDB: vi.fn(),
  resolveCenterCoordinates: vi.fn(
    async ({ lon, lat }: { lon: number; lat: number }) => ({ x: lon, y: lat })
  )
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    query: mocks.duckQuery
  }
}));

vi.mock('$lib/features/commons/stores/map-instance.store.svelte', () => ({
  mapInstanceStore: {
    centerOnDataPoint: mocks.centerOnDataPoint
  }
}));

vi.mock('$lib/features/map/services/basemap.service.svelte', () => ({
  basemapService: {
    initialize: mocks.basemapInitialize,
    loadGeometryIntoDuckDB: mocks.loadGeometryIntoDuckDB
  }
}));

vi.mock('./orthographic-center.utils', () => ({
  resolveCenterCoordinates: mocks.resolveCenterCoordinates
}));

describe('centerMapOnTableRow', () => {
  beforeEach(() => {
    mocks.duckQuery.mockReset();
    mocks.centerOnDataPoint.mockReset();
    mocks.basemapInitialize.mockReset();
    mocks.loadGeometryIntoDuckDB.mockReset();
    mocks.resolveCenterCoordinates.mockReset();
    mocks.resolveCenterCoordinates.mockImplementation(
      async ({ lon, lat }: { lon: number; lat: number }) => ({ x: lon, y: lat })
    );
  });

  it('uses a robust representative point query for polygonal geometries', async () => {
    const { centerMapOnTableRow } = await import('./center-on-table-row.utils');

    mocks.duckQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.columns')) {
        return [
          { column_name: '__id', data_type: 'BIGINT' },
          { column_name: 'geometry', data_type: 'GEOMETRY' }
        ];
      }

      if (sql.includes('FROM "cities"')) {
        return [{ basemap_id: null, lon: 2.35, lat: 48.86 }];
      }

      return [];
    });

    await centerMapOnTableRow({
      tableName: 'cities',
      rowId: 42
    });

    expect(mocks.duckQuery).toHaveBeenCalledWith(
      expect.stringContaining('ST_MaximumInscribedCircle("geometry").center'),
      { format: 'array', useProxy: false }
    );
    expect(mocks.duckQuery).toHaveBeenCalledWith(
      expect.stringContaining('ST_PointOnSurface("geometry")'),
      { format: 'array', useProxy: false }
    );
    expect(mocks.duckQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE __id = 42'),
      { format: 'array', useProxy: false }
    );
    expect(mocks.centerOnDataPoint).toHaveBeenCalledWith(2.35, 48.86);
  });

  it('does not center the map when no representative point is returned', async () => {
    const { centerMapOnTableRow } = await import('./center-on-table-row.utils');

    mocks.duckQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.columns')) {
        return [
          { column_name: '__id', data_type: 'BIGINT' },
          { column_name: 'geometry', data_type: 'GEOMETRY' }
        ];
      }

      if (sql.includes('FROM "cities"')) {
        return [{ basemap_id: null, lon: null, lat: null }];
      }

      return [];
    });

    await centerMapOnTableRow({
      tableName: 'cities',
      rowId: 42
    });

    expect(mocks.centerOnDataPoint).not.toHaveBeenCalled();
  });

  it('falls back to joined basemap geometry when the dataset row has no local geometry', async () => {
    const { centerMapOnTableRow } = await import('./center-on-table-row.utils');

    mocks.loadGeometryIntoDuckDB.mockResolvedValue('basemap_geom_europe_nuts');
    mocks.duckQuery.mockImplementation(async (sql: string) => {
      if (
        sql.includes('information_schema.columns') &&
        sql.includes("table_name = 'joined_table'")
      ) {
        return [
          { column_name: '__id', data_type: 'BIGINT' },
          { column_name: 'basemap_id', data_type: 'VARCHAR' }
        ];
      }

      if (
        sql.includes('FROM "joined_table"') &&
        sql.includes('WHERE __id = 42')
      ) {
        return [{ basemap_id: 'ES51', lon: null, lat: null }];
      }

      if (
        sql.includes('information_schema.columns') &&
        sql.includes("table_name = 'basemap_geom_europe_nuts'")
      ) {
        return [
          { column_name: '__feature_id__', data_type: 'VARCHAR' },
          { column_name: 'geometry', data_type: 'GEOMETRY' }
        ];
      }

      if (
        sql.includes('FROM "basemap_geom_europe_nuts"') &&
        sql.includes(`'ES51'`)
      ) {
        return [{ basemap_id: null, lon: 1.44, lat: 42.56 }];
      }

      return [];
    });

    await centerMapOnTableRow({
      tableName: 'joined_table',
      rowId: 42,
      joinedBasemap: 'europe-nuts2'
    });

    expect(mocks.basemapInitialize).toHaveBeenCalled();
    expect(mocks.loadGeometryIntoDuckDB).toHaveBeenCalledWith('europe-nuts2');
    expect(mocks.centerOnDataPoint).toHaveBeenCalledWith(1.44, 42.56);
  });

  it('falls back to GPS columns when the dataset is displayed as point data', async () => {
    const { centerMapOnTableRow } = await import('./center-on-table-row.utils');

    mocks.duckQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.columns')) {
        return [{ column_name: '__id', data_type: 'BIGINT' }];
      }

      if (
        sql.includes('TRY_CAST("lng" AS DOUBLE) AS lon') &&
        sql.includes('TRY_CAST("lat" AS DOUBLE) AS lat')
      ) {
        return [{ basemap_id: null, lon: 2.35, lat: 48.86 }];
      }

      return [];
    });

    await centerMapOnTableRow({
      tableName: 'gps_table',
      rowId: 42,
      gpsColumns: {
        lat: 'lat',
        lon: 'lng'
      }
    });

    expect(mocks.centerOnDataPoint).toHaveBeenCalledWith(2.35, 48.86);
  });

  it('centers on joined basemap rows backed by structured geom coordinates', async () => {
    const { centerMapOnTableRow } = await import('./center-on-table-row.utils');

    mocks.loadGeometryIntoDuckDB.mockResolvedValue('basemap_geom_world');
    mocks.duckQuery.mockImplementation(async (sql: string) => {
      if (
        sql.includes('information_schema.columns') &&
        sql.includes("table_name = 'joined_table'")
      ) {
        return [
          { column_name: '__id', data_type: 'BIGINT' },
          { column_name: 'basemap_id', data_type: 'VARCHAR' }
        ];
      }

      if (
        sql.includes('FROM "joined_table"') &&
        sql.includes('WHERE __id = 27')
      ) {
        return [{ basemap_id: 'FRA', geometry_value: null }];
      }

      if (
        sql.includes('information_schema.columns') &&
        sql.includes("table_name = 'basemap_geom_world'")
      ) {
        return [
          { column_name: 'id', data_type: 'VARCHAR' },
          { column_name: 'geom', data_type: 'STRUCT(x DOUBLE, y DOUBLE)[][][]' }
        ];
      }

      if (
        sql.includes('FROM "basemap_geom_world"') &&
        sql.includes(`'FRA'`) &&
        sql.includes('geometry_value')
      ) {
        return [
          {
            geometry_value: [
              [
                [
                  { x: 1, y: 2 },
                  { x: 5, y: 6 }
                ]
              ]
            ]
          }
        ];
      }

      return [];
    });

    await centerMapOnTableRow({
      tableName: 'joined_table',
      rowId: 27,
      joinedBasemap: 'world'
    });

    expect(mocks.centerOnDataPoint).toHaveBeenCalledWith(3, 4);
  });
});
