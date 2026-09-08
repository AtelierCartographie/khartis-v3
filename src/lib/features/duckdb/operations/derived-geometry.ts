import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { DERIVED_GEOMETRY_TABLE_SUFFIX } from '$lib/features/commons/constants/basemap.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';

interface DuckDBClientForDerivedGeometry {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  invalidateTableCache?(tableName: string): void;
}

export function getDerivedLandTableName(sourceTable: string): string {
  return `${sourceTable}${DERIVED_GEOMETRY_TABLE_SUFFIX.LAND}`;
}

export function getDerivedInnerlinesTableName(sourceTable: string): string {
  return `${sourceTable}${DERIVED_GEOMETRY_TABLE_SUFFIX.INNERLINES}`;
}

export function getDerivedOuterlinesTableName(sourceTable: string): string {
  return `${sourceTable}${DERIVED_GEOMETRY_TABLE_SUFFIX.OUTERLINES}`;
}

async function createEmptyGeometryTable(
  duck: DuckDBClientForDerivedGeometry,
  tableName: string
): Promise<void> {
  await duck.query(`
    CREATE OR REPLACE TABLE "${escapeIdentifier(tableName)}" AS
    SELECT NULL::GEOMETRY AS "${escapeIdentifier(INTERNAL_COLUMN.GEOM)}"
    WHERE FALSE
  `);
}

async function createDerivedTable(
  duck: DuckDBClientForDerivedGeometry,
  targetTable: string,
  select: string
): Promise<void> {
  try {
    await duck.query(`
      CREATE OR REPLACE TABLE "${escapeIdentifier(targetTable)}" AS
      ${select}
    `);
    duck.invalidateTableCache?.(targetTable);
  } catch (error) {
    logger.error(
      `Failed to derive geometry table ${targetTable}`,
      LogCategory.DUCKDB,
      error
    );
    await createEmptyGeometryTable(duck, targetTable);
  }
}

function buildLineSelect(macroCall: string): string {
  return `
    WITH extracted AS (
      SELECT ST_CollectionExtract(geom, 2) AS geom
      FROM ${macroCall}
      WHERE geom IS NOT NULL
    )
    SELECT geom
    FROM extracted
    WHERE NOT ST_IsEmpty(geom)
      AND CAST(ST_GeometryType(geom) AS VARCHAR) IN ('LINESTRING', 'MULTILINESTRING')
  `;
}

/**
 * Builds the territory / outer contour / shared borders siblings of a polygon
 * coverage. The outer contour reuses the already dissolved land table, so the
 * whole set costs one dissolve more than the shared borders alone.
 */
export async function rebuildDerivedGeometryTables(
  duck: DuckDBClientForDerivedGeometry,
  sourceTable: string
): Promise<void> {
  const escapedSource = escapeSqlString(sourceTable);
  const landTable = getDerivedLandTableName(sourceTable);

  await createDerivedTable(
    duck,
    landTable,
    `
      SELECT geom
      FROM extract_land('${escapedSource}')
      WHERE geom IS NOT NULL AND NOT ST_IsEmpty(geom)
    `
  );

  await createDerivedTable(
    duck,
    getDerivedOuterlinesTableName(sourceTable),
    buildLineSelect(`extract_outerlines('${escapeSqlString(landTable)}')`)
  );

  await createDerivedTable(
    duck,
    getDerivedInnerlinesTableName(sourceTable),
    buildLineSelect(`extract_innerlines('${escapedSource}')`)
  );
}
