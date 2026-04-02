import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
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

  const originalVertices = await countVertices(
    Duck,
    sourceTable,
    geometryColumn
  );

  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error(`Invalid simplification tolerance: ${tolerance}`);
  }

  const escapedSource = escapeIdentifier(sourceTable);
  const targetTable = createView
    ? `vw_${sourceTable}_simplified`
    : `${sourceTable}_simplified`;
  const escapedTarget = escapeIdentifier(targetTable);

  const createStatement = createView
    ? 'CREATE OR REPLACE VIEW'
    : 'CREATE OR REPLACE TABLE';

  await Duck.query(`
    ${createStatement} "${escapedTarget}" AS
    FROM simplify_and_clean('${escapedSource}', '${geometryColumn}', ${tolerance})
  `);

  // The simplify_and_clean macro always normalizes the geometry column to 'geom'
  const simplifiedVertices = await countVertices(Duck, targetTable, 'geom');

  // Recompute innerlines from the simplified geometry so borders stay in sync
  const innerlinesTable = `${sourceTable}__innerlines`;
  const escapedInnerlines = escapeIdentifier(innerlinesTable);
  try {
    await Duck.query(`
      CREATE OR REPLACE TABLE "${escapedInnerlines}" AS
      FROM extract_innerlines('${escapedTarget}')
    `);
    logger.debug(
      'Innerlines recomputed after simplification',
      LogCategory.DUCKDB,
      {
        innerlinesTable,
        sourceTable: targetTable
      }
    );
  } catch (error) {
    logger.warn(
      'Failed to recompute innerlines after simplification',
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

  logger.debug('Geometry simplification completed', LogCategory.DUCKDB, {
    targetTable,
    originalVertices,
    simplifiedVertices,
    reductionPercentage: `${reductionPercentage}%`,
    durationMs: duration.toFixed(2)
  });

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
  // The `simplify_and_clean` macro uses a normalized factor (0.0 – 1.0).
  // Convert user percentage (0 – 100) to normalized factor.
  return Math.max(0, Math.min(1, rate / 100));
}
