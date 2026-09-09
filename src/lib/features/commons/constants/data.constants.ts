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

// Shared budget on the fuzzy phase of both join paths, counted in
// candidate x target-name pairs rather than candidates: both paths score every
// unmatched candidate against every target value, so the cost is the product.
// Budgeting the product keeps the step at a constant duration as the basemap
// catalog grows, instead of letting a fixed candidate cap drift.
// 90M pairs is ~3 s at the rate below, and ~1 076 candidates against today's
// 83 669 distinct catalog names.
export const MAX_FUZZY_AUTO_PAIRS = 90_000_000;

// Measured in DuckDB WASM v1.5.4 (threads = 1) on the slowest corpus
// (commune names, ~13 characters); short names run ~40% faster.
// This covers the scoring only, not the surrounding cache build, whose cost
// grows with the number of matches found: measured 3 850 ms against a 3 437 ms
// estimate when every candidate ended up with a suggestion. The estimate is an
// order of magnitude for the user, not a bound.
export const FUZZY_PAIRS_PER_MS = 30_000;

// Fixed cost of the fuzzy statement itself, independent of the pair count.
export const FUZZY_PASS_OVERHEAD_MS = 90;

// Candidates scored to rank basemaps when the full pass is over budget.
// Measured: at 300 the top two basemaps are unchanged, only near-tied regional
// subsets permute, and it costs ~0.9 s against the whole catalog.
export const MAX_FUZZY_RANKING_SAMPLE = 300;

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
