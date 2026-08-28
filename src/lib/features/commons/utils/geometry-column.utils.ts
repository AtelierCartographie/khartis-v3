import type { ProcessedDataset } from '$lib/features/data-pipeline';
import {
  COLUMN_TYPE_GEOMETRY,
  GEO_COLUMN_NAMES,
  GEO_COLUMN_TYPE,
  INTERNAL_COLUMN
} from '../constants/data.constants';

type DatasetColumn = ProcessedDataset['columns'][0];

const CANONICAL_GEOMETRY_COLUMN_NAMES = new Set<string>([
  INTERNAL_COLUMN.GEOM,
  INTERNAL_COLUMN.GEOMETRY,
  INTERNAL_COLUMN.WKB_GEOMETRY,
  INTERNAL_COLUMN.THE_GEOM
]);

function isKnownGeometryColumnName(name: string): boolean {
  return (GEO_COLUMN_NAMES as readonly string[]).includes(name.toLowerCase());
}

function hasCoordinateGeometryMetadata(
  dataset: ProcessedDataset,
  columnName: string
): boolean {
  return [
    ...(dataset.geoDetection?.geoColumns ?? []),
    ...dataset.analysis.geoColumns
  ].some(
    (column) =>
      typeof column === 'object' &&
      column !== null &&
      'columnName' in column &&
      'type' in column &&
      column.columnName === columnName &&
      column.type === GEO_COLUMN_TYPE.COORDINATES
  );
}

function hasDetectedGeometryMetadata(
  dataset: ProcessedDataset,
  columnName: string
): boolean {
  return [
    ...(dataset.geoDetection?.geoColumns ?? []),
    ...dataset.analysis.geoColumns
  ].some(
    (column) =>
      typeof column === 'object' &&
      column !== null &&
      'columnName' in column &&
      'type' in column &&
      column.columnName === columnName &&
      (column.type === GEO_COLUMN_TYPE.COORDINATES ||
        column.type === GEO_COLUMN_TYPE.UNKNOWN)
  );
}

export function isDatasetGeometryColumn(
  dataset: ProcessedDataset,
  column: DatasetColumn
): boolean {
  if (column.type === COLUMN_TYPE_GEOMETRY) {
    return true;
  }

  if (!isKnownGeometryColumnName(column.name)) {
    return false;
  }

  if (hasCoordinateGeometryMetadata(dataset, column.name)) {
    return true;
  }

  if (!dataset.geometry) {
    return false;
  }

  return (
    CANONICAL_GEOMETRY_COLUMN_NAMES.has(column.name.toLowerCase()) ||
    hasDetectedGeometryMetadata(dataset, column.name)
  );
}
