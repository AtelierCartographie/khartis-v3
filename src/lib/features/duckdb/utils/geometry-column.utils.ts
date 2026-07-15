import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { GEOMETRY_COLUMN_TYPE } from '$lib/features/commons/constants/geometry.constants';

const GEOMETRY_COLUMN_NAMES: readonly string[] = [
  INTERNAL_COLUMN.GEOM,
  INTERNAL_COLUMN.GEOMETRY,
  INTERNAL_COLUMN.WKB_GEOMETRY,
  INTERNAL_COLUMN.THE_GEOM
];

/**
 * DuckDB >= 1.33 may return geometry column types like `GEOMETRY('EPSG:4326')`
 * instead of plain `GEOMETRY`. This helper matches both forms.
 */
export function isGeometryColumnType(columnType: string): boolean {
  return (
    columnType === GEOMETRY_COLUMN_TYPE ||
    columnType.startsWith(GEOMETRY_COLUMN_TYPE + '(')
  );
}

export function isGeometryColumnName(columnName: string): boolean {
  return GEOMETRY_COLUMN_NAMES.includes(columnName.toLowerCase());
}

export function findGeometryColumnByName<T extends { column_name: string }>(
  columns: T[]
): T | undefined {
  return columns.find((column) => isGeometryColumnName(column.column_name));
}
