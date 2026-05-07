import { JoinStatus } from '$lib/features/commons/constants/ui.constants';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from '$lib/features/duckdb';
import { buildFilterWhereClause } from '$lib/features/duckdb/orchestrator/filter-ops';
import { getFilters } from '$lib/features/duckdb/orchestrator/state.svelte';
import type { JoinEntity, JoinStats } from '../components/index';

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
  raw: string;
  score: number;
  typo_match: string;
}

export async function computeDatasetJoinStats(
  options: ComputeJoinStatsOptions
): Promise<JoinStats> {
  const { sourceTableName, sourceColumn, targetTableName, targetColumn } =
    options;

  const escapedSourceCol = escapeIdentifier(sourceColumn);
  const escapedTargetCol = escapeIdentifier(targetColumn);
  const escapedSourceTable = escapeIdentifier(sourceTableName);
  const escapedTargetTable = escapeIdentifier(targetTableName);

  const sourceFilters = getFilters(sourceTableName);
  const sourceFilterClause = buildFilterWhereClause(sourceFilters);

  const joinAnalysisQuery = `
    WITH source_data AS (
      SELECT
        CAST("${escapedSourceCol}" AS VARCHAR) as source_val,
        normalize_text_join(CAST("${escapedSourceCol}" AS VARCHAR)) as normalized_val
      FROM "${escapedSourceTable}"
      WHERE "${escapedSourceCol}" IS NOT NULL${sourceFilterClause ? ` AND ${sourceFilterClause}` : ''}
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

    const tempJoinTable = '__join_stats_target__';
    await Duck.query(
      `CREATE OR REPLACE TEMP TABLE "${escapeIdentifier(tempJoinTable)}" AS
       SELECT DISTINCT
         CAST("${escapedTargetCol}" AS VARCHAR) AS raw,
         CAST("${escapedTargetCol}" AS VARCHAR) AS id,
         normalize_text_join(CAST("${escapedTargetCol}" AS VARCHAR)) AS normalized
       FROM "${escapedTargetTable}"
       WHERE "${escapedTargetCol}" IS NOT NULL`,
      { format: 'array' }
    );

    const fuzzyMatchQuery = `
      WITH unmatched AS (
        SELECT unnest([${valuesLiteral}]) as source_val
      )
      SELECT
        u.source_val,
        s.raw,
        s.score,
        s.typo_match
      FROM unmatched u,
           LATERAL (SELECT * FROM get_similarity(u.source_val, '${tempJoinTable}')) s
      WHERE s.typo_match != 'toofar'
      ORDER BY u.source_val, s.score DESC
    `;

    const fuzzyResults = (await Duck.query(fuzzyMatchQuery, {
      format: 'array'
    })) as FuzzyMatchRow[];

    const matchesBySource = new Map<string, string[]>();
    for (const row of fuzzyResults) {
      const existing = matchesBySource.get(row.source_val) || [];
      if (existing.length < 5) {
        existing.push(row.raw);
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
    totalEntities: entities.length,
    duplicateLines: []
  };

  return stats;
}
