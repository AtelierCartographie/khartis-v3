import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';

export type CatalogGeometryKind =
  | 'point'
  | 'linestring'
  | 'polygon'
  | 'multipoint'
  | 'multilinestring'
  | 'multipolygon';

export interface DuckTableColumnInfo {
  column_name: string;
  data_type: string;
}

function getNativeGeoArrowGeometryKind(
  geometryColumn: DuckTableColumnInfo,
  expectedKind: CatalogGeometryKind
): CatalogGeometryKind {
  const dataType = geometryColumn.data_type.replace(/\s+/g, ' ').toUpperCase();

  if (dataType.endsWith('[][][]')) {
    return 'multipolygon';
  }
  if (dataType.endsWith('[][]')) {
    return expectedKind === 'multilinestring' ? 'multilinestring' : 'polygon';
  }
  if (dataType.endsWith('[]')) {
    if (expectedKind === 'point' || expectedKind === 'multipoint') {
      return expectedKind;
    }
    return 'linestring';
  }

  return 'point';
}

const pointFrom = (coord: string): string => `ST_Point(${coord}.x, ${coord}.y)`;

const lineFrom = (coords: string): string =>
  `ST_MakeLine(list_transform(${coords}, lambda pt: ${pointFrom('pt')}))`;

const polygonFrom = (rings: string): string =>
  `ST_MakePolygon(${lineFrom(`${rings}[1]`)}, list_transform(${rings}[2:], lambda hole: ${lineFrom('hole')}))`;

const multiFrom = (parts: string, part: string, build: string): string =>
  `ST_Multi(ST_Collect(list_transform(${parts}, lambda ${part}: ${build})))`;

function buildGeometryExpression(
  kind: CatalogGeometryKind,
  column: string,
  isListEncodedPoint: boolean
): string {
  switch (kind) {
    case 'point':
      return pointFrom(isListEncodedPoint ? `${column}[1]` : column);
    case 'linestring':
      return lineFrom(column);
    case 'polygon':
      return polygonFrom(column);
    case 'multipoint':
      return multiFrom(column, 'pt', pointFrom('pt'));
    case 'multilinestring':
      return multiFrom(column, 'part', lineFrom('part'));
    case 'multipolygon':
      return multiFrom(column, 'part', polygonFrom('part'));
    default:
      throw new DataValidationError(
        `Unsupported catalog geometry kind: ${kind}`,
        'geometryKind',
        { geometryKind: kind }
      );
  }
}

/**
 * Builds DuckDB geometries straight from the native GeoArrow coordinate lists
 * of a catalog GeoParquet. An empty list stays NULL, as a missing geometry.
 */
export function buildNativeGeoArrowGeometrySql(
  rawTableName: string,
  tempTableName: string,
  geometryColumn: DuckTableColumnInfo,
  expectedKind: CatalogGeometryKind
): string {
  const geometryKind = getNativeGeoArrowGeometryKind(
    geometryColumn,
    expectedKind
  );
  const dataType = geometryColumn.data_type.replace(/\s+/g, ' ').toUpperCase();
  const column = `"${escapeIdentifier(geometryColumn.column_name)}"`;
  const isList = dataType.endsWith('[]');
  const geometry = buildGeometryExpression(geometryKind, column, isList);
  const guardedGeometry = isList
    ? `CASE WHEN len(${column}) > 0 THEN ${geometry} END`
    : geometry;

  return `
    CREATE OR REPLACE TEMP TABLE "${escapeIdentifier(tempTableName)}" AS
    SELECT
      * EXCLUDE (${column}),
      ${guardedGeometry} AS ${INTERNAL_COLUMN.GEOM}
    FROM "${escapeIdentifier(rawTableName)}"
  `;
}
