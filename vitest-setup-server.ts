import { vi } from 'vitest';

vi.mock('@duckdb/duckdb-wasm', () => ({
  AsyncDuckDB: vi.fn(),
  AsyncDuckDBConnection: vi.fn(),
  ConsoleLogger: vi.fn(),
  selectBundle: vi.fn().mockResolvedValue({ mainWorker: '', mainModule: '' }),
  DuckDBDataProtocol: {
    BROWSER_FILEREADER: 4,
    HTTP: 3,
    NODE_FS: 1,
    S3: 2,
    BUFFER: 0
  }
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {},
  duckDBOrchestrator: {
    initialize: vi.fn().mockResolvedValue(undefined),
    executeQuery: vi.fn().mockResolvedValue([]),
    getConnection: vi.fn().mockResolvedValue(null)
  },
  validateGPSColumns: vi.fn().mockResolvedValue({ isValid: true }),
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326',
    WEB_MERCATOR_CRS: 'EPSG:3857'
  },
  DUCK_CONST: {
    DEFAULT: {
      DECIMAL_SEPARATOR: '.',
      FORMAT_TABULAR: 'csv',
      NULL_VALUES: "['']",
      SOURCE: 'user'
    },
    QUERY_FORMAT: {
      ARROW_TABLE: 'arrow-table',
      ARROW_IPC: 'arrow-ipc',
      ARRAY: 'array'
    },
    TYPE: {
      TABULAR: 'tabular',
      GEOFILE: 'geofile',
      PARQUET: 'parquet',
      ARROW: 'arrow'
    },
    REGEX: {}
  },
  EXTENSIONS: { SPATIAL: 'spatial', HTTPFS: 'httpfs' },
  TABLE_PATTERNS: {
    JOIN_RESULTS_SUFFIX: '_join_results',
    FILTERED_SUFFIX: '_filtered',
    UNIFIED_BASEMAP_ATTRS: 'unified_basemap_attributes',
    CUSTOM_BASEMAP_ATTRS: 'custom_basemap_attributes'
  },
  SQL_FUNCTIONS: {
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
  }
}));
