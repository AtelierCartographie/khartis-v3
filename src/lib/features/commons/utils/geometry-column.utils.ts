import type { ProcessedDataset } from '$lib/features/data-pipeline';
import {
  COLUMN_TYPE_GEOMETRY,
  GEO_COLUMN_NAMES,
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

  if (!dataset.geometry) {
    return false;
  }

  return CANONICAL_GEOMETRY_COLUMN_NAMES.has(column.name.toLowerCase());
}
