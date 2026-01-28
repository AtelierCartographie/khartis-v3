import type { FileFormat } from '../types';

export function generateTableName(filename: string, prefix?: string): string {
  let name = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
  if (prefix) {
    name = `${prefix}_${name}`;
  } else if (!/^[a-zA-Z]/.test(name)) {
    name = 't_' + name;
  }
  const timestamp = Date.now().toString(36);
  return `${name}_${timestamp}`;
}

export function detectFileFormat(name: string): FileFormat {
  const lower = name.toLowerCase();
  if (
    lower.endsWith('.csv') ||
    lower.endsWith('.tsv') ||
    lower.endsWith('.txt')
  )
    return 'csv';
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) return 'geojson';
  if (lower.endsWith('.shp')) return 'shapefile';
  if (lower.endsWith('.gpkg')) return 'geopackage';
  if (lower.endsWith('.kml')) return 'kml';
  if (lower.endsWith('.kmz')) return 'kmz';
  if (lower.endsWith('.gpx')) return 'gpx';
  if (lower.endsWith('.geoparquet') || lower.endsWith('.parquet'))
    return 'geoparquet';
  return 'unknown';
}
