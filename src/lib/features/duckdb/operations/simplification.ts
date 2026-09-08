import { rebuildDerivedGeometryTables } from './derived-geometry';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/pipeline.errors';
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

type SimplificationMacro =
  'simplify_and_clean' | 'simplify_and_clean_linestring' | null;

async function resolveSimplificationMacro(
  Duck: DuckDBClientForArrow,
  tableName: string,
  geometryColumn: string
): Promise<SimplificationMacro> {
  const escapedGeom = escapeIdentifier(geometryColumn);
  const escapedTable = escapeIdentifier(tableName);
  const rows = (await Duck.query(
    `SELECT DISTINCT ST_GeometryType("${escapedGeom}") AS geometry_type
     FROM "${escapedTable}"
     WHERE "${escapedGeom}" IS NOT NULL`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
  )) as Array<{ geometry_type: string | null }>;
  const geometryTypes = rows
    .map((row) => row.geometry_type?.toUpperCase())
    .filter((type): type is string => Boolean(type));

  if (
    geometryTypes.length > 0 &&
    geometryTypes.every((type) => type.includes('LINESTRING'))
  ) {
    return 'simplify_and_clean_linestring';
  }

  if (
    geometryTypes.length > 0 &&
    geometryTypes.every((type) => type.includes('POLYGON'))
  ) {
    return 'simplify_and_clean';
  }

  return null;
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
    throw new DataValidationError(
      m.error_invalid_simplification({ tolerance }),
      'tolerance',
      { tolerance }
    );
  }

  const escapedInputValue = escapeSqlString(inputTableName);
  const escapedInput = escapeIdentifier(inputTableName);
  const escapedGeometryColumnValue = escapeSqlString(geometryColumn);
  const escapedGeometryColumn = escapeIdentifier(geometryColumn);
  const targetTable = createView
    ? `vw_${sourceTable}_simplified`
    : `${sourceTable}_simplified`;
  const resolvedTargetTable = options.targetTableName ?? targetTable;
  const escapedTarget = escapeIdentifier(resolvedTargetTable);

  const createStatement = createView
    ? 'CREATE OR REPLACE VIEW'
    : 'CREATE OR REPLACE TABLE';
  const simplificationMacro = await resolveSimplificationMacro(
    Duck,
    inputTableName,
    geometryColumn
  );

  try {
    if (simplificationMacro) {
      await Duck.query(`
        ${createStatement} "${escapedTarget}" AS
        FROM ${simplificationMacro}('${escapedInputValue}', '${escapedGeometryColumnValue}', ${tolerance})
      `);
    } else {
      await Duck.query(`
        ${createStatement} "${escapedTarget}" AS
        SELECT
          * EXCLUDE ("${escapedGeometryColumn}"),
          "${escapedGeometryColumn}" AS geom
        FROM "${escapedInput}"
      `);
    }
    Duck.invalidateTableCache?.(resolvedTargetTable);
  } catch (error) {
    logger.error(
      'Topology-preserving simplification failed; geometry left unsimplified',
      LogCategory.DUCKDB,
      error
    );
    throw new DuckDBError(m.error_simplification_topology_failed(), undefined, {
      sourceTable,
      inputTableName,
      tolerance,
      cause: error instanceof Error ? error.message : String(error)
    });
  }

  // The simplify_and_clean macro always normalizes the geometry column to 'geom'
  const simplifiedVertices = await countVertices(
    Duck,
    resolvedTargetTable,
    'geom'
  );

  if (simplificationMacro === 'simplify_and_clean') {
    // The derived territory and borders describe the previous geometry.
    await rebuildDerivedGeometryTables(Duck, resolvedTargetTable);
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

export function calculateToleranceFromRate(rate: number): number {
  return Math.max(0, Math.min(1, rate / 100));
}
