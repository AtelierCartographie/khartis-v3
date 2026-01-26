/**
 * Geometry type constants
 *
 * Standard geometry type strings used throughout the application.
 * Supports both OGC Simple Features and DuckDB Spatial formats.
 */

// Column type identifiers
export const GEOMETRY_COLUMN_TYPE = 'GEOMETRY';
export const GEOMETRY_COLUMN_NAMES = ['geom', 'geometry'] as const;

// OGC Simple Features geometry types (PostGIS style)
export const GEOMETRY_TYPES = {
  POINT: 'ST_Point',
  MULTI_POINT: 'ST_MultiPoint',
  LINE_STRING: 'ST_LineString',
  MULTI_LINE_STRING: 'ST_MultiLineString',
  POLYGON: 'ST_Polygon',
  MULTI_POLYGON: 'ST_MultiPolygon',
  GEOMETRY_COLLECTION: 'ST_GeometryCollection'
} as const;

// WKT/WKB uppercase variants (standard format)
export const GEOMETRY_WKT_TYPES = {
  POINT: 'POINT',
  MULTI_POINT: 'MULTIPOINT',
  LINE_STRING: 'LINESTRING',
  MULTI_LINE_STRING: 'MULTILINESTRING',
  POLYGON: 'POLYGON',
  MULTI_POLYGON: 'MULTIPOLYGON',
  GEOMETRY_COLLECTION: 'GEOMETRYCOLLECTION'
} as const;

// All valid geometry type strings (for validation)
export const ALL_GEOMETRY_TYPES = [
  ...Object.values(GEOMETRY_TYPES),
  ...Object.values(GEOMETRY_WKT_TYPES)
] as const;

// Geometry type pairs (OGC <-> WKT mappings)
export const GEOMETRY_TYPE_PAIRS = [
  { ogc: GEOMETRY_TYPES.POINT, wkt: GEOMETRY_WKT_TYPES.POINT },
  { ogc: GEOMETRY_TYPES.MULTI_POINT, wkt: GEOMETRY_WKT_TYPES.MULTI_POINT },
  { ogc: GEOMETRY_TYPES.LINE_STRING, wkt: GEOMETRY_WKT_TYPES.LINE_STRING },
  {
    ogc: GEOMETRY_TYPES.MULTI_LINE_STRING,
    wkt: GEOMETRY_WKT_TYPES.MULTI_LINE_STRING
  },
  { ogc: GEOMETRY_TYPES.POLYGON, wkt: GEOMETRY_WKT_TYPES.POLYGON },
  { ogc: GEOMETRY_TYPES.MULTI_POLYGON, wkt: GEOMETRY_WKT_TYPES.MULTI_POLYGON }
] as const;

// Helper type for geometry type checking
export type GeometryType = (typeof ALL_GEOMETRY_TYPES)[number];
export type OGCGeometryType =
  (typeof GEOMETRY_TYPES)[keyof typeof GEOMETRY_TYPES];
export type WKTGeometryType =
  (typeof GEOMETRY_WKT_TYPES)[keyof typeof GEOMETRY_WKT_TYPES];

/**
 * Check if a type string matches a geometry type (OGC or WKT variant)
 */
export function isGeometryType(
  type: string,
  geometryType: keyof typeof GEOMETRY_TYPES
): boolean {
  const ogc = GEOMETRY_TYPES[geometryType];
  const wkt = GEOMETRY_WKT_TYPES[geometryType];
  return type === ogc || type === wkt;
}

/**
 * Check if any type in array matches a geometry type
 */
export function hasGeometryType(
  types: string[],
  geometryType: keyof typeof GEOMETRY_TYPES
): boolean {
  return types.some((t) => isGeometryType(t, geometryType));
}

/**
 * Normalize geometry type string to OGC format
 */
export function normalizeGeometryType(type: string): OGCGeometryType | null {
  const pair = GEOMETRY_TYPE_PAIRS.find(
    (p) => p.ogc === type || p.wkt === type
  );
  return pair ? pair.ogc : null;
}

/**
 * Check if geometry type is a point type (Point or MultiPoint)
 */
export function isPointGeometry(type: string): boolean {
  return isGeometryType(type, 'POINT') || isGeometryType(type, 'MULTI_POINT');
}

/**
 * Check if geometry type is a line type (LineString or MultiLineString)
 */
export function isLineGeometry(type: string): boolean {
  return (
    isGeometryType(type, 'LINE_STRING') ||
    isGeometryType(type, 'MULTI_LINE_STRING')
  );
}

/**
 * Check if geometry type is a polygon type (Polygon or MultiPolygon)
 */
export function isPolygonGeometry(type: string): boolean {
  return (
    isGeometryType(type, 'POLYGON') || isGeometryType(type, 'MULTI_POLYGON')
  );
}
