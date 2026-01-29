import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { SimplificationLevel } from '$lib/features/commons/types/enums';
import { Schema, Table, tableFromIPC } from 'apache-arrow/Arrow';
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
  preserveTopology?: boolean;
  createView?: boolean;
}

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
  const result = (await Duck.query(
    `SELECT SUM(ST_NPoints("${geometryColumn}")) as total_vertices
     FROM "${tableName}"
     WHERE "${geometryColumn}" IS NOT NULL`,
    { format: 'array' as never }
  )) as Array<{ total_vertices: number | null }>;

  return result[0]?.total_vertices ?? 0;
}

export async function simplifyGeometryTable(
  Duck: DuckDBClientForArrow,
  sourceTable: string,
  tolerance: number,
  options: SimplificationOptions = {}
): Promise<SimplificationMetrics> {
  const start = performance.now();
  const geometryColumn = options.geometryColumn ?? 'geom';
  const preserveTopology = options.preserveTopology ?? true;
  const createView = options.createView ?? false;

  logger.info('Starting geometry simplification', LogCategory.DUCKDB, {
    sourceTable,
    tolerance,
    geometryColumn,
    preserveTopology
  });

  const originalVertices = await countVertices(
    Duck,
    sourceTable,
    geometryColumn
  );

  const targetTable = createView
    ? `vw_${sourceTable}_simplified`
    : `${sourceTable}_simplified`;

  const simplifyFunction = preserveTopology
    ? 'ST_SimplifyPreserveTopology'
    : 'ST_Simplify';

  const createStatement = createView
    ? 'CREATE OR REPLACE VIEW'
    : 'CREATE OR REPLACE TABLE';

  await Duck.query(`
    ${createStatement} "${targetTable}" AS
    SELECT * REPLACE (
      ${simplifyFunction}("${geometryColumn}", ${tolerance}) AS "${geometryColumn}"
    )
    FROM "${sourceTable}"
    WHERE "${geometryColumn}" IS NOT NULL
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
  const preserveTopology = options.preserveTopology ?? true;

  const simplifyFunction = preserveTopology
    ? 'ST_SimplifyPreserveTopology'
    : 'ST_Simplify';

  logger.debug('Fetching simplified Arrow table', LogCategory.DUCKDB, {
    tableName,
    tolerance,
    simplifyFunction
  });

  const buffer = (await Duck.query(
    `SELECT * REPLACE (
       ST_AsWKB(${simplifyFunction}("${geometryColumn}", ${tolerance})) AS "${geometryColumn}"
     )
     FROM "${tableName}"
     WHERE "${geometryColumn}" IS NOT NULL`,
    { format: 'arrow-ipc' as never }
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
  bounds?: [number, number, number, number]
): number {
  if (!bounds) {
    return 0.001;
  }

  const [minX, minY, maxX, maxY] = bounds;
  const extent = Math.max(maxX - minX, maxY - minY);

  return (extent * rate) / 10000;
}

export async function tableToArrowWithGeoMetadata(
  Duck: DuckDBClientForArrow,
  tableName: string,
  originalSchema?: Schema
): Promise<Table> {
  const buffer = (await Duck.query(`SELECT * FROM "${tableName}"`, {
    format: 'arrow-ipc' as never
  })) as ArrayBuffer | Uint8Array;

  const ipcBuffer =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let arrowTable = tableFromIPC(ipcBuffer);

  if (originalSchema?.metadata) {
    const geoMetadata = originalSchema.metadata.get('geo');
    if (geoMetadata) {
      const newSchema = new Schema(
        arrowTable.schema.fields,
        new Map([['geo', geoMetadata]])
      );
      arrowTable = new Table(newSchema, arrowTable.batches);

      logger.debug(
        'GeoArrow metadata preserved from original schema',
        LogCategory.DUCKDB,
        {
          tableName
        }
      );
    }
  }

  return arrowTable;
}
