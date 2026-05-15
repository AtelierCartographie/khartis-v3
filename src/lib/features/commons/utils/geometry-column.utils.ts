import type { ProcessedDataset } from '$lib/features/data-pipeline';
import {
  COLUMN_TYPE_GEOMETRY,
  GEO_COLUMN_NAMES,
  GEO_COLUMN_TYPE
} from '../constants/data.constants';

type DatasetColumn = ProcessedDataset['columns'][0];

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

  return (
    Boolean(dataset.geometry) ||
    hasCoordinateGeometryMetadata(dataset, column.name)
  );
}
