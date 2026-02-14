/**
 * Data-related constants
 *
 * Column types, semio types, and other data classification constants.
 */

export const COLUMN_TYPE_SIMPLE = {
  NUMERIC: 'numeric',
  DATE: 'date',
  STRING: 'string',
  BOOLEAN: 'boolean',
  INTEGER: 'integer',
  BIGINT: 'bigint',
  TEXT: 'text',
  NUMBER: 'number'
} as const;

export type ColumnTypeSimpleValue =
  (typeof COLUMN_TYPE_SIMPLE)[keyof typeof COLUMN_TYPE_SIMPLE];

export const SEMIO_TYPE = {
  GEOID: 'geoid',
  GEOLAT: 'geolat',
  GEOLON: 'geolon',
  QTA: 'QTA',
  QTR: 'QTR',
  QL: 'QL',
  QLO: 'QLO'
} as const;

export type SemioTypeValue = (typeof SEMIO_TYPE)[keyof typeof SEMIO_TYPE];

export const GEO_DETECTION_TYPE = {
  LATITUDE: 'latitude',
  LONGITUDE: 'longitude',
  COORDINATES: 'coordinates',
  GEOMETRY: 'geometry'
} as const;

export type GeoDetectionTypeValue =
  (typeof GEO_DETECTION_TYPE)[keyof typeof GEO_DETECTION_TYPE];

export const SORT_ORDER = {
  ASC: 'ASC',
  DESC: 'DESC'
} as const;

export type SortOrderValue = (typeof SORT_ORDER)[keyof typeof SORT_ORDER];

export const PALETTE_TYPE = {
  SEQUENTIAL: 'sequential',
  DIVERGING: 'diverging',
  QUALITATIVE: 'qualitative'
} as const;

export type PaletteTypeValue = (typeof PALETTE_TYPE)[keyof typeof PALETTE_TYPE];

export const CLASSIFICATION_METHOD = {
  EQUAL_INTERVAL: 'equal_interval',
  QUANTILES: 'quantiles',
  MANUAL: 'manual',
  JENKS: 'jenks',
  STANDARD_DEVIATION: 'standard_deviation'
} as const;

export type ClassificationMethodValue =
  (typeof CLASSIFICATION_METHOD)[keyof typeof CLASSIFICATION_METHOD];

/**
 * Reserved column names used internally by Khartis.
 *
 * - ID: Internal row identifier added by DuckDB reader
 * - GEOM: Default geometry column name (output from ST_Read, ST_Transform, etc.)
 * - GEOMETRY: Alternative geometry column name (used by some GDAL drivers)
 * - WKB_GEOMETRY: WKB geometry column name (standard GDAL output)
 * - THE_GEOM: Legacy geometry column name (PostGIS, GeoServer)
 */
export const INTERNAL_COLUMN = {
  ID: '__id',
  GEOM: 'geom',
  GEOMETRY: 'geometry',
  WKB_GEOMETRY: 'wkb_geometry',
  THE_GEOM: 'the_geom'
} as const;

/**
 * All possible geometry column names for auto-detection.
 *
 * Used to identify geometry columns in imported data when metadata is missing.
 * Ordered roughly by frequency of occurrence (most common first).
 */
export const GEO_COLUMN_NAMES = [
  INTERNAL_COLUMN.GEOM,
  INTERNAL_COLUMN.GEOMETRY,
  INTERNAL_COLUMN.WKB_GEOMETRY,
  INTERNAL_COLUMN.THE_GEOM,
  'geo',
  'shape',
  'geo_point_2d',
  'geo_shape',
  'coordinates',
  'location',
  'point',
  'position'
] as const;

/**
 * Columns excluded from user-facing table displays and operations.
 * Includes internal metadata columns and geometry columns.
 */
export const EXCLUDED_COLUMNS = [
  INTERNAL_COLUMN.GEOM,
  INTERNAL_COLUMN.GEOMETRY,
  INTERNAL_COLUMN.ID
] as const;

/**
 * Column type identifier for geometry columns.
 * Used across type_simple fields in analysis results and column metadata.
 */
export const COLUMN_TYPE_GEOMETRY = 'geometry' as const;

export const SIMPLIFIED_GEOMETRY_TYPE = {
  POINT: 'point',
  LINE: 'line',
  POLYGON: 'polygon'
} as const;

export type SimplifiedGeometryTypeValue =
  (typeof SIMPLIFIED_GEOMETRY_TYPE)[keyof typeof SIMPLIFIED_GEOMETRY_TYPE];
