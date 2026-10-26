import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from '$lib/features/duckdb';

export interface RankTargetColumnsOptions {
  sourceTableName: string;
  sourceColumn: string;
  targetTableName: string;
  targetColumns: string[];
}

export interface BestTargetColumn {
  column: string;
  /** Percentage of the sampled distinct source values the column holds. */
  matchShare: number;
}

const TARGET_COLUMN_RANKING_SAMPLE = 500;

/**
 * The target column holding the most sampled source values once normalized
 * like the join itself, or null when none holds any.
 */
export async function findBestTargetColumn(
  options: RankTargetColumnsOptions
): Promise<BestTargetColumn | null> {
  const { sourceTableName, sourceColumn, targetTableName, targetColumns } =
    options;
  if (targetColumns.length === 0) return null;

  const escapedSourceCol = escapeIdentifier(sourceColumn);
  const escapedSourceTable = escapeIdentifier(sourceTableName);
  const escapedTargetTable = escapeIdentifier(targetTableName);

  const perColumn = targetColumns
    .map(
      (column, position) => `
      SELECT ${position} AS position, COUNT(*) AS matched,
        (SELECT COUNT(*) FROM sampled) AS sampled_count
      FROM sampled
      WHERE normalized IN (
        SELECT normalize_text_join(CAST("${escapeIdentifier(column)}" AS VARCHAR))
        FROM "${escapedTargetTable}"
      )`
    )
    .join('\n      UNION ALL');

  const rows = (await Duck.query(
    `WITH sampled AS (
       SELECT DISTINCT normalize_text_join(CAST("${escapedSourceCol}" AS VARCHAR)) AS normalized
       FROM "${escapedSourceTable}"
       WHERE "${escapedSourceCol}" IS NOT NULL
       ORDER BY normalized
       LIMIT ${TARGET_COLUMN_RANKING_SAMPLE}
     )
     ${perColumn}
     ORDER BY matched DESC, position
     LIMIT 1`,
    { format: 'array' }
  )) as Array<{ position: number; matched: number; sampled_count: number }>;

  const best = rows[0];
  const matched = Number(best?.matched ?? 0);
  const column = best ? targetColumns[Number(best.position)] : undefined;
  if (!column || matched === 0) return null;
  return {
    column,
    matchShare: (matched / Number(best.sampled_count)) * 100
  };
}
