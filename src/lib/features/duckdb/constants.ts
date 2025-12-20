export const DUCK_CONST = {
  DEFAULT: {
    DECIMAL_SEPARATOR: '.',
    FORMAT_TABULAR: 'csv',
    NULL_VALUES: `['', ':', 'null', 'NULL', 'NA', 'N/A', 'n/a', '#N/A', 'NaN', 'none', 'NONE']`,
    SOURCE: 'user'
  },
  QUERY_FORMAT: {
    ARROW_TABLE: 'arrow-table' as const,
    ARROW_IPC: 'arrow-ipc' as const,
    ARRAY: 'array' as const
  },
  TYPE: {
    TABULAR: 'tabular' as const,
    GEOFILE: 'geofile' as const,
    PARQUET: 'parquet' as const,
    ARROW: 'arrow' as const
  },
  REGEX: {
    TABULAR: /\.(csv|tsv|text|txt)/i,
    GEO: /\.(geojson|json|gpkg|kml|kmz|gpx)/i,
    PARQUET: /\.(parquet|geoparquet)/i,
    ARROW: /\.arrow$/i,
    COLUMN_VALIDATION_INTEGER: /^-?\d+$/,
    COLUMN_VALIDATION_DOUBLE: /^-?\d+(\.\d+)?$/,
    COLUMN_VALIDATION_BOOLEAN_NUMBER: /[0-1]/,
    COLUMN_VALIDATION_BOOLEAN_STRING: /^(true|false)$/i,
    COLUMN_VALIDATION_DATE:
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})?$/
  }
} as const;

export const CACHE_CONSTANTS = {
  MAX_CACHE_SIZE: 100 * 1024 * 1024, // 100MB
  GEO_PARQUET_READ_RETRIES: 3,
  GEO_PARQUET_RETRY_DELAY_MS: 15,
  PARQUET_MAGIC: new Uint8Array([0x50, 0x41, 0x52, 0x31]) // PAR1
} as const;
