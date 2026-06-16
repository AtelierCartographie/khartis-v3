import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/pipeline.errors';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import * as m from '$lib/paraglide/messages';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import { runInTransaction } from '../core/transaction';
import type { DuckDBContext, FileWithId, ReadTabularOptions } from '../types';
import {
  dropRegisteredFile,
  generateUniqueTableName,
  registerFiles
} from './file-registry';
import { addRowId, restoreNormalizedColumnNames } from './reader-utils';

/**
 * Reads tabular data from a given input and creates a table in DuckDB.
 *
 * @param ctx - The DuckDB context (db, connection, loaded_files, etc.).
 * @param input - The input data: a string (copy-paste) or a File object.
 * @param options.tablename - The name of the table to create. Auto-generated if not provided.
 * @param options.decimal_separator - The decimal separator used in the CSV data (default ',').
 * @param options.thousands_separator - Optional thousands separator.
 * @param options.delimiter - Optional column delimiter.
 * @param options.header - Whether the first row is a header (default true).
 * @param options.format - The format of the input data: 'csv' (default), 'parquet', or 'arrow'.
 * @returns The name of the created table.
 */
export async function readTabular(
  ctx: DuckDBContext,
  input: string | File,
  options: ReadTabularOptions = {}
): Promise<string> {
  let { tablename } = options;
  const decimal_separator =
    options.decimal_separator ?? DUCK_CONST.DEFAULT.DECIMAL_SEPARATOR;
  const thousands_separator = options.thousands_separator;
  const delimiter = options.delimiter;
  const header = options.header ?? true;
  const ignoreErrors = options.ignore_errors ?? false;
  const allVarchar = options.all_varchar ?? false;
  const format = options.format ?? DUCK_CONST.DEFAULT.FORMAT_TABULAR;
  let filename: string;
  let fileid: string;
  let cleanupFileId: string | undefined;

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
      throw new DataValidationError(m.error_invalid_input_type(), undefined, {
        receivedType: typeof input
      });
    }

    const finalTablename = tablename;
    const shouldRetryWithIgnoreErrors =
      !ignoreErrors &&
      !allVarchar &&
      input instanceof File &&
      input.size > 0 &&
      header &&
      format === DUCK_CONST.DEFAULT.FORMAT_TABULAR;

    const runImportInTransaction = async (recoveryMode = false) => {
      await runInTransaction(
        ctx.connection,
        async () => {
          if (!finalTablename) {
            throw new DuckDBError(m.error_unable_determine_table());
          }

          if (format === DUCK_CONST.DEFAULT.FORMAT_TABULAR) {
            const escapedFileId = escapeSqlString(fileid);

            const buildCsvOptions = (
              retryOptions: {
                ignoreErrors?: boolean;
                allVarchar?: boolean;
              } = {}
            ): string[] => {
              const csvOptions: string[] = [
                `header=${header}`,
                `decimal_separator="${decimal_separator}"`,
                'normalize_names=true',
                `nullstr=${DUCK_CONST.DEFAULT.NULL_VALUES}`
              ];

              if (thousands_separator) {
                csvOptions.push(`thousands="${thousands_separator}"`);
              }

              if (delimiter) {
                csvOptions.push(`delim='${delimiter}'`);
              }

              if (ignoreErrors || retryOptions.ignoreErrors) {
                csvOptions.push('ignore_errors=true');
              }

              if (allVarchar || retryOptions.allVarchar) {
                csvOptions.push('all_varchar=true');
              }

              return csvOptions;
            };

            const runCsvImport = async (
              retryOptions: {
                ignoreErrors?: boolean;
                allVarchar?: boolean;
              } = {}
            ): Promise<void> => {
              const csvOptions = buildCsvOptions(retryOptions);
              const query = `CREATE OR REPLACE TABLE "${finalTablename}" AS FROM read_csv('${escapedFileId}', ${csvOptions.join(', ')});`;
              await executeQuery(ctx.connection, query, {
                format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
              });
            };

            if (recoveryMode) {
              await runCsvImport({ ignoreErrors: true, allVarchar: true });
            } else {
              await runCsvImport();
            }

            if (shouldRetryWithIgnoreErrors && !recoveryMode) {
              const rowCountResult = (await executeQuery(
                ctx.connection,
                `SELECT COUNT(*) AS cnt FROM "${finalTablename}"`,
                { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
              )) as Array<{ cnt: number | string }>;
              const parsedRowCount = Number(rowCountResult?.[0]?.cnt ?? 0);

              if (parsedRowCount === 0) {
                await runCsvImport({ ignoreErrors: true, allVarchar: true });
              }
            }

            await restoreNormalizedColumnNames(ctx.connection, finalTablename);
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
    };

    try {
      await runImportInTransaction(false);
    } catch (error) {
      if (!shouldRetryWithIgnoreErrors) {
        throw error;
      }

      await runImportInTransaction(true);
    }

    if (!tablename) {
      throw new DuckDBError(m.error_unable_determine_table());
    }

    ctx.loaded_files.set(tablename, filename);
    return tablename;
  } finally {
    if (cleanupFileId) {
      await dropRegisteredFile(ctx.db, ctx.registered_files, cleanupFileId);
    }
  }
}
