import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type { Table as ArrowTable } from 'apache-arrow';
import {
  DUCK_CONST,
  EXTENSIONS,
  GEO_CONSTANTS,
  SQL_FUNCTIONS
} from '../constants';
import { executeQuery } from '../core/query';
import { runInTransaction } from '../core/transaction';
import type {
  DuckDBContext,
  DuckDBMetadata,
  FileWithId,
  ReadGeofileOptions
} from '../types';
import { generateUniqueTableName, registerFiles } from './file-registry';
import {
  applyProj4Reprojection,
  isProjectionSupported,
  tryDuckDBReprojection
} from './geofile-reprojection';
import { addRowId } from './reader-utils';

interface GeofileMetadata {
  crs: string | null;
  geometryColumn: string;
}

async function ensureSpatialExtension(ctx: DuckDBContext): Promise<void> {
  if (ctx.extensionsLoaded.spatial) return;

  try {
    await executeQuery(ctx.connection, `LOAD ${EXTENSIONS.SPATIAL};`, {
      format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
    });
    ctx.extensionsLoaded.spatial = true;
  } catch {
    try {
      await executeQuery(
        ctx.connection,
        `INSTALL ${EXTENSIONS.SPATIAL}; LOAD ${EXTENSIONS.SPATIAL};`,
        {
          format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
        }
      );
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
  const defaultResult: GeofileMetadata = {
    crs: null,
    geometryColumn: INTERNAL_COLUMN.GEOM
  };
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
          geomName && typeof geomName === 'string'
            ? geomName
            : INTERNAL_COLUMN.GEOM
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
  return (
    normalizedCRS !== GEO_CONSTANTS.WGS84_CRS && normalizedCRS !== 'WGS 84'
  );
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
        `FROM ${SQL_FUNCTIONS.ST_READ_META}('${escapedFileIdMeta}')
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
        targetCRS: GEO_CONSTANTS.WGS84_CRS,
        geometryColumn: geomCol,
        filename: geofile.name
      });
    }

    const finalTablename = tablename;
    const escapedFinalTable = escapeIdentifier(finalTablename);
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
                `CREATE OR REPLACE TABLE "${escapedFinalTable}" AS FROM ST_Read('${escapedGeoFileId}');`,
                { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
              );
            }
          }
        } else {
          await executeQuery(
            ctx.connection,
            `CREATE OR REPLACE TABLE "${escapedFinalTable}" AS FROM ST_Read('${escapedGeoFileId}');`,
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
