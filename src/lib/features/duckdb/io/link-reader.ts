import { DuckDBError } from '$lib/features/commons/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import * as m from '$lib/paraglide/messages';
import * as duckdb from '@duckdb/duckdb-wasm';
import { DUCK_CONST } from '../constants';
import { ensureHTTPFSLoaded } from '../core/engine';
import { executeQuery } from '../core/query';
import { runInTransaction } from '../core/transaction';
import type { DuckDBContext, ReadLinkOptions } from '../types';
import {
  extractFilename,
  generateUniqueTableName,
  getFileType
} from './file-registry';
import { addRowId } from './reader-utils';

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

  await ensureHTTPFSLoaded();

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
          throw new DuckDBError(m.error_unable_determine_table());
        }
        const escapedFilename = escapeSqlString(filename);
        const escapedTable = escapeIdentifier(finalTablename);

        switch (file_type) {
          case DUCK_CONST.TYPE.TABULAR:
            await executeQuery(
              ctx.connection,
              `CREATE OR REPLACE TABLE "${escapedTable}" AS FROM read_csv('${escapedFilename}', header=true, decimal_separator="${decimal_separator}", normalize_names=true, nullstr=${DUCK_CONST.DEFAULT.NULL_VALUES});`,
              { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
            );
            break;

          case DUCK_CONST.TYPE.PARQUET:
          // falls through

          case DUCK_CONST.TYPE.ARROW:
            await executeQuery(
              ctx.connection,
              `CREATE OR REPLACE TABLE "${escapedTable}" AS FROM read_parquet('${escapedFilename}');`,
              { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
            );
            break;

          case DUCK_CONST.TYPE.GEOFILE:
            await executeQuery(
              ctx.connection,
              `CREATE OR REPLACE TABLE "${escapedTable}" AS FROM ST_Read('${escapedFilename}');`,
              { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
            );
            break;
        }
        await addRowId(ctx.connection, finalTablename);
      },
      'read_link'
    );

    if (!tablename) {
      throw new DuckDBError(m.error_unable_determine_table());
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
