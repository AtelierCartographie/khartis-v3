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
    NULL_VALUES: `['', ':', '-', 'null', 'NULL', 'NA', 'N/A', 'n/a', '#N/A', 'NaN', 'nil', 'NIL', 'none', 'NONE', 'None']`,
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
 * Cache and retry configuration for DuckDB operations.
 */
export const CACHE_CONSTANTS = {
  /**
   * Maximum cache size in bytes (100 MB).
   * Based on typical browser memory constraints and IndexedDB limits.
   */
  MAX_CACHE_SIZE: 100 * 1024 * 1024,

  /**
   * Number of retry attempts for GeoParquet read operations.
   * 3 retries provides good resilience against transient WASM failures.
   */
  GEO_PARQUET_READ_RETRIES: 3,

  /**
   * Delay between GeoParquet read retries in milliseconds.
   * 15ms allows WASM garbage collection without noticeable delay.
   */
  GEO_PARQUET_RETRY_DELAY_MS: 15,

  /**
   * Parquet file magic bytes for format validation.
   * "PAR1" (0x50, 0x41, 0x52, 0x31) identifies valid Parquet files.
   */
  PARQUET_MAGIC: new Uint8Array([0x50, 0x41, 0x52, 0x31])
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

export const READER_CONSTANTS = {
  /**
   * Batch size for point geometry reprojection.
   * 5,000 points balances memory usage with processing efficiency.
   * Points are simple (2-3 coords) so larger batches are efficient.
   */
  POINT_REPROJECTION_BATCH_SIZE: 5_000,

  /**
   * Batch size for complex geometry (polygon/line) reprojection.
   * 1,000 geometries balances memory with throughput.
   * Lower than points because polygons have many vertices.
   */
  COMPLEX_GEOMETRY_REPROJECTION_BATCH_SIZE: 1_000,

  /**
   * Projections not natively supported by DuckDB spatial extension.
   * These require client-side reprojection via proj4.
   */
  DUCKDB_UNSUPPORTED_PROJECTIONS: new Set([
    'EPSG:2154', // Lambert-93 (France)
    'EPSG:27572', // Lambert II etendu (France)
    'EPSG:3035' // ETRS89-LAEA (Europe)
  ])
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
