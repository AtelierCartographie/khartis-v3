export const GEOMETRY_COLUMN_TYPE = 'GEOMETRY';

export const GEOMETRY_TYPES = {
  POINT: 'ST_Point',
  MULTI_POINT: 'ST_MultiPoint',
  LINE_STRING: 'ST_LineString',
  MULTI_LINE_STRING: 'ST_MultiLineString',
  POLYGON: 'ST_Polygon',
  MULTI_POLYGON: 'ST_MultiPolygon',
  GEOMETRY_COLLECTION: 'ST_GeometryCollection'
} as const;

export const GEOMETRY_WKT_TYPES = {
  POINT: 'POINT',
  MULTI_POINT: 'MULTIPOINT',
  LINE_STRING: 'LINESTRING',
  MULTI_LINE_STRING: 'MULTILINESTRING',
  POLYGON: 'POLYGON',
  MULTI_POLYGON: 'MULTIPOLYGON',
  GEOMETRY_COLLECTION: 'GEOMETRYCOLLECTION'
} as const;

export function isGeometryType(
  type: string,
  geometryType: keyof typeof GEOMETRY_TYPES
): boolean {
  const ogc = GEOMETRY_TYPES[geometryType];
  const wkt = GEOMETRY_WKT_TYPES[geometryType];
  return type === ogc || type === wkt;
}

export function hasGeometryType(
  types: string[],
  geometryType: keyof typeof GEOMETRY_TYPES
): boolean {
  return types.some((t) => isGeometryType(t, geometryType));
}
