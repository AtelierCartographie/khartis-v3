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
      '.arrow',
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
  },
  CSV: {
    SUPPORTED_DELIMITERS: [';', ',', '\t', '|'] as const,
    DEFAULT_DELIMITER: ','
  },
  ENCODING: {
    DEFAULT: 'UTF-8'
  }
} as const;

export function isGeospatialFile(name: string): boolean {
  const lower = name.toLowerCase();
  return PIPELINE_CONST.EXTENSIONS.GEO.some((ext) => lower.endsWith(ext));
}
