/**
 * DuckDB configuration constants.
 */
export const DUCK_CONST = {
  /** Default values for DuckDB operations */
  DEFAULT: {
    /** Standard decimal separator for numeric parsing */
    DECIMAL_SEPARATOR: '.',
    /** Default format for tabular data */
    FORMAT_TABULAR: 'csv',
    /** Common null value representations recognized during parsing */
    NULL_VALUES: `['', ':', '-', '...', 'null', 'NULL', 'NA', 'N/A', 'n/a', '#N/A', 'NaN', 'nil', 'NIL', 'none', 'NONE', 'None']`,
    /** Default data source identifier */
    SOURCE: 'user'
  },
  /** Query output format options */
  QUERY_FORMAT: {
    /** Returns Apache Arrow Table for efficient columnar operations */
    ARROW_TABLE: 'arrow-table' as const,
    /** Returns Arrow IPC format for serialization */
    ARROW_IPC: 'arrow-ipc' as const,
    /** Returns plain JavaScript array of objects */
    ARRAY: 'array' as const
  },
  /** File type classifications */
  TYPE: {
    TABULAR: 'tabular' as const,
    GEOFILE: 'geofile' as const,
    PARQUET: 'parquet' as const,
    ARROW: 'arrow' as const
  },
  /** File extension patterns for type detection */
  REGEX: {
    TABULAR: /\.(csv|tsv|text|txt)/i,
    GEO: /\.(geojson|json|gpkg|kml|kmz|gpx)/i,
    PARQUET: /\.(parquet|geoparquet|gpq)/i,
    ARROW: /\.arrow$/i,
    COLUMN_VALIDATION_INTEGER: /^-?\d+$/,
    COLUMN_VALIDATION_DOUBLE: /^-?\d+(\.\d+)?$/,
    COLUMN_VALIDATION_BOOLEAN_NUMBER: /[0-1]/,
    COLUMN_VALIDATION_BOOLEAN_STRING: /^(true|false)$/i,
    COLUMN_VALIDATION_DATE:
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})?$/
  }
} as const;

/**
 * Reader configuration for geometry processing.
 */
export const GEO_CONSTANTS = {
  /** WGS 84 coordinate reference system used as the target CRS for all geometries */
  WGS84_CRS: 'EPSG:4326',
  /** Web Mercator projection commonly used in web mapping */
  WEB_MERCATOR_CRS: 'EPSG:3857'
} as const;

/**
 * DuckDB extension names.
 */
export const EXTENSIONS = {
  SPATIAL: 'spatial',
  HTTPFS: 'httpfs'
} as const;

/**
 * Table name patterns and suffixes.
 */
export const TABLE_PATTERNS = {
  /** Suffix for join result tables */
  JOIN_RESULTS_SUFFIX: '_join_results',
  /** Suffix for filtered tables */
  FILTERED_SUFFIX: '_filtered',
  /** Unified basemap attributes table name */
  UNIFIED_BASEMAP_ATTRS: 'unified_basemap_attributes',
  /** Custom basemap attributes table name */
  CUSTOM_BASEMAP_ATTRS: 'custom_basemap_attributes'
} as const;

/**
 * DuckDB SQL function names.
 */
export const SQL_FUNCTIONS = {
  ST_READ: 'ST_Read',
  ST_READ_META: 'ST_Read_Meta',
  ST_TRANSFORM: 'ST_Transform',
  ST_GEOM_FROM_WKB: 'ST_GeomFromWKB',
  ST_SIMPLIFY: 'ST_Simplify',
  ST_SIMPLIFY_PRESERVE_TOPOLOGY: 'ST_SimplifyPreserveTopology',
  NORMALIZE_TEXT: 'normalize_text',
  READ_CSV: 'read_csv',
  READ_CSV_AUTO: 'read_csv_auto',
  READ_PARQUET: 'read_parquet'
} as const;
