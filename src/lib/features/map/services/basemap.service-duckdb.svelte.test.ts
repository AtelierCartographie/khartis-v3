import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryMock: vi.fn(),
  registerFilesMock: vi.fn(),
  registerFileBufferMock: vi.fn(),
  readGeofileMock: vi.fn(),
  registeredFiles: new Set<string>()
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    get db() {
      return {
        registerFileBuffer: mocks.registerFileBufferMock
      };
    },
    get registered_files() {
      return mocks.registeredFiles;
    },
    query: mocks.queryMock,
    register_files: mocks.registerFilesMock,
    read_geofile: mocks.readGeofileMock
  },
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326',
    WEB_MERCATOR_CRS: 'EPSG:3857'
  }
}));

vi.mock('./read-geojson-arrow.service', () => ({
  readGeoParquetDirect: vi.fn()
}));

vi.mock('../io/geometry-parser', () => ({
  arrowTableToGeoJSON: vi.fn()
}));

const { basemapService } = await import('./basemap.service.svelte');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-29T00:00:00.000Z'));
  basemapService.reset();
  basemapService.clearCache();
  mocks.registeredFiles.clear();

  mocks.registerFilesMock.mockImplementation(async (files: File[]) => {
    Object.defineProperty(files[0], 'id', {
      value: 'duck-file-id',
      configurable: true
    });
  });
  mocks.readGeofileMock.mockResolvedValue(
    'tmp_basemap_geom_monde_countries_2024_medium_1777420800000'
  );
  mocks.queryMock.mockResolvedValue([]);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('all-basemaps-metadata.json')) {
        return new Response(
          JSON.stringify([
            {
              file: 'monde-countries-2024-medium',
              entity_count: 249,
              layers: []
            }
          ])
        );
      }

      return new Response(new Uint8Array([1, 2, 3, 4]));
    })
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('basemapService.ensureAttributesLoaded', () => {
  it('flattens deduplicated parquet attributes with metadata counts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('all-basemaps-metadata.json')) {
          return new Response(
            JSON.stringify([
              {
                file: 'monde-countries-2024-medium',
                entity_count: 249,
                layers: []
              }
            ])
          );
        }
        if (
          url.includes('projection-presets.json') ||
          url.includes('style-presets.json')
        ) {
          return new Response(JSON.stringify({}));
        }

        return new Response(new Uint8Array([1, 2, 3, 4]));
      })
    );

    await basemapService.ensureAttributesLoaded();

    const queries = mocks.queryMock.mock.calls.map(([sql]) => String(sql));
    const createAttributesQuery = queries.find((sql) =>
      sql.includes('CREATE OR REPLACE TABLE basemap_attributes AS')
    );

    expect(createAttributesQuery).toBeDefined();
    expect(createAttributesQuery).toContain(
      "FROM parquet_scan('duck-file-id')"
    );
    expect(createAttributesQuery).toContain('UNNEST(basemaps) AS basemap');
    expect(createAttributesQuery).toContain(
      "('monde-countries-2024-medium', 249)"
    );
    expect(createAttributesQuery).toContain('basemap_count');

    expect(createAttributesQuery).not.toContain('__row_idx__');
    expect(createAttributesQuery).not.toContain('file_row_number');
    expect(createAttributesQuery).not.toContain('__group_id__');
    expect(createAttributesQuery).not.toContain('__real_id__');
  });
});

describe('basemapService.loadGeometryIntoDuckDB', () => {
  it('loads catalog basemaps through DuckDB read_parquet when ST_Read cannot open GeoParquet', async () => {
    mocks.queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes("ST_Read('khartis_basemap_")) {
        throw new Error('GDAL cannot open GeoParquet in DuckDB WASM');
      }
      if (
        sql.includes('information_schema.columns') &&
        sql.includes(
          'tmp_basemap_geom_monde_countries_2024_medium_1777420800000_raw'
        )
      ) {
        return [
          { column_name: 'id', data_type: 'VARCHAR' },
          {
            column_name: 'geom',
            data_type: 'STRUCT(x DOUBLE, y DOUBLE)[][][]'
          }
        ];
      }
      if (sql.includes('information_schema.columns')) {
        return [
          { column_name: 'id', data_type: 'BIGINT' },
          { column_name: 'geom', data_type: 'GEOMETRY' }
        ];
      }

      return [];
    });

    const tableName = await basemapService.loadGeometryIntoDuckDB(
      'monde-countries-2024-medium'
    );
    const queries = mocks.queryMock.mock.calls.map(([sql]) => String(sql));

    expect(tableName).toBe('basemap_geom_monde_countries_2024_medium');
    expect(mocks.registerFileBufferMock).toHaveBeenCalledWith(
      'khartis_basemap_monde_countries_2024_medium.parquet',
      expect.any(Uint8Array)
    );
    expect(queries).toContainEqual(
      expect.stringContaining(
        `CREATE OR REPLACE TEMP TABLE "tmp_basemap_geom_monde_countries_2024_medium_1777420800000" AS SELECT * FROM ST_Read('khartis_basemap_monde_countries_2024_medium.parquet')`
      )
    );
    expect(queries).toContainEqual(
      expect.stringContaining(
        `CREATE OR REPLACE TEMP TABLE "tmp_basemap_geom_monde_countries_2024_medium_1777420800000_raw" AS SELECT * FROM read_parquet('khartis_basemap_monde_countries_2024_medium.parquet')`
      )
    );
    expect(queries).toContainEqual(
      expect.stringContaining('ST_GeomFromText(geom_wkt.wkt)')
    );
    expect(queries).toContainEqual(expect.stringContaining('MULTIPOLYGON ('));
    expect(mocks.readGeofileMock).not.toHaveBeenCalled();
  });
});
