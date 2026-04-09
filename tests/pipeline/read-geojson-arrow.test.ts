import { describe, expect, it, vi } from 'vitest';
import {
  Binary,
  Field,
  FixedSizeList,
  Float64,
  List,
  Schema,
  Table
} from 'apache-arrow/Arrow';
import { addGeoArrowMetadata } from '$lib/features/map/utils/read-geojson-arrow';
import {
  ArrowExtension,
  GeoArrowMetadataKey
} from '$lib/features/map/constants/map.constants';

vi.mock('$lib/features/duckdb', () => ({
  Duck: {},
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326'
  }
}));

vi.mock('$lib/features/duckdb/io/reprojection', () => ({
  isProjectionSupported: () => true,
  reprojectPoint: (point: [number, number]) => point
}));

function createCoordType(): FixedSizeList {
  return new FixedSizeList(2, new Field('xy', new Float64()));
}

function createGeometryTable(geometryType: List | FixedSizeList): Table {
  return new Table(new Schema([new Field('geometry', geometryType)]), []);
}

function getGeometryExtension(table: Table): string | undefined {
  return table.schema.fields[0]?.metadata?.get(
    GeoArrowMetadataKey.EXTENSION_NAME
  );
}

function getGeometryExtensionMetadata(table: Table): string | undefined {
  return table.schema.fields[0]?.metadata?.get('ARROW:extension:metadata');
}

describe('addGeoArrowMetadata', () => {
  it('keeps native polygon fields mapped to geoarrow.polygon', () => {
    const coordType = createCoordType();
    const polygonType = new List(
      new Field('rings', new List(new Field('vertices', coordType)))
    );

    const table = addGeoArrowMetadata(createGeometryTable(polygonType));

    expect(getGeometryExtension(table)).toBe(ArrowExtension.GEOARROW_POLYGON);
  });

  it('keeps native multipolygon fields mapped to geoarrow.multipolygon', () => {
    const coordType = createCoordType();
    const multipolygonType = new List(
      new Field(
        'polygons',
        new List(new Field('rings', new List(new Field('vertices', coordType))))
      )
    );

    const table = addGeoArrowMetadata(createGeometryTable(multipolygonType));

    expect(getGeometryExtension(table)).toBe(
      ArrowExtension.GEOARROW_MULTIPOLYGON
    );
  });

  it('normalizes ogc.wkb metadata to geoarrow.wkb for downstream binary rendering', () => {
    const metadata = new Map<string, string>([
      [GeoArrowMetadataKey.EXTENSION_NAME, ArrowExtension.OGC_WKB]
    ]);
    const table = new Table(
      new Schema([new Field('geometry', new Binary(), true, metadata)]),
      []
    );

    const normalizedTable = addGeoArrowMetadata(table);

    expect(getGeometryExtension(normalizedTable)).toBe(
      ArrowExtension.GEOARROW_WKB
    );
    expect(getGeometryExtensionMetadata(normalizedTable)).toContain(
      '"geometry_type":"Polygon"'
    );
  });

  it('prefers the native polygon type when a struct geometry is mislabeled as ogc.wkb', () => {
    const coordType = createCoordType();
    const polygonType = new List(
      new Field('rings', new List(new Field('vertices', coordType)))
    );
    const metadata = new Map<string, string>([
      [GeoArrowMetadataKey.EXTENSION_NAME, ArrowExtension.OGC_WKB]
    ]);
    const table = new Table(
      new Schema([new Field('geometry', polygonType, true, metadata)]),
      []
    );

    const normalizedTable = addGeoArrowMetadata(table);

    expect(getGeometryExtension(normalizedTable)).toBe(
      ArrowExtension.GEOARROW_POLYGON
    );
    expect(getGeometryExtensionMetadata(normalizedTable)).toContain(
      '"geometry_type":"Polygon"'
    );
  });

  it('defaults binary geometry columns without metadata to geoarrow.wkb', () => {
    const table = new Table(
      new Schema([new Field('geometry', new Binary(), true)]),
      []
    );

    const normalizedTable = addGeoArrowMetadata(table);

    expect(getGeometryExtension(normalizedTable)).toBe(
      ArrowExtension.GEOARROW_WKB
    );
    expect(getGeometryExtensionMetadata(normalizedTable)).toContain(
      '"geometry_type":"Polygon"'
    );
  });

  it('keeps binary geometry columns on geoarrow.wkb even with GeoParquet encoding hints', () => {
    const table = new Table(
      new Schema([new Field('geometry', new Binary(), true)]),
      []
    );

    const normalizedTable = addGeoArrowMetadata(table, 'multipolygon');

    expect(getGeometryExtension(normalizedTable)).toBe(
      ArrowExtension.GEOARROW_WKB
    );
    expect(getGeometryExtensionMetadata(normalizedTable)).toContain(
      '"geometry_type":"Polygon"'
    );
  });
});
