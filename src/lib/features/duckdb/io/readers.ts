import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import * as duckdb from '@duckdb/duckdb-wasm';
import type { Table as ArrowTable } from 'apache-arrow';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import { runInTransaction } from '../core/transaction';
import type {
  DuckDBContext,
  DuckDBMetadata,
  FileWithId,
  ReadGeofileOptions,
  ReadLinkOptions,
  ReadTabularOptions
} from '../types';
import {
  dropRegisteredFile,
  extractFilename,
  generateUniqueTableName,
  getFileType,
  registerFiles
} from './file-registry';
import { isProjectionSupported, reprojectPoint } from './reprojection';

async function addRowId(
  connection: AsyncDuckDBConnection,
  table: string
): Promise<void> {
  const safeSeqName = table.replace(/[^a-zA-Z0-9_]/g, '_');
  await executeQuery(
    connection,
    `CREATE OR REPLACE SEQUENCE "id_${safeSeqName}" START 1;`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );
  await executeQuery(
    connection,
    `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS __id INTEGER DEFAULT nextval('id_${safeSeqName}');`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );
}

export async function readTabular(
  ctx: DuckDBContext,
  input: string | File,
  options: ReadTabularOptions = {}
): Promise<string> {
  const start = performance.now();
  let { tablename } = options;
  const decimal_separator =
    options.decimal_separator ?? DUCK_CONST.DEFAULT.DECIMAL_SEPARATOR;
  const format = options.format ?? DUCK_CONST.DEFAULT.FORMAT_TABULAR;
  let filename: string;
  let fileid: string;
  let cleanupFileId: string | undefined;

  const sourceType = typeof input === 'string' ? 'text' : 'file';
  logger.info('Ingesting tabular data into DuckDB', LogCategory.DUCKDB, {
    tablename,
    sourceType
  });

  try {
    if (typeof input === 'string') {
      if (!tablename) {
        tablename = generateUniqueTableName('data_paste', ctx.loaded_files);
      }
      filename = tablename;
      fileid = tablename;
      await ctx.db.registerFileText(fileid, input);
      ctx.registered_files.add(fileid);
      cleanupFileId = fileid;
    } else if (input instanceof File) {
      filename = input.name;
      if (!tablename) {
        tablename = generateUniqueTableName(filename, ctx.loaded_files);
      }
      await registerFiles(ctx.db, ctx.registered_files, [input]);
      fileid = (input as FileWithId).id;
    } else {
      throw new DataValidationError(
        'Invalid input type. Expected a string or a File.',
        undefined,
        { receivedType: typeof input }
      );
    }

    const finalTablename = tablename;
    await runInTransaction(
      ctx.connection,
      async () => {
        if (!finalTablename) {
          throw new DuckDBError('Unable to determine target table name');
        }
        if (format === DUCK_CONST.DEFAULT.FORMAT_TABULAR) {
          const escapedFileId = escapeSqlString(fileid);
          const query = `CREATE OR REPLACE TABLE "${finalTablename}" AS FROM read_csv('${escapedFileId}', header=true, decimal_separator="${decimal_separator}", normalize_names=true, nullstr=${DUCK_CONST.DEFAULT.NULL_VALUES});`;
          await executeQuery(ctx.connection, query, {
            format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
          });
        }
        if (
          format === DUCK_CONST.TYPE.PARQUET ||
          format === DUCK_CONST.TYPE.ARROW
        ) {
          const escapedFileIdBinary = escapeSqlString(fileid);
          await executeQuery(
            ctx.connection,
            `CREATE OR REPLACE TABLE "${finalTablename}" AS FROM read_parquet('${escapedFileIdBinary}');`,
            { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
          );
        }
        await addRowId(ctx.connection, finalTablename);
      },
      'read_tabular'
    );

    if (!tablename) {
      throw new DuckDBError('Unable to determine target table name');
    }

    ctx.loaded_files.set(tablename, filename);
    logger.success('Tabular data ingested', LogCategory.DUCKDB, {
      tablename,
      filename,
      durationMs: (performance.now() - start).toFixed(2)
    });
    return tablename;
  } catch (error) {
    logger.error('Failed to read tabular data', LogCategory.DUCKDB, error);
    throw error;
  } finally {
    if (cleanupFileId) {
      await dropRegisteredFile(ctx.db, ctx.registered_files, cleanupFileId);
    }
  }
}

interface GeofileMetadata {
  crs: string | null;
  geometryColumn: string;
}

async function ensureSpatialExtension(ctx: DuckDBContext): Promise<void> {
  if (ctx.extensionsLoaded.spatial) return;

  try {
    await executeQuery(ctx.connection, `LOAD spatial;`, {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    });
    ctx.extensionsLoaded.spatial = true;
  } catch {
    try {
      await executeQuery(ctx.connection, `INSTALL spatial; LOAD spatial;`, {
        format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
      });
      ctx.extensionsLoaded.spatial = true;
    } catch (error) {
      logger.error(
        'Failed to load spatial extension',
        LogCategory.DUCKDB,
        error
      );
      throw error;
    }
  }
}

async function detectGeofileMetadata(
  ctx: DuckDBContext,
  fileId: string
): Promise<GeofileMetadata> {
  const defaultResult: GeofileMetadata = { crs: null, geometryColumn: 'geom' };
  try {
    await ensureSpatialExtension(ctx);

    const escapedFileId = escapeSqlString(fileId);
    const result = (await executeQuery(
      ctx.connection,
      `SELECT
         layers[1].geometry_fields[1].crs.auth_code AS crs_code,
         layers[1].geometry_fields[1].name AS geom_name
       FROM ST_Read_Meta('${escapedFileId}')`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_TABLE }
    )) as ArrowTable;
    if (result && result.numRows > 0) {
      const crsCode = result.getChild('crs_code')?.get(0);
      const geomName = result.getChild('geom_name')?.get(0);
      let crs: string | null = null;
      if (crsCode) {
        if (typeof crsCode === 'number') {
          crs = `EPSG:${crsCode}`;
        } else if (typeof crsCode === 'string') {
          crs = crsCode.includes('EPSG') ? crsCode : `EPSG:${crsCode}`;
        } else if (typeof crsCode === 'bigint') {
          crs = `EPSG:${crsCode}`;
        }
      }
      return {
        crs,
        geometryColumn:
          geomName && typeof geomName === 'string' ? geomName : 'geom'
      };
    }
    return defaultResult;
  } catch {
    return defaultResult;
  }
}

function needsReprojection(crs: string | null): boolean {
  if (!crs) return false;
  const normalizedCRS = crs.toUpperCase();
  return normalizedCRS !== 'EPSG:4326' && normalizedCRS !== 'WGS 84';
}

const DUCKDB_UNSUPPORTED_PROJECTIONS = new Set([
  'EPSG:2154', // Lambert-93 (France)
  'EPSG:27572', // Lambert II étendu (France)
  'EPSG:3035' // ETRS89-LAEA (Europe)
]);

function shouldUseDuckDBTransform(crs: string | null): boolean {
  if (!crs) return false;
  const normalized = crs.toUpperCase();
  if (DUCKDB_UNSUPPORTED_PROJECTIONS.has(normalized)) {
    return false;
  }
  return true;
}

async function tryDuckDBReprojection(
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
      {
        sourceCRS
      }
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
      {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    );
    return false;
  }
}

async function applyProj4Reprojection(
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
    throw new DuckDBError('No data found in geofile');
  }

  const geomType = result.getChild('geom_type')?.get(0);
  const isPoint = geomType === 'POINT' || geomType === 'MULTIPOINT';

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

  const BATCH_SIZE = 5000;
  for (let i = 0; i < valueRows.length; i += BATCH_SIZE) {
    const batch = valueRows.slice(i, i + BATCH_SIZE);
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
    {
      rowCount: valueRows.length,
      sourceCRS
    }
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

  const BATCH_SIZE = 1000;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
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
    {
      rowCount: updates.length,
      sourceCRS
    }
  );
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

export async function readGeofile(
  ctx: DuckDBContext,
  geofile: File,
  options: ReadGeofileOptions = {}
): Promise<DuckDBMetadata | string> {
  const start = performance.now();
  let { tablename } = options;
  const meta = options.meta ?? false;
  const shapefile = options.shapefile ?? false;

  try {
    await registerFiles(ctx.db, ctx.registered_files, [geofile], { shapefile });
    const geofileWithId = geofile as FileWithId;

    if (meta) {
      const escapedFileIdMeta = escapeSqlString(geofileWithId.id);
      const result = await executeQuery(
        ctx.connection,
        `FROM ST_Read_Meta('${escapedFileIdMeta}')
				SELECT
					file_name AS name,
					driver_short_name AS format,
					layers[1].feature_count AS nb_entities,
					layers[1].geometry_fields[1].type AS geometry,
					layers[1].geometry_fields[1].crs.name AS crs`,
        { format: DUCK_CONST.QUERY_FORMAT.ARROW_TABLE }
      );
      return result as DuckDBMetadata;
    }

    if (!tablename) {
      tablename = generateUniqueTableName(geofile.name, ctx.loaded_files);
    }

    const geoMeta = await detectGeofileMetadata(ctx, geofileWithId.id);
    const shouldReproject = needsReprojection(geoMeta.crs);
    const geomCol = geoMeta.geometryColumn;
    let usedProj4Fallback = false;

    if (shouldReproject) {
      logger.info('Reprojecting geometry to WGS84', LogCategory.DUCKDB, {
        sourceCRS: geoMeta.crs,
        targetCRS: 'EPSG:4326',
        geometryColumn: geomCol,
        filename: geofile.name
      });
    }

    const finalTablename = tablename;
    await runInTransaction(
      ctx.connection,
      async () => {
        const escapedGeoFileId = escapeSqlString(geofileWithId.id);

        if (shouldReproject) {
          const duckDBSuccess = await tryDuckDBReprojection(
            ctx,
            finalTablename,
            geofileWithId.id,
            geomCol,
            geoMeta.crs
          );

          if (!duckDBSuccess) {
            if (geoMeta.crs && isProjectionSupported(geoMeta.crs)) {
              logger.info(
                'Using proj4 fallback for reprojection',
                LogCategory.DUCKDB,
                {
                  sourceCRS: geoMeta.crs,
                  filename: geofile.name
                }
              );
              await applyProj4Reprojection(
                ctx,
                finalTablename,
                geofileWithId.id,
                geomCol,
                geoMeta.crs
              );
              usedProj4Fallback = true;
            } else {
              logger.warn(
                'Unsupported projection, loading without reprojection',
                LogCategory.DUCKDB,
                {
                  sourceCRS: geoMeta.crs,
                  filename: geofile.name
                }
              );
              await executeQuery(
                ctx.connection,
                `CREATE OR REPLACE TABLE "${finalTablename}" AS FROM ST_Read('${escapedGeoFileId}');`,
                { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
              );
            }
          }
        } else {
          await executeQuery(
            ctx.connection,
            `CREATE OR REPLACE TABLE "${finalTablename}" AS FROM ST_Read('${escapedGeoFileId}');`,
            { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
          );
        }
        await addRowId(ctx.connection, finalTablename!);
      },
      'read_geofile'
    );

    if (!tablename) {
      throw new DuckDBError('Unable to determine target table name');
    }

    ctx.loaded_files.set(tablename, geofile.name);
    logger.success('Geofile ingested', LogCategory.DUCKDB, {
      tablename,
      filename: geofile.name,
      reprojected: shouldReproject,
      usedProj4Fallback,
      durationMs: (performance.now() - start).toFixed(2)
    });
    return tablename;
  } catch (error) {
    logger.error('Failed to read geofile', LogCategory.DUCKDB, error);
    throw error;
  }
}

export async function readLink(
  ctx: DuckDBContext,
  url: string,
  options: ReadLinkOptions = {}
): Promise<string> {
  const start = performance.now();
  let { tablename } = options;
  const decimal_separator =
    options.decimal_separator ?? DUCK_CONST.DEFAULT.DECIMAL_SEPARATOR;

  const filename = extractFilename(url);
  const file_type = getFileType(filename);

  if (!tablename) {
    tablename = generateUniqueTableName(filename, ctx.loaded_files);
  }

  logger.info('Ingesting remote file into DuckDB', LogCategory.DUCKDB, {
    url,
    filename,
    inferredType: file_type,
    tablename
  });

  await ctx.db.registerFileURL(
    filename,
    url,
    duckdb.DuckDBDataProtocol.HTTP,
    false
  );

  try {
    const finalTablename = tablename;
    await runInTransaction(
      ctx.connection,
      async () => {
        if (!finalTablename) {
          throw new DuckDBError('Unable to determine target table name');
        }
        const escapedFilename = escapeSqlString(filename);

        switch (file_type) {
          case DUCK_CONST.TYPE.TABULAR:
            await executeQuery(
              ctx.connection,
              `CREATE OR REPLACE TABLE "${finalTablename}" AS FROM read_csv('${escapedFilename}', header=true, decimal_separator="${decimal_separator}", normalize_names=true, nullstr=${DUCK_CONST.DEFAULT.NULL_VALUES});`,
              { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
            );
            break;

          case DUCK_CONST.TYPE.PARQUET:
          // falls through

          case DUCK_CONST.TYPE.ARROW:
            await executeQuery(
              ctx.connection,
              `CREATE OR REPLACE TABLE "${finalTablename}" AS FROM read_parquet('${escapedFilename}');`,
              { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
            );
            break;

          case DUCK_CONST.TYPE.GEOFILE:
            await executeQuery(
              ctx.connection,
              `CREATE OR REPLACE TABLE "${finalTablename}" AS FROM ST_Read('${escapedFilename}');`,
              { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
            );
            break;
        }
        await addRowId(ctx.connection, finalTablename);
      },
      'read_link'
    );

    if (!tablename) {
      throw new DuckDBError('Unable to determine target table name');
    }

    ctx.loaded_files.set(tablename, filename);
    logger.success('Remote file ingested', LogCategory.DUCKDB, {
      tablename,
      filename,
      durationMs: (performance.now() - start).toFixed(2)
    });
    return tablename;
  } catch (error) {
    logger.error('Failed to read file url', LogCategory.DUCKDB, error);
    throw error;
  }
}
