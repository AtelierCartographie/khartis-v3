import { describe, expect, it, vi } from 'vitest';
import { Binary, Field, Schema, Table } from 'apache-arrow/Arrow';

const { logger } = vi.hoisted(() => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn()
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    MAP: 'MAP'
  },
  logger
}));

import {
  arrowTableToGeoJSON,
  extractGeometryInfo,
  parseGeoJsonGeometry
} from '$lib/features/map/io/geometry-parser';
import { calculateBoundsFromGeoArrow } from '$lib/features/map/core/bounds';
import {
  ArrowExtension,
  GeoArrowMetadataKey
} from '$lib/features/map/constants/map.constants';

function createPointWkb(lng: number, lat: number): number[] {
  const buffer = new ArrayBuffer(21);
  const view = new DataView(buffer);

  view.setUint8(0, 1);
  view.setUint32(1, 1, true);
  view.setFloat64(5, lng, true);
  view.setFloat64(13, lat, true);

  return Array.from(new Uint8Array(buffer));
}

function createWkbGeometryTable(): Table {
  const metadata = new Map<string, string>([
    [GeoArrowMetadataKey.EXTENSION_NAME, ArrowExtension.OGC_WKB]
  ]);
  const geoMetadata = {
    version: '1.0.0',
    primary_column: 'geometry',
    columns: {
      geometry: {
        encoding: ArrowExtension.GEOARROW_WKB,
        geometry_types: ['Polygon'],
        crs: {
          type: 'name',
          properties: {
            name: 'EPSG:4326'
          }
        },
        bbox: [-180, -90, 180, 90]
      }
    }
  };

  return new Table(
    new Schema(
      [new Field('geometry', new Binary(), true, metadata)],
      new Map([[GeoArrowMetadataKey.GEO, JSON.stringify(geoMetadata)]])
    ),
    []
  );
}

describe('extractGeometryInfo', () => {
  it('normalizes ogc.wkb metadata to geoarrow.wkb so WKB data stays on the binary path', () => {
    logger.warn.mockClear();

    const geometryInfo = extractGeometryInfo(createWkbGeometryTable());

    expect(geometryInfo).toMatchObject({
      type: 'POLYGON',
      encoding: ArrowExtension.GEOARROW_WKB,
      isNativeGeoArrow: true,
      isWkbEncoded: true
    });
    expect(
      logger.warn.mock.calls.some(
        ([message]) => message === 'Geometry extension mismatch detected'
      )
    ).toBe(false);
  });

  it('parses WKB byte arrays coming from Arrow List vectors before trying native GeoArrow decoding', () => {
    expect(
      parseGeoJsonGeometry([
        1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 240, 63, 0, 0, 0, 0, 0, 0, 0, 64
      ])
    ).toEqual({
      type: 'Point',
      coordinates: [1, 2]
    });
  });

  it('unwraps Arrow-style iterables of {x, y} structs into native polygon coordinates', () => {
    const polygonValue = {
      toArray: () => ({
        [Symbol.iterator]: function* () {
          yield {
            [Symbol.iterator]: function* () {
              yield { x: 0, y: 0 };
              yield { x: 1, y: 0 };
              yield { x: 1, y: 1 };
              yield { x: 0, y: 0 };
            }
          };
        }
      })
    };

    expect(parseGeoJsonGeometry(polygonValue)).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0]
        ]
      ]
    });
  });

  it('skips unreadable geometry rows instead of aborting the whole GeoJSON conversion', () => {
    const pointWkb = createPointWkb(1, 2);
    const table = {
      numRows: 3,
      schema: {
        fields: [{ name: 'geometry' }, { name: 'name' }]
      },
      getChild: (name: string) => {
        if (name === 'geometry') {
          return {
            get: (index: number) => {
              if (index === 1) {
                throw new Error('corrupted row');
              }

              return pointWkb;
            }
          };
        }

        if (name === 'name') {
          return {
            get: (index: number) => `row-${index}`
          };
        }

        return null;
      }
    } as unknown as Table;

    const geojson = arrowTableToGeoJSON(table, 'geometry');

    expect(geojson?.features).toHaveLength(2);
    expect(
      geojson?.features.map((feature) => feature.properties?.name)
    ).toEqual(['row-0', 'row-2']);
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to read geometry row from Arrow vector',
      'MAP',
      expect.objectContaining({ geoColumn: 'geometry', rowIndex: 1 })
    );
  });

  it('keeps calculating bounds when a sampled geometry row is unreadable', () => {
    const pointWkbA = createPointWkb(1, 2);
    const pointWkbB = createPointWkb(3, 4);
    const table = {
      numRows: 3,
      schema: {
        fields: [{ name: 'geometry' }],
        metadata: new Map([
          [
            GeoArrowMetadataKey.GEO,
            JSON.stringify({
              version: '1.0.0',
              primary_column: 'geometry',
              columns: {
                geometry: {
                  bbox: [-180, -90, 180, 90]
                }
              }
            })
          ]
        ])
      },
      getChild: () => ({
        get: (index: number) => {
          if (index === 1) {
            throw new Error('corrupted row');
          }

          return index === 0 ? pointWkbA : pointWkbB;
        }
      })
    } as unknown as Table;

    expect(calculateBoundsFromGeoArrow(table)).toEqual([
      [1, 2],
      [3, 4]
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to read geometry row during bounds calculation',
      'MAP',
      expect.objectContaining({ geoColumn: 'geometry', rowIndex: 1 })
    );
  });
});
