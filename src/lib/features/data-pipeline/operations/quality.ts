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
    warnings.push(
      m.pipeline_warning_small_dataset({ count: String(rowCount) })
    );
  }

  for (const column of columns) {
    const nonNullCount = column.stats?.count ?? 0;
    const nullCount = column.stats?.nulls ?? 0;
    const totalCount = nonNullCount + nullCount;
    const nullRatio = totalCount > 0 ? nullCount / totalCount : 0;

    if (nullRatio > HIGH_NULL_RATIO_THRESHOLD) {
      warnings.push(
        m.pipeline_warning_high_nulls({
          column: column.name,
          percent: (nullRatio * 100).toFixed(1)
        })
      );
    }

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
