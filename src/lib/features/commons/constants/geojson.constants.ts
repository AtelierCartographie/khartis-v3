/**
 * GeoJSON type constants
 *
 * Standard GeoJSON geometry and feature type strings.
 * Centralizes all GeoJSON type literals used for feature creation,
 * parsing, and type checking.
 */

export const GEOJSON_TYPE = {
  FEATURE: 'Feature',
  FEATURE_COLLECTION: 'FeatureCollection',
  POINT: 'Point',
  MULTI_POINT: 'MultiPoint',
  LINE_STRING: 'LineString',
  MULTI_LINE_STRING: 'MultiLineString',
  POLYGON: 'Polygon',
  MULTI_POLYGON: 'MultiPolygon',
  GEOMETRY_COLLECTION: 'GeometryCollection',
  SPHERE: 'Sphere'
} as const;

export type GeoJsonTypeName = (typeof GEOJSON_TYPE)[keyof typeof GEOJSON_TYPE];

export const SIMPLE_GEOMETRY_TYPES = [
  GEOJSON_TYPE.POINT,
  GEOJSON_TYPE.MULTI_POINT,
  GEOJSON_TYPE.LINE_STRING,
  GEOJSON_TYPE.MULTI_LINE_STRING,
  GEOJSON_TYPE.POLYGON,
  GEOJSON_TYPE.MULTI_POLYGON
] as const;
