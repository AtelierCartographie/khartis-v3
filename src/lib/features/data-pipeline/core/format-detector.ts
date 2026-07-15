import { PIPELINE_CONST } from '../constants';
import type { FileFormat } from '../types';

const { TABULAR, GEO, PARQUET } = PIPELINE_CONST.EXTENSIONS;

export function generateTableName(
  filename: string,
  sourceFileId?: string
): string {
  let name = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
  if (!/^[a-zA-Z]/.test(name)) {
    name = 't_' + name;
  }
  // The per-source suffix must stay deterministic: replays and the creation
  // fast-path re-derive the persisted duckdbTableName from the same id.
  const suffix = sourceFileId
    ? sourceFileId.replace(/[^a-zA-Z0-9]/g, '_')
    : Date.now().toString(36);
  return `${name}_${suffix}`;
}

function hasExtension(name: string, extensions: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

export function detectFileFormat(name: string): FileFormat {
  if (hasExtension(name, PARQUET)) return 'geoparquet';
  if (hasExtension(name, TABULAR)) return 'csv';
  if (hasExtension(name, GEO)) {
    const lower = name.toLowerCase();
    if (lower.endsWith('.geojson') || lower.endsWith('.json')) return 'geojson';
    if (lower.endsWith('.shp')) return 'shapefile';
    if (lower.endsWith('.gpkg')) return 'geopackage';
    if (lower.endsWith('.kml')) return 'kml';
    if (lower.endsWith('.kmz')) return 'kmz';
    if (lower.endsWith('.gpx')) return 'gpx';
  }
  return 'unknown';
}
