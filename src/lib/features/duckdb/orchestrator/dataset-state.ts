import type { UploadedFile } from '$lib/features/commons/types/create-project.types';
import type { GeoColumnResult } from '$lib/features/commons/utils/geo-detector.utils';
import type { GeoColumnInfo } from '$lib/features/data-pipeline';
import type { AnalysisResult, DuckDBDataset } from '../types';
import { detectGPSColumns } from './gps-ops';

export function restoreJoinStateFromFile(
  dataset: DuckDBDataset,
  file: UploadedFile
): Partial<DuckDBDataset> | null {
  if (!file.joinedBasemap && !file.gpsMode) {
    return null;
  }

  const updates: Partial<DuckDBDataset> = {};

  if (file.joinedBasemap) {
    updates.joinedBasemap = file.joinedBasemap;
  }
  if (file.geoColumn) {
    updates.geoColumn = file.geoColumn;
  }
  if (file.gpsMode) {
    updates.gpsMode = file.gpsMode;
    if (!file.gpsColumns) {
      const detected = detectGPSColumns(
        dataset.columns as AnalysisResult[],
        dataset.geoDetection
      );
      if (detected) {
        updates.gpsColumns = detected;
      }
    } else {
      updates.gpsColumns = file.gpsColumns;
    }
  }

  return updates;
}

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
