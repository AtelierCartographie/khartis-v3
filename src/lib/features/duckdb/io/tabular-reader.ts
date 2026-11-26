import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/pipeline.errors';
import {
  isUtf8,
  transcodeLegacyTextToUtf8
} from '$lib/features/commons/utils/file-import.utils';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import {
  isSingularCount,
  resolveLocale
} from '$lib/features/commons/utils/format.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { notificationManager } from '$lib/features/commons/utils/notification.utils.svelte';
import * as m from '$lib/paraglide/messages';
import { markTableMutated } from '../cache/cache-manager';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import { runInTransaction } from '../core/transaction';
import type { DuckDBContext, FileWithId, ReadTabularOptions } from '../types';
import {
  dropRegisteredFile,
  generateUniqueTableName,
  registerFiles
} from './file-registry';
import {
  addRowId,
  CSV_STORE_REJECTS_OPTIONS,
  type CsvRejectedLines,
  restoreNormalizedColumnNames,
  takeCsvRejectedLines
} from './reader-utils';
import { promoteImportedTextDates } from './text-dates';

const SAFE_CSV_DELIMITERS = new Set([';', ',', '\t', '|']);
const SAFE_CSV_DECIMAL_SEPARATORS = new Set(['.', ',']);
const SAFE_CSV_THOUSANDS_SEPARATORS = new Set(['.', ',', ' ']);

function resolveCsvDecimalSeparator(value: string): string {
  return value.length === 1 && SAFE_CSV_DECIMAL_SEPARATORS.has(value)
    ? value
    : DUCK_CONST.DEFAULT.DECIMAL_SEPARATOR;
}

function resolveCsvThousandsSeparator(
  value: string | undefined
): string | undefined {
  if (!value) return undefined;
  return value.length === 1 && SAFE_CSV_THOUSANDS_SEPARATORS.has(value)
    ? value
    : undefined;
}

function resolveCsvDelimiter(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.length !== 1 || !SAFE_CSV_DELIMITERS.has(value)) {
    throw new DuckDBError(m.error_invalid_csv_delimiter());
  }
  return value;
}

function warnRejectedCsvLines(
  filename: string,
  rejected: CsvRejectedLines
): void {
  const locale = resolveLocale();
  const lines =
    rejected.sample.map((line) => line.toLocaleString(locale)).join(', ') +
    (rejected.count > rejected.sample.length ? '…' : '');
  const count = rejected.count.toLocaleString(locale);
  logger.warn('CSV lines skipped by ignore_errors', LogCategory.DUCKDB, {
    filename,
    rejected
  });
  // Rows are missing from the table: the warning stays until it is closed.
  notificationManager.warning({
    title: m.warning_csv_lines_skipped_title(),
    subtitle: isSingularCount(rejected.count, locale)
      ? m.warning_csv_lines_skipped_message_one({ lines })
      : m.warning_csv_lines_skipped_message({ count, lines }),
    timeout: 0
  });
}

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
 * @param options.format - The format of the input data: 'csv' (default) or 'parquet'.
 * @returns The name of the created table.
 */
export async function readTabular(
  ctx: DuckDBContext,
  input: string | File,
  options: ReadTabularOptions = {}
): Promise<string> {
  let { tablename } = options;
  const decimal_separator = resolveCsvDecimalSeparator(
    options.decimal_separator ?? DUCK_CONST.DEFAULT.DECIMAL_SEPARATOR
  );
  const thousands_separator = resolveCsvThousandsSeparator(
    options.thousands_separator
  );
  const delimiter = resolveCsvDelimiter(options.delimiter);
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
    const csvRejects: { lines: CsvRejectedLines | null } = { lines: null };
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
                csvOptions.push(
                  'ignore_errors=true',
                  ...CSV_STORE_REJECTS_OPTIONS
                );
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
              const query = `CREATE OR REPLACE TABLE "${escapeIdentifier(finalTablename)}" AS FROM read_csv('${escapedFileId}', ${csvOptions.join(', ')});`;
              await executeQuery(ctx.connection, query, {
                format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
              });
              csvRejects.lines =
                ignoreErrors || retryOptions.ignoreErrors
                  ? await takeCsvRejectedLines(ctx.connection)
                  : null;
            };

            if (recoveryMode) {
              await runCsvImport({ ignoreErrors: true, allVarchar: true });
            } else {
              await runCsvImport();
            }

            if (shouldRetryWithIgnoreErrors && !recoveryMode) {
              const rowCountResult = (await executeQuery(
                ctx.connection,
                `SELECT COUNT(*) AS cnt FROM "${escapeIdentifier(finalTablename)}"`,
                { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
              )) as Array<{ cnt: number | string }>;
              const parsedRowCount = Number(rowCountResult?.[0]?.cnt ?? 0);

              if (parsedRowCount === 0) {
                await runCsvImport({ ignoreErrors: true, allVarchar: true });
              }
            }

            await restoreNormalizedColumnNames(ctx.connection, finalTablename);
            await promoteImportedTextDates(ctx.connection, finalTablename);
          }

          if (format === DUCK_CONST.TYPE.PARQUET) {
            const escapedFileIdBinary = escapeSqlString(fileid);
            await executeQuery(
              ctx.connection,
              `CREATE OR REPLACE TABLE "${escapeIdentifier(finalTablename)}" AS FROM read_parquet('${escapedFileIdBinary}');`,
              { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
            );
          }

          await addRowId(ctx.connection, finalTablename);
        },
        'read_tabular',
        {
          logRollback: recoveryMode || !shouldRetryWithIgnoreErrors
        }
      );
    };

    let imported = false;
    try {
      await runImportInTransaction(false);
      imported = true;
    } catch (error) {
      if (!shouldRetryWithIgnoreErrors) {
        throw error;
      }
    }

    if (!imported && input instanceof File && !(await isUtf8(input))) {
      await dropRegisteredFile(ctx.db, ctx.registered_files, fileid);
      const utf8File = await transcodeLegacyTextToUtf8(input);
      await registerFiles(ctx.db, ctx.registered_files, [utf8File]);
      fileid = (utf8File as FileWithId).id;
      try {
        await runImportInTransaction(false);
        imported = true;
      } catch {
        // The recovery import below reads the transcoded file.
      }
    }

    if (!imported) {
      await runImportInTransaction(true);
    }

    if (!tablename) {
      throw new DuckDBError(m.error_unable_determine_table());
    }

    if (
      options.report_skipped_lines &&
      csvRejects.lines &&
      csvRejects.lines.count > 0
    ) {
      warnRejectedCsvLines(filename, csvRejects.lines);
    }

    ctx.loaded_files.set(tablename, filename);
    // Deterministic table names make CREATE OR REPLACE reuse an already
    // analysed name: cached stats for it are now stale.
    markTableMutated(ctx, tablename);
    if (input instanceof File) {
      // Table data is materialized; drop the handle so the worker releases the File (replay re-registers).
      await dropRegisteredFile(ctx.db, ctx.registered_files, fileid);
    }
    return tablename;
  } finally {
    if (cleanupFileId) {
      await dropRegisteredFile(ctx.db, ctx.registered_files, cleanupFileId);
    }
  }
}
