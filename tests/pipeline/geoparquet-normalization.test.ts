import { describe, expect, it, vi } from 'vitest';
import { normalizeGeoParquetTable } from '$lib/features/data-pipeline/operations/geoparquet';
import type {
  GeoParquetCrsMetadata,
  GeoParquetMeta
} from '$lib/features/map/services/geo-parquet-metadata.service';

function createDuck(columnType: string) {
  return {
    query: vi.fn().mockResolvedValue(undefined),
    describe_table: vi.fn().mockResolvedValue({
      name: ['name', 'geom'],
      type: ['VARCHAR', columnType]
    }),
    invalidateTableCache: vi.fn()
  };
}

function createMetadata(
  encoding: string,
  crs?: GeoParquetCrsMetadata
): GeoParquetMeta {
  return {
    primary_column: 'geom',
    columns: {
      geom: {
        encoding,
        geometry_types: ['MultiLineString'],
        bbox: [-10, -5, 10, 5],
        crs
      }
    }
  };
}

describe('GeoParquet geometry normalization', () => {
  it('should convert separated MultiLineString coordinates to DuckDB geometry', async () => {
    const Duck = createDuck('STRUCT(x DOUBLE, y DOUBLE)[][]');

    await expect(
      normalizeGeoParquetTable(
        'uploaded_geoparquet',
        createMetadata('multilinestring'),
        Duck
      )
    ).resolves.toBe(true);

    expect(Duck.query).toHaveBeenCalledOnce();
    const sql = Duck.query.mock.calls[0][0] as string;
    expect(sql).toContain('ST_GeomFromGeoJSON');
    expect(sql).toContain("'MultiLineString'");
    expect(sql).toContain(
      'list_transform("geom", coordinate_0 -> list_transform(coordinate_0, coordinate_1 -> [coordinate_1.x, coordinate_1.y]))'
    );
    expect(Duck.invalidateTableCache).toHaveBeenCalledWith(
      'uploaded_geoparquet'
    );
  });

  it('should convert WKB geometry and reproject a declared source CRS', async () => {
    const Duck = createDuck('BLOB');

    await normalizeGeoParquetTable(
      'projected_geoparquet',
      createMetadata('WKB', {
        type: 'ProjectedCRS',
        id: { authority: 'EPSG', code: 3857 }
      }),
      Duck
    );

    expect(Duck.query.mock.calls[0][0]).toContain(
      `ST_Transform(ST_GeomFromWKB("geom"), 'EPSG:3857', 'EPSG:4326', true)`
    );
  });

  it('should leave WKB geometry untouched when DuckDB already decoded it', async () => {
    const Duck = createDuck("GEOMETRY('EPSG:2154')");

    await expect(
      normalizeGeoParquetTable(
        'native_geoparquet',
        createMetadata('WKB', {
          type: 'ProjectedCRS',
          id: { authority: 'EPSG', code: 2154 }
        }),
        Duck
      )
    ).resolves.toBe(false);

    expect(Duck.query).not.toHaveBeenCalled();
    expect(Duck.invalidateTableCache).not.toHaveBeenCalled();
  });

  it('should leave plain Parquet tables unchanged when GeoParquet metadata is absent', async () => {
    const Duck = createDuck('VARCHAR');

    await expect(
      normalizeGeoParquetTable('plain_parquet', {}, Duck)
    ).resolves.toBe(false);

    expect(Duck.describe_table).not.toHaveBeenCalled();
    expect(Duck.query).not.toHaveBeenCalled();
  });

  it('should reject unsupported GeoParquet encodings instead of rendering a blank map', async () => {
    const Duck = createDuck('VARCHAR');

    await expect(
      normalizeGeoParquetTable(
        'invalid_geoparquet',
        createMetadata('unsupported'),
        Duck
      )
    ).rejects.toMatchObject({
      name: 'DataValidationError',
      details: expect.objectContaining({
        encoding: 'unsupported',
        reason: 'Unsupported GeoParquet geometry encoding'
      })
    });
  });
});
