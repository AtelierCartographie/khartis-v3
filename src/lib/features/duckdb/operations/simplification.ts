import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import * as m from '$lib/paraglide/messages';
import { DUCK_CONST } from '../constants';
import type { DuckDBClientForArrow } from '../orchestrator/arrow-ops';

export interface SimplificationMetrics {
  originalVertices: number;
  simplifiedVertices: number;
  reductionPercentage: number;
  duration: number;
}

export interface SimplificationOptions {
  geometryColumn?: string;
  createView?: boolean;
  inputTableName?: string;
  targetTableName?: string;
}

function buildFallbackSimplificationSelect(
  inputTableName: string,
  geometryColumn: string,
  tolerance: number
): string {
  const escapedInputTable = escapeIdentifier(inputTableName);
  const escapedGeometryColumn = escapeIdentifier(geometryColumn);
  const escapedGeom = escapeIdentifier('geom');
  const metricExpression = `CASE
    WHEN CAST(ST_GeometryType("${escapedGeometryColumn}") AS VARCHAR) IN ('LINESTRING', 'MULTILINESTRING')
      THEN ST_Length("${escapedGeometryColumn}")
    ELSE ST_Perimeter("${escapedGeometryColumn}")
  END`;
  const simplifiedExpression = `CASE
    WHEN "${escapedGeometryColumn}" IS NULL THEN NULL
    ELSE ST_Simplify("${escapedGeometryColumn}", COALESCE(computed_tolerance, 0.0))
  END`;

  if (geometryColumn === 'geom') {
    return `WITH simplification_metric AS (
      SELECT COALESCE(AVG(${metricExpression}) * ${tolerance} * 0.05, 0.0) AS computed_tolerance
      FROM "${escapedInputTable}"
      WHERE "${escapedGeometryColumn}" IS NOT NULL
    )
    SELECT * REPLACE (${simplifiedExpression} AS "${escapedGeom}")
    FROM "${escapedInputTable}", simplification_metric`;
  }

  return `WITH simplification_metric AS (
    SELECT COALESCE(AVG(${metricExpression}) * ${tolerance} * 0.05, 0.0) AS computed_tolerance
    FROM "${escapedInputTable}"
    WHERE "${escapedGeometryColumn}" IS NOT NULL
  )
  SELECT * EXCLUDE ("${escapedGeometryColumn}"), ${simplifiedExpression} AS "${escapedGeom}"
  FROM "${escapedInputTable}", simplification_metric`;
}

async function countVertices(
  Duck: DuckDBClientForArrow,
  tableName: string,
  geometryColumn: string
): Promise<number> {
  const escapedGeom = escapeIdentifier(geometryColumn);
  const escapedTable = escapeIdentifier(tableName);
  const result = (await Duck.query(
    `SELECT SUM(ST_NPoints("${escapedGeom}")) as total_vertices
     FROM "${escapedTable}"
     WHERE "${escapedGeom}" IS NOT NULL`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
  )) as Array<{ total_vertices: number | null }>;

  return result[0]?.total_vertices ?? 0;
}

/**
 * Simplify geometry using topology-aware `simplify_and_clean` macro.
 * Preserves topology between adjacent polygons (no gaps / overlaps)
 * and cleans up triangle artefacts.
 */
export async function simplifyGeometryTable(
  Duck: DuckDBClientForArrow,
  sourceTable: string,
  tolerance: number,
  options: SimplificationOptions = {}
): Promise<SimplificationMetrics> {
  const start = performance.now();
  const geometryColumn = options.geometryColumn ?? 'geom';
  const createView = options.createView ?? false;
  const inputTableName = options.inputTableName ?? sourceTable;

  const originalVertices = await countVertices(
    Duck,
    inputTableName,
    geometryColumn
  );

  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error(m.error_invalid_simplification({ tolerance }));
  }

  const escapedInput = escapeIdentifier(inputTableName);
  const targetTable = createView
    ? `vw_${sourceTable}_simplified`
    : `${sourceTable}_simplified`;
  const resolvedTargetTable = options.targetTableName ?? targetTable;
  const escapedTarget = escapeIdentifier(resolvedTargetTable);

  const createStatement = createView
    ? 'CREATE OR REPLACE VIEW'
    : 'CREATE OR REPLACE TABLE';

  try {
    await Duck.query(`
      ${createStatement} "${escapedTarget}" AS
      FROM simplify_and_clean('${escapedInput}', '${geometryColumn}', ${tolerance})
    `);
  } catch (error) {
    logger.error(
      'Failed to simplify geometry with simplify_and_clean macro, using SQL fallback',
      LogCategory.DUCKDB,
      error
    );
    await Duck.query(`
      ${createStatement} "${escapedTarget}" AS
      ${buildFallbackSimplificationSelect(
        inputTableName,
        geometryColumn,
        tolerance
      )}
    `);
  }

  // The simplify_and_clean macro always normalizes the geometry column to 'geom'
  const simplifiedVertices = await countVertices(
    Duck,
    resolvedTargetTable,
    'geom'
  );

  // Recompute innerlines from the simplified geometry so borders stay in sync
  const innerlinesTable = `${sourceTable}__innerlines`;
  const escapedInnerlines = escapeIdentifier(innerlinesTable);
  try {
    await Duck.query(`
      CREATE OR REPLACE TABLE "${escapedInnerlines}" AS
      FROM extract_innerlines('${escapedTarget}')
    `);
  } catch (error) {
    logger.error(
      'Failed to rebuild simplified geometry innerlines',
      LogCategory.DUCKDB,
      error
    );
  }

  const reductionPercentage =
    originalVertices > 0
      ? Math.round(
          ((originalVertices - simplifiedVertices) / originalVertices) * 100
        )
      : 0;

  const duration = performance.now() - start;

  return {
    originalVertices,
    simplifiedVertices,
    reductionPercentage,
    duration
  };
}

export function calculateToleranceFromRate(
  rate: number,
  _bounds?: [number, number, number, number]
): number {
  return Math.max(0, Math.min(1, rate / 100));
}
