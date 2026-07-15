export const FILE_EXTENSIONS = {
  CSV: ['csv'] as const,
  GEOJSON: ['geojson', 'json'] as const,
  SHAPEFILE: ['shp', 'shx', 'dbf', 'prj', 'cpg'] as const,
  GEOPACKAGE: ['gpkg'] as const,
  GEOPARQUET: ['geoparquet', 'gpq', 'parquet'] as const,
  KML: ['kml'] as const,
  KMZ: ['kmz'] as const,
  GPX: ['gpx'] as const,
  ZIP: ['zip'] as const,
  TSV: ['tsv'] as const
} as const;

export const MIME_TYPE_PATTERNS = {
  CSV: 'csv',
  PARQUET: 'parquet',
  ZIP: 'zip',
  TAB_SEPARATED: 'tab-separated'
} as const;

export const TABULAR_DELIMITERS = [',', ';', '\t', '|'] as const;

export const FILE_EXTENSION_GROUPS = {
  TABULAR: ['.csv', '.tsv', '.txt'] as const,
  GEO: ['.geojson', '.json', '.shp', '.gpkg', '.kml', '.kmz', '.gpx'] as const,
  PARQUET: ['.parquet', '.geoparquet', '.gpq'] as const,
  ZIP: ['.zip'] as const,
  SHAPEFILE_REQUIRED: ['.shp', '.shx', '.dbf'] as const,
  SHAPEFILE_OPTIONAL: [
    '.prj',
    '.cpg',
    '.sbn',
    '.sbx',
    '.fbn',
    '.fbx',
    '.ain',
    '.aih',
    '.ixs',
    '.mxs',
    '.atx',
    '.xml'
  ] as const,
  ALL: [
    '.csv',
    '.tsv',
    '.txt',
    '.parquet',
    '.geojson',
    '.json',
    '.shp',
    '.gpkg',
    '.kml',
    '.kmz',
    '.gpx',
    '.geoparquet',
    '.gpq',
    '.zip'
  ] as const
} as const;

export const FILE_ENCODING = {
  DEFAULT: 'UTF-8'
} as const;

export const CSV_DELIMITERS = {
  SUPPORTED: [';', ',', '\t', '|'] as const,
  DEFAULT: ','
} as const;
