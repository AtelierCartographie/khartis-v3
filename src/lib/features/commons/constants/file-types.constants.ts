/**
 * File type detection constants
 *
 * File extensions and MIME type mappings used for detecting uploaded file types.
 * Centralizes all file type identification logic to avoid scattered string literals.
 */

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
  TSV: ['tsv'] as const,
  ARROW: ['arrow'] as const
} as const;

export const MIME_TYPE_PATTERNS = {
  CSV: 'csv',
  PARQUET: 'parquet',
  ZIP: 'zip',
  TAB_SEPARATED: 'tab-separated'
} as const;

export const TABULAR_DELIMITERS = [',', ';', '\t', '|'] as const;
