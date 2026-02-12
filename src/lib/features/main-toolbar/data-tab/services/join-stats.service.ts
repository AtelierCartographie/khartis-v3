import { JoinStatus } from '$lib/features/commons/constants/ui.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from '$lib/features/duckdb';
import type { JoinEntity, JoinStats } from '../components';

export interface ComputeJoinStatsOptions {
  sourceTableName: string;
  sourceColumn: string;
  targetTableName: string;
  targetColumn: string;
}

interface JoinAnalysisRow {
  source_val: string;
  normalized_val: string;
  duplicate_count: number;
  exact_match: string | null;
}

interface FuzzyMatchRow {
  source_val: string;
  target_val: string;
  distance: number;
}

export async function computeDatasetJoinStats(
  options: ComputeJoinStatsOptions
): Promise<JoinStats> {
  const { sourceTableName, sourceColumn, targetTableName, targetColumn } =
    options;

  logger.info('Computing dataset join stats', LogCategory.DATA, {
    sourceTableName,
    sourceColumn,
    targetTableName,
    targetColumn
  });

  // join_macros are loaded once at DuckDB init (duck.ts) — no need to reload

  const escapedSourceCol = escapeIdentifier(sourceColumn);
  const escapedTargetCol = escapeIdentifier(targetColumn);
  const escapedSourceTable = escapeIdentifier(sourceTableName);
  const escapedTargetTable = escapeIdentifier(targetTableName);

  const joinAnalysisQuery = `
    WITH source_data AS (
      SELECT
        CAST("${escapedSourceCol}" AS VARCHAR) as source_val,
        normalize_text_join(CAST("${escapedSourceCol}" AS VARCHAR)) as normalized_val
      FROM "${escapedSourceTable}"
      WHERE "${escapedSourceCol}" IS NOT NULL
    ),
    source_with_counts AS (
      SELECT
        source_val,
        normalized_val,
        COUNT(*) OVER (PARTITION BY normalized_val) as duplicate_count
      FROM source_data
    ),
    target_normalized AS (
      SELECT DISTINCT
        CAST("${escapedTargetCol}" AS VARCHAR) as target_val,
        normalize_text_join(CAST("${escapedTargetCol}" AS VARCHAR)) as normalized_target
      FROM "${escapedTargetTable}"
      WHERE "${escapedTargetCol}" IS NOT NULL
    )
    SELECT DISTINCT
      s.source_val,
      s.normalized_val,
      s.duplicate_count,
      t.target_val as exact_match
    FROM source_with_counts s
    LEFT JOIN target_normalized t ON s.normalized_val = t.normalized_target
  `;

  const analysisResults = (await Duck.query(joinAnalysisQuery, {
    format: 'array'
  })) as JoinAnalysisRow[];

  const entities: JoinEntity[] = [];
  const unmatchedValues: string[] = [];

  for (const row of analysisResults) {
    if (row.duplicate_count > 1) {
      entities.push({
        dataValue: row.source_val,
        status: JoinStatus.DUPLICATE
      });
    } else if (row.exact_match) {
      entities.push({
        dataValue: row.source_val,
        geoValue: row.source_val,
        status: JoinStatus.JOINED
      });
    } else {
      unmatchedValues.push(row.source_val);
    }
  }

  if (unmatchedValues.length > 0) {
    const valuesLiteral = unmatchedValues
      .map((v) => `'${escapeSqlString(v)}'`)
      .join(', ');

    const fuzzyMatchQuery = `
      WITH unmatched AS (
        SELECT
          unnest([${valuesLiteral}]) as source_val
      ),
      unmatched_normalized AS (
        SELECT
          source_val,
          normalize_text_join(source_val) as norm_source
        FROM unmatched
      ),
      target_normalized AS (
        SELECT DISTINCT
          CAST("${escapedTargetCol}" AS VARCHAR) as target_val,
          normalize_text_join(CAST("${escapedTargetCol}" AS VARCHAR)) as normalized_target
        FROM "${escapedTargetTable}"
        WHERE "${escapedTargetCol}" IS NOT NULL
      ),
      candidates AS (
        SELECT
          u.source_val,
          u.norm_source,
          t.target_val,
          t.normalized_target
        FROM unmatched_normalized u
        CROSS JOIN target_normalized t
        WHERE
          -- Length pre-filter: levenshtein <= 2 is impossible if lengths differ by > 2
          ABS(length(u.norm_source) - length(t.normalized_target)) <= 2
          OR t.normalized_target LIKE '%' || u.norm_source || '%'
          OR u.norm_source LIKE '%' || t.normalized_target || '%'
      )
      SELECT
        source_val,
        target_val,
        levenshtein(norm_source, normalized_target) as distance
      FROM candidates
      WHERE
        levenshtein(norm_source, normalized_target) <= 2
        OR normalized_target LIKE '%' || norm_source || '%'
        OR norm_source LIKE '%' || normalized_target || '%'
      ORDER BY source_val, distance
    `;

    const fuzzyResults = (await Duck.query(fuzzyMatchQuery, {
      format: 'array'
    })) as FuzzyMatchRow[];

    const matchesBySource = new Map<string, string[]>();
    for (const row of fuzzyResults) {
      const existing = matchesBySource.get(row.source_val) || [];
      if (existing.length < 5) {
        existing.push(row.target_val);
        matchesBySource.set(row.source_val, existing);
      }
    }

    for (const sourceVal of unmatchedValues) {
      const matches = matchesBySource.get(sourceVal);
      if (matches && matches.length > 0) {
        entities.push({
          dataValue: sourceVal,
          status: JoinStatus.TO_VERIFY,
          matches
        });
      } else {
        entities.push({
          dataValue: sourceVal,
          status: JoinStatus.UNRECOGNIZED
        });
      }
    }
  }

  const stats: JoinStats = {
    joinedCount: entities.filter((e) => e.status === JoinStatus.JOINED).length,
    toVerifyCount: entities.filter((e) => e.status === JoinStatus.TO_VERIFY)
      .length,
    duplicateCount: entities.filter((e) => e.status === JoinStatus.DUPLICATE)
      .length,
    unrecognizedCount: entities.filter(
      (e) => e.status === JoinStatus.UNRECOGNIZED
    ).length,
    entities,
    totalEntities: entities.length
  };

  logger.success('Dataset join stats computed', LogCategory.DATA, {
    joinedCount: stats.joinedCount,
    toVerifyCount: stats.toVerifyCount,
    duplicateCount: stats.duplicateCount,
    unrecognizedCount: stats.unrecognizedCount
  });

  return stats;
}
