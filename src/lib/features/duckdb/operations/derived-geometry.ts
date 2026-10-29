import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { DERIVED_GEOMETRY_TABLE_SUFFIX } from '$lib/features/commons/constants/basemap.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';

// The repair grid is a fraction of the average perimeter, so it holds whether
// the coverage is in degrees or in metres. 1e-6 re-nodes what GEOS rejects while
// moving vertices well below the pixel.
const NODING_REPAIR_FACTOR = 0.000001;

// Past this many mean cells across its extent, a mesh drawn whole on a map a
// thousand pixels wide has cells under two pixels: its shared borders, at any
// stroke width, paint over the fill they separate (a 1 km grid of France).
const MAX_MESH_CELLS_ACROSS_EXTENT = 500;

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
  duck.invalidateTableCache?.(tableName);
}

async function createDerivedTable(
  duck: DuckDBClientForDerivedGeometry,
  targetTable: string,
  candidateSelects: string[]
): Promise<void> {
  let lastError: unknown;
  for (const select of candidateSelects) {
    try {
      await runDerivedTableQuery(duck, targetTable, select);
      return;
    } catch (error) {
      lastError = error;
      logger.warn(
        `Retrying the derivation of ${targetTable}`,
        LogCategory.DUCKDB,
        error
      );
    }
  }

  logger.error(
    `Failed to derive geometry table ${targetTable}`,
    LogCategory.DUCKDB,
    lastError
  );
  await createEmptyGeometryTable(duck, targetTable);
}

async function isValidPolygonCoverage(
  duck: DuckDBClientForDerivedGeometry,
  sourceTable: string
): Promise<boolean> {
  try {
    const rows = (await duck.query(
      `FROM is_valid_polygon_coverage('${escapeSqlString(sourceTable)}')`,
      { format: 'array' }
    )) as Array<{ is_valid: boolean | null }>;
    return rows[0]?.is_valid === true;
  } catch (error) {
    logger.warn(
      `Could not validate the coverage of ${sourceTable}`,
      LogCategory.DUCKDB,
      error
    );
    return false;
  }
}

export async function isMeshTooFineForInnerLimits(
  duck: DuckDBClientForDerivedGeometry,
  sourceTable: string
): Promise<boolean> {
  const geom = `"${escapeIdentifier(INTERNAL_COLUMN.GEOM)}"`;
  try {
    const rows = (await duck.query(
      `SELECT sqrt(sum(ST_Area(${geom})) / count(*)) * ${MAX_MESH_CELLS_ACROSS_EXTENT}
          < greatest(
              max(ST_XMax(${geom})) - min(ST_XMin(${geom})),
              max(ST_YMax(${geom})) - min(ST_YMin(${geom}))
            ) AS too_fine
       FROM "${escapeIdentifier(sourceTable)}"
       WHERE ${geom} IS NOT NULL`,
      { format: 'array' }
    )) as Array<{ too_fine: boolean | null }>;
    return rows[0]?.too_fine === true;
  } catch (error) {
    logger.warn(
      `Could not measure the mesh of ${sourceTable}`,
      LogCategory.DUCKDB,
      error
    );
    return false;
  }
}

async function runDerivedTableQuery(
  duck: DuckDBClientForDerivedGeometry,
  targetTable: string,
  select: string
): Promise<void> {
  await duck.query(`
    CREATE OR REPLACE TABLE "${escapeIdentifier(targetTable)}" AS
    ${select}
  `);
  duck.invalidateTableCache?.(targetTable);
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
 * coverage. A valid coverage is derived from its shared vertices, without any
 * overlay; any other coverage, or a failure of that path, goes through the
 * GEOS dissolve, re-noded on a second attempt.
 */
export async function rebuildDerivedGeometryTables(
  duck: DuckDBClientForDerivedGeometry,
  sourceTable: string,
  { isCurrent = () => true }: { isCurrent?: () => boolean } = {}
): Promise<void> {
  const escapedSource = escapeSqlString(sourceTable);
  const landTable = getDerivedLandTableName(sourceTable);
  const coverageIsValid = await isValidPolygonCoverage(duck, sourceTable);
  if (!isCurrent()) return;
  const landSelect = (macroCall: string) => `
    SELECT geom
    FROM ${macroCall}
    WHERE geom IS NOT NULL AND NOT ST_IsEmpty(geom)
  `;
  const withNodingRetry = (buildMacroCall: (nodingFactor: string) => string) =>
    [0, NODING_REPAIR_FACTOR].map((nodingFactor) =>
      buildMacroCall(`noding_factor := ${nodingFactor}`)
    );

  await createDerivedTable(duck, landTable, [
    ...(coverageIsValid
      ? [landSelect(`extract_coverage_land('${escapedSource}')`)]
      : []),
    ...withNodingRetry((noding) =>
      landSelect(`extract_land('${escapedSource}', ${noding})`)
    )
  ]);
  if (!isCurrent()) return;

  const escapedLand = escapeSqlString(landTable);
  await createDerivedTable(duck, getDerivedOuterlinesTableName(sourceTable), [
    ...(coverageIsValid
      ? [buildLineSelect(`extract_coverage_outerlines('${escapedLand}')`)]
      : []),
    ...withNodingRetry((noding) =>
      buildLineSelect(`extract_outerlines('${escapedLand}', ${noding})`)
    )
  ]);

  if (!isCurrent()) return;

  const innerlinesTable = getDerivedInnerlinesTableName(sourceTable);
  if (await isMeshTooFineForInnerLimits(duck, sourceTable)) {
    await createEmptyGeometryTable(duck, innerlinesTable);
    return;
  }

  await createDerivedTable(duck, innerlinesTable, [
    ...(coverageIsValid
      ? [buildLineSelect(`extract_coverage_innerlines('${escapedSource}')`)]
      : []),
    ...withNodingRetry((noding) =>
      buildLineSelect(`extract_innerlines('${escapedSource}', ${noding})`)
    )
  ]);
}
