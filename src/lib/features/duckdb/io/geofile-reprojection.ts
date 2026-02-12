import { isPointGeometry } from '$lib/features/commons/constants/geometry.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import type { Table as ArrowTable } from 'apache-arrow';
import { DUCK_CONST, READER_CONSTANTS } from '../constants';
import { executeQuery } from '../core/query';
import type { DuckDBContext } from '../types';
import { isProjectionSupported, reprojectPoint } from './reprojection';

function shouldUseDuckDBTransform(crs: string | null): boolean {
  if (!crs) return false;
  return !READER_CONSTANTS.DUCKDB_UNSUPPORTED_PROJECTIONS.has(
    crs.toUpperCase()
  );
}

export async function tryDuckDBReprojection(
  ctx: DuckDBContext,
  tablename: string,
  fileId: string,
  geomCol: string,
  sourceCRS: string | null
): Promise<boolean> {
  if (sourceCRS && !shouldUseDuckDBTransform(sourceCRS)) {
    logger.info(
      'Skipping DuckDB ST_Transform for unsupported projection',
      LogCategory.DUCKDB,
      { sourceCRS }
    );
    return false;
  }

  try {
    const escapedFileId = escapeSqlString(fileId);
    await executeQuery(
      ctx.connection,
      `CREATE OR REPLACE TABLE "${tablename}" AS
       SELECT * REPLACE (ST_Transform("${geomCol}", 'EPSG:4326') AS "${geomCol}")
       FROM ST_Read('${escapedFileId}');`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
    );
    return true;
  } catch (error) {
    logger.warn(
      'DuckDB ST_Transform failed, will try proj4 fallback',
      LogCategory.DUCKDB,
      { error: error instanceof Error ? error.message : 'Unknown error' }
    );
    return false;
  }
}

function reprojectWKT(wkt: string, sourceCRS: string): string | null {
  const coordPattern = /(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/g;

  try {
    return wkt.replace(coordPattern, (_, x, y) => {
      const result = reprojectPoint(
        parseFloat(x),
        parseFloat(y),
        sourceCRS,
        'EPSG:4326'
      );
      if (result.success && result.coordinates) {
        return `${result.coordinates[0]} ${result.coordinates[1]}`;
      }
      return `${x} ${y}`;
    });
  } catch {
    return null;
  }
}

async function reprojectPointGeometries(
  ctx: DuckDBContext,
  tablename: string,
  geomCol: string,
  sourceCRS: string
): Promise<void> {
  const coordsResult = (await executeQuery(
    ctx.connection,
    `SELECT __temp_rowid, ST_X("${geomCol}") AS x, ST_Y("${geomCol}") AS y FROM "${tablename}"`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_TABLE }
  )) as ArrowTable;

  const idCol = coordsResult.getChild('__temp_rowid');
  const xCol = coordsResult.getChild('x');
  const yCol = coordsResult.getChild('y');

  if (!idCol || !xCol || !yCol) {
    logger.warn('Missing columns for reprojection', LogCategory.DUCKDB);
    return;
  }

  const ids = idCol.toArray();
  const xs = xCol.toArray();
  const ys = yCol.toArray();

  const valueRows: string[] = [];
  for (let i = 0; i < coordsResult.numRows; i++) {
    const id = ids[i];
    const x = xs[i];
    const y = ys[i];

    if (id !== null && x !== null && y !== null) {
      const result = reprojectPoint(
        x as number,
        y as number,
        sourceCRS,
        'EPSG:4326'
      );
      if (result.success && result.coordinates) {
        valueRows.push(
          `(${id}, ${result.coordinates[0]}, ${result.coordinates[1]})`
        );
      }
    }
  }

  if (valueRows.length === 0) {
    logger.warn('No valid points to reproject', LogCategory.DUCKDB);
    return;
  }

  const tempTable = `__reproj_temp_${Date.now()}`;

  await executeQuery(
    ctx.connection,
    `CREATE TEMP TABLE "${tempTable}" (rowid BIGINT, lon DOUBLE, lat DOUBLE);`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );

  const batchSize = READER_CONSTANTS.POINT_REPROJECTION_BATCH_SIZE;
  for (let i = 0; i < valueRows.length; i += batchSize) {
    const batch = valueRows.slice(i, i + batchSize);
    await executeQuery(
      ctx.connection,
      `INSERT INTO "${tempTable}" VALUES ${batch.join(',')};`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
    );
  }

  await executeQuery(
    ctx.connection,
    `UPDATE "${tablename}" AS t
     SET "${geomCol}" = ST_Point(r.lon, r.lat)
     FROM "${tempTable}" AS r
     WHERE t.__temp_rowid = r.rowid;`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );

  await executeQuery(ctx.connection, `DROP TABLE IF EXISTS "${tempTable}";`, {
    format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
  });

  logger.success(
    'Point geometries reprojected with proj4',
    LogCategory.DUCKDB,
    { rowCount: valueRows.length, sourceCRS }
  );
}

async function reprojectComplexGeometries(
  ctx: DuckDBContext,
  tablename: string,
  geomCol: string,
  sourceCRS: string
): Promise<void> {
  const wktResult = (await executeQuery(
    ctx.connection,
    `SELECT __temp_rowid, ST_AsText("${geomCol}") AS wkt FROM "${tablename}"`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_TABLE }
  )) as ArrowTable;

  const idCol = wktResult.getChild('__temp_rowid');
  const wktCol = wktResult.getChild('wkt');

  if (!idCol || !wktCol) {
    logger.warn('Missing columns for reprojection', LogCategory.DUCKDB);
    return;
  }

  const ids = idCol.toArray();
  const wkts = wktCol.toArray();

  const updates: { id: number; wkt: string }[] = [];
  for (let i = 0; i < wktResult.numRows; i++) {
    const id = ids[i];
    const wkt = wkts[i];

    if (id !== null && wkt !== null && typeof wkt === 'string') {
      const reprojectedWkt = reprojectWKT(wkt, sourceCRS);
      if (reprojectedWkt) {
        updates.push({ id: id as number, wkt: reprojectedWkt });
      }
    }
  }

  if (updates.length === 0) {
    logger.warn('No valid geometries to reproject', LogCategory.DUCKDB);
    return;
  }

  const tempTable = `__reproj_wkt_temp_${Date.now()}`;

  await executeQuery(
    ctx.connection,
    `CREATE TEMP TABLE "${tempTable}" (rowid BIGINT, wkt VARCHAR);`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );

  const batchSize = READER_CONSTANTS.COMPLEX_GEOMETRY_REPROJECTION_BATCH_SIZE;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const valueRows = batch.map((u) => {
      const escapedWkt = u.wkt.replace(/'/g, "''");
      return `(${u.id}, '${escapedWkt}')`;
    });

    await executeQuery(
      ctx.connection,
      `INSERT INTO "${tempTable}" VALUES ${valueRows.join(',')};`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
    );
  }

  await executeQuery(
    ctx.connection,
    `UPDATE "${tablename}" AS t
     SET "${geomCol}" = ST_GeomFromText(r.wkt)::GEOMETRY
     FROM "${tempTable}" AS r
     WHERE t.__temp_rowid = r.rowid;`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );

  await executeQuery(ctx.connection, `DROP TABLE IF EXISTS "${tempTable}";`, {
    format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
  });

  logger.success(
    'Complex geometries reprojected with proj4',
    LogCategory.DUCKDB,
    { rowCount: updates.length, sourceCRS }
  );
}

export async function applyProj4Reprojection(
  ctx: DuckDBContext,
  tablename: string,
  fileId: string,
  geomCol: string,
  sourceCRS: string
): Promise<void> {
  const escapedFileId = escapeSqlString(fileId);

  await executeQuery(
    ctx.connection,
    `CREATE OR REPLACE TABLE "${tablename}" AS
     SELECT *, ROW_NUMBER() OVER () AS __temp_rowid
     FROM ST_Read('${escapedFileId}');`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );

  const result = (await executeQuery(
    ctx.connection,
    `SELECT ST_GeometryType("${geomCol}") AS geom_type
     FROM "${tablename}"
     LIMIT 1`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_TABLE }
  )) as ArrowTable;

  if (!result || result.numRows === 0) {
    throw new Error('No data found in geofile');
  }

  const geomType = result.getChild('geom_type')?.get(0);
  const isPoint = typeof geomType === 'string' && isPointGeometry(geomType);

  if (isPoint) {
    await reprojectPointGeometries(ctx, tablename, geomCol, sourceCRS);
  } else {
    await reprojectComplexGeometries(ctx, tablename, geomCol, sourceCRS);
  }

  await executeQuery(
    ctx.connection,
    `ALTER TABLE "${tablename}" DROP COLUMN __temp_rowid;`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );
}

export { isProjectionSupported };
