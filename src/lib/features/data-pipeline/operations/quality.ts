import * as m from '$lib/paraglide/messages';
import { PIPELINE_CONST } from '../constants';
import type { EnrichedColumn } from '../types';

export function computeQualityWarnings(
  columns: EnrichedColumn[],
  rowCount: number
): string[] {
  const { HIGH_NULL_RATIO_THRESHOLD, LOW_CARDINALITY_THRESHOLD } =
    PIPELINE_CONST.QUALITY;
  const warnings: string[] = [];

  if (rowCount === 0) {
    warnings.push(m.pipeline_warning_no_data_rows());
    return warnings;
  }

  if (rowCount === 1) {
    warnings.push(m.pipeline_warning_single_row());
  }

  if (rowCount < 5) {
    warnings.push(m.pipeline_warning_small_dataset({ count: String(rowCount) }));
  }

  for (const column of columns) {
    const nullRatio =
      column.stats?.count && column.stats.count > 0
        ? column.stats.nulls / column.stats.count
        : 0;

    if (nullRatio > HIGH_NULL_RATIO_THRESHOLD) {
      warnings.push(
        m.pipeline_warning_high_nulls({
          column: column.name,
          percent: (nullRatio * 100).toFixed(1)
        })
      );
    }

    const nonNullCount =
      (column.stats?.count ?? 0) - (column.stats?.nulls ?? 0);
    if (nonNullCount > 0) {
      const uniquenessRatio = (column.stats?.uniques ?? 0) / nonNullCount;
      if (uniquenessRatio < LOW_CARDINALITY_THRESHOLD) {
        warnings.push(
          m.pipeline_warning_low_cardinality({
            column: column.name,
            uniques: String(column.stats?.uniques ?? 0),
            total: String(nonNullCount)
          })
        );
      }
    }
  }

  return warnings;
}
