import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import { isGeometryColumnType } from '$lib/features/duckdb';

interface DuckDBGeometryColumnClient {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  describe_table(
    tableName: string
  ): Promise<{ name: string[]; type: string[] }>;
  invalidateTableCache?(tableName: string): void;
}

/**
 * The derived layers, simplification and the basemap renderer read a geometry
 * column named `geom`, while GeoParquet and `ST_Read` keep the source name
 * (`geometry` for GDAL and GeoPandas outputs). A column already named `geom`,
 * geometry or not, is left alone.
 */
export async function normalizeGeometryColumnName(
  tableName: string,
  Duck: DuckDBGeometryColumnClient,
  preferredColumn?: string
): Promise<void> {
  const description = await Duck.describe_table(tableName);
  const geometryColumns = description.name.filter((_, index) =>
    isGeometryColumnType(description.type[index])
  );
  if (
    geometryColumns.length === 0 ||
    description.name.includes(INTERNAL_COLUMN.GEOM)
  ) {
    return;
  }

  const geometryColumn =
    preferredColumn && geometryColumns.includes(preferredColumn)
      ? preferredColumn
      : geometryColumns[0];
  await Duck.query(
    `ALTER TABLE "${escapeIdentifier(tableName)}" RENAME COLUMN "${escapeIdentifier(geometryColumn)}" TO "${escapeIdentifier(INTERNAL_COLUMN.GEOM)}"`
  );
  Duck.invalidateTableCache?.(tableName);
}
