export const PIPELINE_CONST = {
  EXTENSIONS: {
    TABULAR: ['.csv', '.tsv', '.txt'] as const,
    GEO: [
      '.geojson',
      '.json',
      '.shp',
      '.gpkg',
      '.kml',
      '.kmz',
      '.gpx'
    ] as const,
    PARQUET: ['.parquet', '.geoparquet'] as const,
    ZIP: ['.zip'] as const,
    ALL: [
      '.csv',
      '.tsv',
      '.txt',
      '.parquet',
      '.arrow',
      '.geojson',
      '.json',
      '.shp',
      '.gpkg',
      '.kml',
      '.kmz',
      '.gpx',
      '.geoparquet',
      '.zip'
    ] as const
  },
  MIME_TYPES: {
    CSV: 'text/csv',
    JSON: 'application/json',
    GEOJSON: 'application/geo+json',
    PARQUET: 'application/octet-stream',
    ARROW: 'application/vnd.apache.arrow.file',
    SHAPEFILE: 'application/x-shapefile',
    GEOPACKAGE: 'application/geopackage+sqlite3',
    KML: 'application/vnd.google-earth.kml+xml',
    KMZ: 'application/vnd.google-earth.kmz',
    GPX: 'application/gpx+xml',
    ZIP: 'application/zip',
    BINARY: 'application/octet-stream'
  } as const,
  LIMITS: {
    MAX_FILE_SIZE: 100 * 1024 * 1024,
    WARNING_FILE_SIZE: 50 * 1024 * 1024,
    SAMPLE_ROWS: 100,
    TYPE_THRESHOLD: 0.8
  },
  QUALITY: {
    HIGH_NULL_RATIO_THRESHOLD: 0.5,
    LOW_CARDINALITY_THRESHOLD: 0.01
  }
} as const;

export function isGeospatialFile(name: string): boolean {
  const lower = name.toLowerCase();
  return PIPELINE_CONST.EXTENSIONS.GEO.some((ext) => lower.endsWith(ext));
}

export function isParquetFile(name: string): boolean {
  const lower = name.toLowerCase();
  return PIPELINE_CONST.EXTENSIONS.PARQUET.some((ext) => lower.endsWith(ext));
}
