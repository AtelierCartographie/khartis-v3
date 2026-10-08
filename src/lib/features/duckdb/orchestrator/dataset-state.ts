import type { GeoColumnResult } from '$lib/features/commons/utils/geo-detection.utils';
import type { GeoColumnInfo } from '$lib/features/data-pipeline';

export function mapGeoColumnsForAnalysis(
  geoColumns?: GeoColumnResult[]
): GeoColumnInfo[] {
  if (!geoColumns?.length) {
    return [];
  }

  return geoColumns
    .map((column) => mapGeoColumnResult(column))
    .filter((column): column is GeoColumnInfo => Boolean(column));
}

export function mapGeoColumnResult(
  geoColumn?: GeoColumnResult
): GeoColumnInfo | undefined {
  if (!geoColumn) {
    return undefined;
  }

  return {
    index: geoColumn.index,
    columnName: geoColumn.columnName,
    type: geoColumn.type,
    confidence: geoColumn.confidence
  };
}

export function mapDuckDBType(
  duckType: string
): 'string' | 'number' | 'date' | 'boolean' | 'geometry' {
  if (!duckType) return 'string';

  const typeMap: Record<
    string,
    'string' | 'number' | 'date' | 'boolean' | 'geometry'
  > = {
    numeric: 'number',
    text: 'string',
    string: 'string',
    date: 'date',
    boolean: 'boolean',
    geometry: 'geometry'
  };
  return typeMap[duckType.toLowerCase()] || 'string';
}
