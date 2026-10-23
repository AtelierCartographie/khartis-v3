import { markTableMutated } from '../cache/cache-manager';
import { DUCK_CONST } from '../constants';
import { ensureExtension } from '../core/extensions';
import { executeQuery } from '../core/query';
import type { DuckDBContext } from '../types';
import { addRowId } from './reader-utils';
import { promoteImportedTextDates } from './text-dates';
import {
  sqlIdentifier,
  sqlString
} from '$lib/features/commons/utils/sql.utils';

interface FileWithId extends File {
  id?: string;
}

export interface ReadJsonTabularOptions {
  tablename: string;
}

export async function readJsonTabular(
  ctx: DuckDBContext,
  file: File,
  options: ReadJsonTabularOptions
): Promise<string> {
  const { tablename } = options;
  const fileid = (file as FileWithId).id ?? file.name;

  await ensureExtension(ctx, 'json');

  await executeQuery(
    ctx.connection,
    `CREATE OR REPLACE TABLE ${sqlIdentifier(tablename)} AS FROM read_json_auto(${sqlString(fileid)});`,
    { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
  );

  await promoteImportedTextDates(ctx.connection, tablename);
  ctx.loaded_files.set(tablename, file.name);
  markTableMutated(ctx, tablename);
  await addRowId(ctx.connection, tablename);
  // read_json keeps the handle open in the worker; register it for cleanup
  // when the table is dropped instead of dropping it now.
  ctx.table_files.set(tablename, fileid);

  return tablename;
}
