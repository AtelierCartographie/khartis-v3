import { Field, Schema, Table, vectorFromArray } from 'apache-arrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArrowExtension, GeoArrowMetadataKey } from '../constants';
import {
  calculateBoundsFromGeoArrow,
  calculateBoundsFromGeoArrowRows
} from './bounds';
import {
  parsePaths,
  parsePointData,
  parseSolidPolygons
} from '../utils/geoarrow-stream-bridge.utils';

vi.mock('../utils/geoarrow-stream-bridge.utils', () => ({
  parsePaths: vi.fn(),
  parsePointData: vi.fn(),
  parseSolidPolygons: vi.fn()
}));

function withGeoArrowMetadata(
  table: Table,
  geoColumn: string,
  extensionName: ArrowExtension,
  geometryType: string
): Table {
  const schemaMetadata = new Map(table.schema.metadata);
  schemaMetadata.set(
    GeoArrowMetadataKey.GEO,
    JSON.stringify({
      primary_column: geoColumn,
      columns: {
        [geoColumn]: {
          encoding: extensionName,
          geometry_types: [geometryType]
        }
      }
    })
  );

  const fields = table.schema.fields.map((field) => {
    const fieldMetadata = new Map(field.metadata);
    if (field.name === geoColumn) {
      fieldMetadata.set(GeoArrowMetadataKey.EXTENSION_NAME, extensionName);
    }
    return new Field(field.name, field.type, field.nullable, fieldMetadata);
  });

  return new Table(new Schema(fields, schemaMetadata), table.batches);
}

beforeEach(() => {
  vi.mocked(parsePaths).mockReset();
  vi.mocked(parsePointData).mockReset();
  vi.mocked(parseSolidPolygons).mockReset();
});

describe('calculateBoundsFromGeoArrow', () => {
  it('pads single-point bounds instead of falling back to unrelated columns', () => {
    const table = new Table({
      geom: vectorFromArray([
        JSON.stringify({
          type: 'Point',
          coordinates: [5.37, 43.3]
        })
      ]),
      city_name: vectorFromArray(['Marseille']),
      category: vectorFromArray(['PUBLIC'])
    });

    const bounds = calculateBoundsFromGeoArrow(table) as
      [[number, number], [number, number]] | null;

    expect(bounds).not.toBeNull();
    expect(bounds?.[0][0]).toBeCloseTo(5.36, 6);
    expect(bounds?.[0][1]).toBeCloseTo(43.29, 6);
    expect(bounds?.[1][0]).toBeCloseTo(5.38, 6);
    expect(bounds?.[1][1]).toBeCloseTo(43.31, 6);
  });

  it('can calculate bounds for a subset of GeoArrow rows', () => {
    const table = new Table({
      geom: vectorFromArray([
        JSON.stringify({
          type: 'Point',
          coordinates: [2.35, 48.85]
        }),
        JSON.stringify({
          type: 'Point',
          coordinates: [13.4, 52.52]
        }),
        JSON.stringify({
          type: 'Point',
          coordinates: [-74, 40.71]
        })
      ]),
      id: vectorFromArray(['FRA', 'DEU', 'USA'])
    });

    const bounds = calculateBoundsFromGeoArrowRows(
      table,
      (rowIndex) => rowIndex < 2
    ) as [[number, number], [number, number]] | null;

    expect(bounds).toEqual([
      [2.35, 48.85],
      [13.4, 52.52]
    ]);
  });

  it('uses native GeoArrow binary data for matched row bounds without materializing GeoJSON', () => {
    const table = withGeoArrowMetadata(
      new Table({
        geometry: vectorFromArray([null, null, null]),
        id: vectorFromArray(['outside', 'matched-east', 'matched-west'])
      }),
      'geometry',
      ArrowExtension.GEOARROW_POLYGON,
      'Polygon'
    );

    vi.mocked(parseSolidPolygons).mockReturnValue({
      length: 3,
      positions: new Float32Array([
        0, 0, 2, 0, 2, 2, 10, 10, 12, 10, 12, 12, -5, -5, -3, -5, -3, -3
      ]),
      polygonIndices: new Uint32Array([0, 3, 6, 9]),
      holeIndices: new Uint32Array([0, 3, 6]),
      featureIds: new Uint32Array([0, 1, 2]),
      size: 2
    });

    const bounds = calculateBoundsFromGeoArrowRows(
      table,
      (rowIndex) => rowIndex === 1 || rowIndex === 2
    );

    expect(bounds).toEqual([
      [-5, -5],
      [12, 12]
    ]);
    expect(parseSolidPolygons).toHaveBeenCalledWith(table);
    expect(parsePaths).not.toHaveBeenCalled();
    expect(parsePointData).not.toHaveBeenCalled();
  });
});
