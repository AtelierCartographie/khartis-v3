import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import { SimplificationLevel } from '$lib/features/commons/types/enums';
import { Table, tableFromIPC } from 'apache-arrow/Arrow';
import { DUCK_CONST } from '../constants';
import type { DuckDBClientForArrow } from '../orchestrator/arrow-ops';
import { addGeoArrowMetadataFromDuckDB } from '../orchestrator/arrow-ops';

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

/**
 * Normalized simplification factor mapped from preset levels.
 * 0.0 = no simplification, 1.0 = maximum simplification.
 */
export const SIMPLIFICATION_FACTOR = {
  [SimplificationLevel.Low]: 0.15,
  [SimplificationLevel.Medium]: 0.4,
  [SimplificationLevel.High]: 0.75
} as const;

/** Legacy tolerance values kept for backward compatibility with stored state. */
export const SIMPLIFICATION_TOLERANCE = {
  [SimplificationLevel.Low]: 0.0001,
  [SimplificationLevel.Medium]: 0.001,
  [SimplificationLevel.High]: 0.01
} as const;

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

  logger.info(
    'Starting topology-aware geometry simplification',
    LogCategory.DUCKDB,
    { sourceTable, tolerance, geometryColumn }
  );

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

  const simplifiedVertices = await countVertices(
    Duck,
    targetTable,
    geometryColumn
  );

  const reductionPercentage =
    originalVertices > 0
      ? Math.round(
          ((originalVertices - simplifiedVertices) / originalVertices) * 100
        )
      : 0;

  const duration = performance.now() - start;

  logger.success('Geometry simplification completed', LogCategory.DUCKDB, {
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

export async function getSimplifiedArrowTable(
  Duck: DuckDBClientForArrow,
  tableName: string,
  tolerance: number,
  options: SimplificationOptions = {}
): Promise<Table> {
  const geometryColumn = options.geometryColumn ?? 'geom';

  if (!Number.isFinite(tolerance) || tolerance < 0) {
    throw new Error(`Invalid simplification tolerance: ${tolerance}`);
  }

  const escapedTable = escapeIdentifier(tableName);

  logger.debug('Fetching simplified Arrow table', LogCategory.DUCKDB, {
    tableName,
    tolerance
  });

  const buffer = (await Duck.query(
    `SELECT * REPLACE (ST_AsWKB(geom) AS geom)
     FROM simplify_and_clean('${escapedTable}', '${geometryColumn}', ${tolerance})`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  )) as ArrayBuffer | Uint8Array;

  const ipcBuffer =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let table = tableFromIPC(ipcBuffer);

  table = await addGeoArrowMetadataFromDuckDB(table, tableName, Duck);

  logger.debug('Simplified Arrow table ready', LogCategory.DUCKDB, {
    rows: table.numRows,
    columns: table.numCols
  });

  return table;
}

export function calculateToleranceFromRate(
  rate: number,
  _bounds?: [number, number, number, number]
): number {
  // The `simplify_and_clean` macro uses a normalized factor (0.0 – 1.0).
  // Convert user percentage (0 – 100) to normalized factor.
  return Math.max(0, Math.min(1, rate / 100));
}
