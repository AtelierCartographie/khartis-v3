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
  extractGeometryInfo,
  parseGeoJsonGeometry
} from '$lib/features/map/io/geometry-parser';
import {
  ArrowExtension,
  GeoArrowMetadataKey
} from '$lib/features/map/constants/map.constants';

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
  it('treats ogc.wkb as compatible with polygon metadata without forcing native geoarrow parsing', () => {
    logger.warn.mockClear();

    const geometryInfo = extractGeometryInfo(createWkbGeometryTable());

    expect(geometryInfo).toMatchObject({
      type: 'POLYGON',
      encoding: ArrowExtension.OGC_WKB,
      isNativeGeoArrow: false,
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
});
