export const INTERNAL_COLUMN = {
  ID: '__id',
  FEATURE_ID: '__feature_id__',
  GEOM: 'geom',
  GEOMETRY: 'geometry',
  WKB_GEOMETRY: 'wkb_geometry',
  THE_GEOM: 'the_geom'
} as const;

export const CANONICAL_ID_COLUMN = 'id' as const;

export const JOINED_BASEMAP_COLUMN = {
  ID: 'basemap_id',
  LABEL: 'basemap_label',
  TYPO_MATCH: 'typo_match'
} as const;

// Shared cap between SQL join grading (A6) and the persisted project shape (C1).
export const MAX_JOIN_BUCKET_LIST_VALUES = 500;

// Shared cap on the fuzzy phase of both join paths: the basemap join and the
// enrichment join score every unmatched candidate against every target value,
// so an uncapped residual cross-joins the whole source column.
export const MAX_FUZZY_JOIN_CANDIDATES = 1000;

export const MAX_FUZZY_MATCHES_PER_VALUE = 5;

export const JOINED_BASEMAP_COLUMNS = Object.values(
  JOINED_BASEMAP_COLUMN
) as readonly string[];

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

export const EXCLUDED_COLUMNS = [
  INTERNAL_COLUMN.GEOM,
  INTERNAL_COLUMN.GEOMETRY,
  INTERNAL_COLUMN.ID,
  INTERNAL_COLUMN.FEATURE_ID
] as const;

export const COLUMN_TYPE_GEOMETRY = 'geometry' as const;

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
