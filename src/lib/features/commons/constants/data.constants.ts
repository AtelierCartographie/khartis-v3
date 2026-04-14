/**
 * Data-related constants
 *
 * Column types, semio types, and other data classification constants.
 */

/**
 * Reserved column names used internally by Khartis.
 *
 * - ID: Internal row identifier added by DuckDB reader
 * - FEATURE_ID: Stable per-feature identifier injected on custom basemap tables,
 *   decoupled from the user-chosen join column (cf. issue #87).
 * - GEOM: Default geometry column name (output from ST_Read, ST_Transform, etc.)
 * - GEOMETRY: Alternative geometry column name (used by some GDAL drivers)
 * - WKB_GEOMETRY: WKB geometry column name (standard GDAL output)
 * - THE_GEOM: Legacy geometry column name (PostGIS, GeoServer)
 */
export const INTERNAL_COLUMN = {
  ID: '__id',
  FEATURE_ID: '__feature_id__',
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
  INTERNAL_COLUMN.ID,
  INTERNAL_COLUMN.FEATURE_ID
] as const;

/**
 * Column type identifier for geometry columns.
 * Used across type_simple fields in analysis results and column metadata.
 */
export const COLUMN_TYPE_GEOMETRY = 'geometry' as const;

/**
 * Geo column type discriminators used by `GeoColumnResult.type`.
 * Persisted indirectly through dataset analysis — values must stay stable.
 */
export const GEO_COLUMN_TYPE = {
  LATITUDE: 'latitude',
  LONGITUDE: 'longitude',
  COUNTRY_NAME: 'country_name',
  ISO2: 'iso2',
  ISO3: 'iso3',
  NUTS: 'nuts',
  REGION: 'region',
  CITY: 'city',
  COORDINATES: 'coordinates',
  UNKNOWN: 'unknown'
} as const;

export type GeoColumnTypeValue =
  (typeof GEO_COLUMN_TYPE)[keyof typeof GEO_COLUMN_TYPE];
