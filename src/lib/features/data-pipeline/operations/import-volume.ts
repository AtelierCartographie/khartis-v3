import { IMPORT_ROW_LIMITS } from '$lib/features/commons/constants/validation.config';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';
import { resolveLocale } from '$lib/features/commons/utils/format.utils';
import { showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import * as m from '$lib/paraglide/messages';

interface DuckDBImportVolumeClient {
  query(
    sql: string,
    options: { format: 'array'; useProxy?: boolean }
  ): Promise<unknown>;
}

export function assertImportRowCountWithinLimit(
  rowCount: number,
  fileName: string
): void {
  if (rowCount <= IMPORT_ROW_LIMITS.MAX) {
    return;
  }

  const locale = resolveLocale();
  throw new DataValidationError(
    m.import_error_row_limit_exceeded({
      fileName,
      rowCount: rowCount.toLocaleString(locale),
      maxRows: IMPORT_ROW_LIMITS.MAX.toLocaleString(locale)
    }),
    'rowCount',
    { fileName, rowCount, maxRows: IMPORT_ROW_LIMITS.MAX }
  );
}

export function warnOnLargeImport(rowCount: number): void {
  if (rowCount <= IMPORT_ROW_LIMITS.WARNING) {
    return;
  }

  const locale = resolveLocale();
  showWarning(
    m.warning_performance_title(),
    m.data_quality_perf_large_dataset({
      rowCount: rowCount.toLocaleString(locale),
      warningRows: IMPORT_ROW_LIMITS.WARNING.toLocaleString(locale)
    })
  );
}

export async function readParquetRowCount(
  duck: DuckDBImportVolumeClient,
  fileId: string
): Promise<number | null> {
  try {
    const result = (await duck.query(
      `SELECT num_rows FROM parquet_file_metadata('${escapeSqlString(fileId)}')`,
      { format: 'array', useProxy: false }
    )) as Array<{ num_rows?: number | bigint }>;

    const total = result.reduce(
      (sum, row) => sum + Number(row.num_rows ?? 0),
      0
    );
    return Number.isFinite(total) ? total : null;
  } catch (error) {
    logger.error('Failed to read Parquet row count', LogCategory.DATA, error);
    return null;
  }
}
