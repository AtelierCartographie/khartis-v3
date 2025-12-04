import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import * as duckdb from '@duckdb/duckdb-wasm';
import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
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
  extractFilename,
  generateUniqueTableName,
  getFileType,
  registerFiles,
  dropRegisteredFile
} from './file-registry';

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
        if (format === DUCK_CONST.TYPE.PARQUET) {
          const escapedFileIdParquet = escapeSqlString(fileid);
          await executeQuery(
            ctx.connection,
            `CREATE OR REPLACE TABLE "${finalTablename}" AS FROM read_parquet('${escapedFileIdParquet}');`,
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

    const finalTablename = tablename;
    await runInTransaction(
      ctx.connection,
      async () => {
        const escapedGeoFileId = escapeSqlString(geofileWithId.id);
        await executeQuery(
          ctx.connection,
          `CREATE OR REPLACE TABLE "${finalTablename}" AS FROM ST_Read('${escapedGeoFileId}');`,
          { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
        );
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
