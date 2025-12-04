import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck } from '$lib/features/duckdb';
import type { GeometryInfo } from '../types';
import { computeCentroid } from '../types';

export async function extractGeometryInfo(
  tableName: string
): Promise<GeometryInfo | undefined> {
  if (!Duck) return undefined;

  try {
    const describe = await Duck.describe_table(tableName);
    const columns = describe.name.map((name, index) => ({
      name,
      type: describe.type[index]
    }));

    const geometryColumn = columns.find((column) => column.type === 'GEOMETRY');
    if (!geometryColumn) {
      return undefined;
    }

    const consolidatedQuery = `
			WITH bbox AS (
				SELECT ST_Extent("${geometryColumn.name}") AS extent FROM "${tableName}"
			),
			first_row AS (
				SELECT "${geometryColumn.name}" AS geom FROM "${tableName}" WHERE "${geometryColumn.name}" IS NOT NULL LIMIT 1
			)
			SELECT
				ST_GeometryType((SELECT geom FROM first_row)) AS geom_type,
				ST_XMin(extent) AS minX,
				ST_YMin(extent) AS minY,
				ST_XMax(extent) AS maxX,
				ST_YMax(extent) AS maxY
			FROM bbox
		`;

    const [result] = (await Duck.query(consolidatedQuery, {
      format: 'array' as never
    })) as Array<{
      geom_type: string | null;
      minX: number | null;
      minY: number | null;
      maxX: number | null;
      maxY: number | null;
    }>;

    const geometryType = result?.geom_type ?? 'GEOMETRY';
    const extent = result;

    if (
      !extent ||
      extent.minX === null ||
      extent.minY === null ||
      extent.maxX === null ||
      extent.maxY === null
    ) {
      return {
        type: normalizeGeometryType(geometryType),
        bounds: [-180, -90, 180, 90],
        centroid: [0, 0]
      };
    }

    const bounds: [number, number, number, number] = [
      extent.minX,
      extent.minY,
      extent.maxX,
      extent.maxY
    ];

    return {
      type: normalizeGeometryType(geometryType),
      bounds,
      centroid: computeCentroid(bounds),
      crs: 'EPSG:4326',
      featureCount: undefined
    };
  } catch (error) {
    logger.warn('Failed to extract geometry info', LogCategory.DATA, {
      tableName,
      error
    });
    return undefined;
  }
}

function normalizeGeometryType(type?: string | null): GeometryInfo['type'] {
  if (!type) return 'Polygon';
  const normalized = type.replace(/^ST_/i, '').toLowerCase();
  switch (normalized) {
    case 'point':
      return 'Point';
    case 'multipoint':
      return 'MultiPoint';
    case 'linestring':
      return 'LineString';
    case 'multilinestring':
      return 'MultiLineString';
    case 'multipolygon':
      return 'MultiPolygon';
    default:
      return 'Polygon';
  }
}
