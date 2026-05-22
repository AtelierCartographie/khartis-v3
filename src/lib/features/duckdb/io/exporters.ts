import { DuckDBError } from '$lib/features/commons/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import * as m from '$lib/paraglide/messages';
import { PIPELINE_CONST } from '$lib/features/data-pipeline/constants';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import type { DuckDBContext } from '../types';

export async function exportToCsv(
  ctx: DuckDBContext,
  table: string,
  options?: { delimiter?: string; header?: boolean }
): Promise<string> {
  const SAFE_DELIMITERS = new Set([
    ...PIPELINE_CONST.CSV.SUPPORTED_DELIMITERS,
    ' '
  ]);
  const delimiter = options?.delimiter || PIPELINE_CONST.CSV.DEFAULT_DELIMITER;
  if (delimiter.length !== 1 || !SAFE_DELIMITERS.has(delimiter)) {
    throw new DuckDBError(m.error_invalid_csv_delimiter());
  }
  const header = options?.header !== false;
  const filename = `export_${Date.now()}.csv`;

  try {
    await executeQuery(
      ctx.connection,
      `COPY "${escapeIdentifier(table)}" TO '${filename}' (FORMAT CSV, DELIMITER '${delimiter}', HEADER ${header})`,
      { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
    );

    const buffer = await ctx.db.copyFileToBuffer(filename);
    const decoder = new TextDecoder('utf-8');
    const csvString = decoder.decode(buffer);

    return csvString;
  } finally {
    try {
      await ctx.db.dropFile(filename);
    } catch (error) {
      logger.error(
        'Failed to cleanup DuckDB export file',
        LogCategory.EXPORT,
        error
      );
    }
  }
}
