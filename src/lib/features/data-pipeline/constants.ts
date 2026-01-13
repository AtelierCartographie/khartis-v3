export const PIPELINE_CONST = {
  EXTENSIONS: {
    TABULAR: ['.csv', '.tsv', '.txt', '.parquet', '.arrow'] as const,
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
    CSV: ['text/csv', 'text/plain', 'application/csv'] as const,
    JSON: ['application/json', 'application/geo+json'] as const,
    PARQUET: ['application/octet-stream', 'application/x-parquet'] as const,
    ARROW: [
      'application/vnd.apache.arrow.file',
      'application/octet-stream'
    ] as const,
    SHAPEFILE: ['application/x-shapefile', 'application/octet-stream'] as const
  },
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
