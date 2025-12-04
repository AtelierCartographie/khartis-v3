import type { EnrichedColumn } from '../types';
import { PIPELINE_CONST } from '../constants';

export function computeQualityWarnings(columns: EnrichedColumn[], rowCount: number): string[] {
	if (rowCount === 0) return [];

	const { HIGH_NULL_RATIO_THRESHOLD, LOW_CARDINALITY_THRESHOLD } = PIPELINE_CONST.QUALITY;
	const warnings: string[] = [];

	for (const column of columns) {
		const nullRatio =
			column.stats?.count && column.stats.count > 0 ? column.stats.nulls / column.stats.count : 0;

		if (nullRatio > HIGH_NULL_RATIO_THRESHOLD) {
			warnings.push(
				`Column "${column.name}" contains ${(nullRatio * 100).toFixed(1)}% missing values`
			);
		}

		const nonNullCount = (column.stats?.count ?? 0) - (column.stats?.nulls ?? 0);
		if (nonNullCount > 0) {
			const uniquenessRatio = (column.stats?.uniques ?? 0) / nonNullCount;
			if (uniquenessRatio < LOW_CARDINALITY_THRESHOLD) {
				warnings.push(
					`Column "${column.name}" has very low cardinality (${column.stats?.uniques ?? 0} unique values out of ${nonNullCount})`
				);
			}
		}
	}

	return warnings;
}
