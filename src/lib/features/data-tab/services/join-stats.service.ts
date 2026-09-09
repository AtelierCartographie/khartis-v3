import {
  MAX_FUZZY_AUTO_PAIRS,
  MAX_FUZZY_MATCHES_PER_VALUE
} from '$lib/features/commons/constants/data.constants';
import { FUZZY_SEARCH } from '$lib/features/commons/constants/detection.constants';
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
}

const CANDIDATES_TABLE = '__join_stats_candidates__';
const TARGET_TABLE = '__join_stats_target__';

export async function computeDatasetJoinStats(
  options: ComputeJoinStatsOptions
): Promise<JoinStats> {
  const { sourceTableName, sourceColumn, targetTableName, targetColumn } =
    options;

  const escapedSourceCol = escapeIdentifier(sourceColumn);
  const escapedTargetCol = escapeIdentifier(targetColumn);
  const escapedSourceTable = escapeIdentifier(sourceTableName);
  const escapedTargetTable = escapeIdentifier(targetTableName);
  const escapedCandidatesTable = escapeIdentifier(CANDIDATES_TABLE);
  const escapedTargetCacheTable = escapeIdentifier(TARGET_TABLE);

  const sourceFilters = getFilters(sourceTableName);
  const sourceFilterClause = buildFilterWhereClause(sourceFilters);

  try {
    await Duck.query(`
      CREATE OR REPLACE TEMP TABLE "${escapedTargetCacheTable}" AS
      SELECT DISTINCT
        CAST("${escapedTargetCol}" AS VARCHAR) AS raw,
        normalize_text_join(CAST("${escapedTargetCol}" AS VARCHAR)) AS normalized
      FROM "${escapedTargetTable}"
      WHERE "${escapedTargetCol}" IS NOT NULL
    `);

    // Candidates land in a temp table so the unmatched residual never has to
    // round-trip through JS as a SQL literal list: at 700k values that list is
    // a 26 MB statement.
    await Duck.query(`
      CREATE OR REPLACE TEMP TABLE "${escapedCandidatesTable}" AS
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
      )
      SELECT DISTINCT
        s.source_val,
        s.normalized_val,
        s.duplicate_count,
        t.raw as exact_match
      FROM source_with_counts s
      LEFT JOIN "${escapedTargetCacheTable}" t ON s.normalized_val = t.normalized
    `);

    const analysisResults = (await Duck.query(
      `SELECT source_val, normalized_val, duplicate_count, exact_match
       FROM "${escapedCandidatesTable}"`,
      { format: 'array' }
    )) as JoinAnalysisRow[];

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
          geoValue: row.exact_match,
          basemapValue: row.exact_match,
          status: JoinStatus.JOINED
        });
      } else {
        unmatchedValues.push(row.source_val);
      }
    }

    const matchesBySource =
      unmatchedValues.length > 0
        ? await fetchFuzzyMatches(
            escapedCandidatesTable,
            escapedTargetCacheTable
          )
        : new Map<string, string[]>();

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

    const duplicateLines = entities.some(
      (entity) => entity.status === JoinStatus.DUPLICATE
    )
      ? await getDuplicateLines(
          sourceTableName,
          sourceColumn,
          escapedCandidatesTable,
          sourceFilterClause
        )
      : [];

    const stats: JoinStats = {
      joinedCount: entities.filter((e) => e.status === JoinStatus.JOINED)
        .length,
      toVerifyCount: entities.filter((e) => e.status === JoinStatus.TO_VERIFY)
        .length,
      duplicateCount: entities.filter((e) => e.status === JoinStatus.DUPLICATE)
        .length,
      unrecognizedCount: entities.filter(
        (e) => e.status === JoinStatus.UNRECOGNIZED
      ).length,
      entities,
      totalEntities: entities.length,
      duplicateLines
    };

    return stats;
  } finally {
    await dropTempTable(escapedCandidatesTable);
    await dropTempTable(escapedTargetCacheTable);
  }
}

/** Cleanup must never replace the error that triggered it. */
async function dropTempTable(escapedTableName: string): Promise<void> {
  try {
    await Duck.query(`DROP TABLE IF EXISTS "${escapedTableName}"`);
  } catch {
    return;
  }
}

/**
 * Score the unmatched residual against the target values in one cross join.
 * Distinct normalized target values are scored once then re-expanded to their
 * raw values, and the residual is budgeted in candidate x target pairs — the
 * same bound as the basemap join — because scoring every unmatched value of a
 * large column against every target value is quadratic in the import size.
 */
async function fetchFuzzyMatches(
  escapedCandidatesTable: string,
  escapedTargetCacheTable: string
): Promise<Map<string, string[]>> {
  const rows = (await Duck.query(
    `WITH unmatched AS (
       SELECT DISTINCT source_val, normalized_val
       FROM "${escapedCandidatesTable}"
       WHERE exact_match IS NULL AND duplicate_count <= 1
     ),
     unmatched_count AS (
       SELECT COUNT(*) AS count FROM unmatched
     ),
     distinct_targets AS (
       SELECT DISTINCT normalized FROM "${escapedTargetCacheTable}"
     ),
     bounded_unmatched AS (
       SELECT u.*
       FROM unmatched u, unmatched_count c
       WHERE c.count * (SELECT COUNT(*) FROM distinct_targets)
             <= ${MAX_FUZZY_AUTO_PAIRS}
     ),
     scored AS (
       SELECT
         u.source_val,
         t.normalized,
         jaro_winkler_similarity(
           u.normalized_val,
           t.normalized,
           ${FUZZY_SEARCH.SCORE_CUTOFF}
         ) AS score
       FROM bounded_unmatched u, distinct_targets t
     )
     SELECT s.source_val, tt.raw
     FROM scored s
     JOIN "${escapedTargetCacheTable}" tt ON tt.normalized = s.normalized
     WHERE s.score > 0
     QUALIFY ROW_NUMBER() OVER (
       PARTITION BY s.source_val
       ORDER BY s.score DESC, tt.raw
     ) <= ${MAX_FUZZY_MATCHES_PER_VALUE}
     ORDER BY s.source_val, s.score DESC, tt.raw`,
    { format: 'array' }
  )) as FuzzyMatchRow[];

  const matchesBySource = new Map<string, string[]>();
  for (const row of rows) {
    const existing = matchesBySource.get(row.source_val);
    if (existing) {
      existing.push(row.raw);
      continue;
    }
    matchesBySource.set(row.source_val, [row.raw]);
  }
  return matchesBySource;
}

async function getDuplicateLines(
  sourceTableName: string,
  sourceColumn: string,
  escapedCandidatesTable: string,
  sourceFilterClause: string | null
): Promise<Array<{ dataValue: string; lines: number[] }>> {
  const escapedSourceTable = escapeIdentifier(sourceTableName);
  const escapedSourceCol = escapeIdentifier(sourceColumn);

  const hasRowId = (await Duck.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = '${escapeSqlString(sourceTableName)}'
       AND column_name = '__id'`,
    { format: 'array' }
  )) as Array<{ column_name: string }>;
  const idCol = hasRowId.length > 0 ? '"__id"' : 'rowid';

  return (await Duck.query(
    `SELECT
       CAST("${escapedSourceCol}" AS VARCHAR) AS dataValue,
       array_agg(${idCol} ORDER BY ${idCol}) AS lines
     FROM "${escapedSourceTable}"
     WHERE CAST("${escapedSourceCol}" AS VARCHAR) IN (
       SELECT source_val FROM "${escapedCandidatesTable}" WHERE duplicate_count > 1
     )${sourceFilterClause ? ` AND ${sourceFilterClause}` : ''}
     GROUP BY CAST("${escapedSourceCol}" AS VARCHAR)
     HAVING COUNT(*) > 1`,
    { format: 'array' }
  )) as Array<{ dataValue: string; lines: number[] }>;
}
