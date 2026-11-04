import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { sqlIdentifier } from '$lib/features/commons/utils/sql.utils';
import { isGeometryColumnType, type DuckClient } from '$lib/features/duckdb';

/**
 * The derived layers, simplification and the basemap renderer read a geometry
 * column named `geom`, while GeoParquet and `ST_Read` keep the source name
 * (`geometry` for GDAL and GeoPandas outputs). A column already named `geom`,
 * geometry or not, is left alone.
 */
export async function normalizeGeometryColumnName(
  tableName: string,
  Duck: DuckClient,
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
  await Duck.mutate(
    tableName,
    `ALTER TABLE ${sqlIdentifier(tableName)} RENAME COLUMN ${sqlIdentifier(geometryColumn)} TO ${sqlIdentifier(INTERNAL_COLUMN.GEOM)}`
  );
}
