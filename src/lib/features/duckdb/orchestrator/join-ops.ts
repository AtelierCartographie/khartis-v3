import {
  CANONICAL_ID_COLUMN,
  INTERNAL_COLUMN,
  JOINED_BASEMAP_COLUMN,
  JOINED_BASEMAP_COLUMNS,
  MAX_FUZZY_JOIN_CANDIDATES,
  MAX_JOIN_BUCKET_LIST_VALUES
} from '$lib/features/commons/constants/data.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { FUZZY_SEARCH } from '$lib/features/commons/constants/detection.constants';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import {
  PERF_PHASE,
  perfMark,
  perfMeasure
} from '$lib/features/commons/utils/perf-marks.utils';
import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/pipeline.errors';
import * as m from '$lib/paraglide/messages';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import { isOSMBasemap } from '$lib/features/map/services/osm-tile.service';
import type {
  BasemapMetadata,
  JoinQuality
} from '$lib/features/map/types/basemap.types';
import { getLocale } from '$lib/paraglide/runtime';
import type { Table } from 'apache-arrow/Arrow';
import { addGeoArrowMetadata } from '$lib/features/map/services/read-geojson-arrow.service';
import type { DuckDBDataset, FinalizeJoinResult } from '../types';
import type {
  JoinCandidate,
  JoinMapping,
  JoinedEntity
} from '$lib/features/commons/types/data-tab.types';
import { detectGPSColumns } from './gps-ops';
import { isGeometryColumnName } from '../utils/geometry-column.utils';

export type { FinalizeJoinResult };

export interface DuckDBClientForJoin {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
}

interface InformationSchemaColumn {
  column_name: string;
  data_type: string;
}

export function getBasemapAttributesId(basemap: BasemapMetadata): string {
  return basemap.file.replace(/\.(parquet|geojson)$/i, '');
}

const SIMILARITY_CACHE_PREFIX = '__similarity_cache__';
const GRADED_CACHE_PREFIX = '__join_graded__';
const MAX_SIMILARITY_CACHE_ENTRIES = 4;
const MAX_GRADED_CACHE_ENTRIES = 4;
const MAX_EXACT_MATCHES_PER_CANDIDATE_BASEMAP = 50;
const FUZZY_SCORE_CUTOFF = FUZZY_SEARCH.SCORE_CUTOFF;

interface SimilarityCacheEntry {
  tableName: string;
  geoColumn: string;
  cacheTableName: string;
}

// Insertion-ordered Map used as an LRU: reads re-insert, oldest entry evicts.
const similarityCacheEntries = new Map<string, SimilarityCacheEntry>();
const pendingSimilarityCacheBuilds = new Map<string, Promise<string>>();

function getSimilarityCacheBuildKey(
  datasetTable: string,
  geoColumn: string
): string {
  return `${datasetTable}::${geoColumn}`;
}

function hashSimilarityCacheKey(buildKey: string): string {
  let hash = 5381;
  for (let index = 0; index < buildKey.length; index++) {
    hash = ((hash << 5) + hash + buildKey.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function getSimilarityCacheTableName(
  datasetTable: string,
  geoColumn: string
): string {
  // The hash keeps names unique when sanitization collapses distinct keys.
  const sanitized = `${datasetTable}__${geoColumn}`
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .slice(0, 80);
  const hash = hashSimilarityCacheKey(
    getSimilarityCacheBuildKey(datasetTable, geoColumn)
  );
  return `${SIMILARITY_CACHE_PREFIX}${sanitized}_${hash}`;
}

function dropTempTable(tableName: string, duck?: DuckDBClientForJoin): void {
  if (!duck) return;
  // The facade throws synchronously before init; temp tables die with the engine.
  try {
    void duck
      .query(`DROP TABLE IF EXISTS "${escapeIdentifier(tableName)}"`)
      .catch(() => undefined);
  } catch {
    return;
  }
}

/**
 * Graded rows keyed by the similarity cache table that produced them, so a
 * dropped or rebuilt cache takes its derived gradings with it. Insertion-ordered
 * as an LRU, like similarityCacheEntries.
 */
const gradedCacheEntries = new Map<string, string>();
const pendingGradedBuilds = new Map<string, Promise<string>>();

function getGradedCacheKey(
  cacheTableName: string,
  basemapId: string,
  excludedValues: string[]
): string {
  const exclusions = JSON.stringify([...excludedValues].sort());
  return `${cacheTableName}::${basemapId}::${hashSimilarityCacheKey(exclusions)}`;
}

function getGradedCacheTableName(basemapId: string, gradedKey: string): string {
  // Named after the basemap only: embedding the cache table name would make
  // every graded table read as a similarity cache table.
  const sanitized = basemapId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 80);
  return `${GRADED_CACHE_PREFIX}${sanitized}_${hashSimilarityCacheKey(gradedKey)}`;
}

function invalidateGradedCache(
  cacheTableName?: string,
  duck?: DuckDBClientForJoin
): void {
  const prefix = cacheTableName ? `${cacheTableName}::` : '';
  for (const [key, tableName] of gradedCacheEntries) {
    if (prefix && !key.startsWith(prefix)) continue;
    gradedCacheEntries.delete(key);
    dropTempTable(tableName, duck);
  }
}

/** Invalidate cached similarity rows after source-value mutations. */
export function invalidateSimilarityCache(
  datasetTableName?: string,
  duck?: DuckDBClientForJoin
): void {
  for (const [key, entry] of similarityCacheEntries) {
    if (datasetTableName && entry.tableName !== datasetTableName) continue;
    similarityCacheEntries.delete(key);
    invalidateGradedCache(entry.cacheTableName, duck);
    dropTempTable(entry.cacheTableName, duck);
  }
}

/** Build or reuse the cross-basemap similarity temp table. */
async function ensureSimilarityCached(
  dataset: DuckDBDataset,
  geoColumn: string,
  Duck: DuckDBClientForJoin
): Promise<string> {
  const cacheTableName = getSimilarityCacheTableName(
    dataset.tableName,
    geoColumn
  );
  const buildKey = getSimilarityCacheBuildKey(dataset.tableName, geoColumn);

  const cachedEntry = similarityCacheEntries.get(buildKey);
  if (cachedEntry) {
    // Rebuild if DuckDB dropped the temp table externally.
    const check = (await Duck.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = '${escapeSqlString(cachedEntry.cacheTableName)}'`,
      { format: 'array' }
    )) as Array<{ table_name: string }>;

    if (check && check.length > 0) {
      similarityCacheEntries.delete(buildKey);
      similarityCacheEntries.set(buildKey, cachedEntry);
      return cachedEntry.cacheTableName;
    }
    similarityCacheEntries.delete(buildKey);
    // The rebuilt cache holds different rows under the same name.
    invalidateGradedCache(cachedEntry.cacheTableName, Duck);
  }

  const pendingBuild = pendingSimilarityCacheBuilds.get(buildKey);
  if (pendingBuild) {
    return pendingBuild;
  }

  const buildPromise = (async () => {
    perfMark(PERF_PHASE.SIMILARITY_CACHE);
    await ensureBasemapAttributesLoaded(Duck);

    const escapedGeoCol = escapeIdentifier(geoColumn);
    const escapedCacheTable = escapeIdentifier(cacheTableName);

    // Build the similarity cache in two phases:
    // Phase 1: exact match via equi-join on pre-normalized text (hash join, O(n+m)).
    //          Cap rows per source value and basemap so broad codes such as
    //          department ids cannot cache every commune sharing the same attribute.
    // Phase 2: fuzzy Jaro-Winkler (FUZZY_SCORE_CUTOFF) only on residual unmatched candidates
    //          — bounded because unmatched large code datasets would otherwise cross-join every
    //          source value with every basemap attribute on the browser main thread.
    // Normalization is pre-computed once in the candidates CTE to avoid
    // redundant computation inside the join/cross-join.
    await Duck.query(`
      CREATE OR REPLACE TEMP TABLE "${escapedCacheTable}" AS
      WITH source_raw AS (
        SELECT
          CAST("${escapedGeoCol}" AS VARCHAR) as original_name,
          normalize_text_join(CAST("${escapedGeoCol}" AS VARCHAR)) as normalized_name
        FROM "${escapeIdentifier(dataset.tableName)}"
        WHERE "${escapedGeoCol}" IS NOT NULL
      ),
      source_data AS (
        SELECT
          original_name,
          normalized_name,
          COUNT(*) OVER (PARTITION BY normalized_name) as source_dup_count
        FROM source_raw
      ),
      candidates AS (
        SELECT DISTINCT original_name, source_dup_count, normalized_name
        FROM source_data
      ),
      -- Phase 1: exact match via equi-join (hash join)
      exact_raw AS (
        SELECT
          c.original_name,
          c.source_dup_count,
          1.0 AS match_score,
          'exact' AS typo_match,
          ba.id AS match_id,
          ba.raw AS match_raw,
          ba.variant AS match_variant,
          ba.basemap AS match_basemap,
          ba.basemap_count AS match_basemap_count,
          ROW_NUMBER() OVER (
            PARTITION BY c.original_name, ba.basemap
            ORDER BY ba.id
          ) AS exact_rank
        FROM candidates c
        JOIN basemap_attributes ba ON c.normalized_name = ba.normalized
      ),
      exact_matches AS (
        SELECT
          original_name,
          source_dup_count,
          match_score,
          typo_match,
          match_id,
          match_raw,
          match_variant,
          match_basemap,
          match_basemap_count
        FROM exact_raw
        WHERE exact_rank <= ${MAX_EXACT_MATCHES_PER_CANDIDATE_BASEMAP}
      ),
      -- Phase 2: fuzzy Jaro-Winkler only for candidates without any exact match
      unmatched AS (
        SELECT c.*
        FROM candidates c
        WHERE NOT EXISTS (
          SELECT 1 FROM exact_matches e WHERE e.original_name = c.original_name
        )
      ),
      unmatched_count AS (
        SELECT COUNT(*) AS count FROM unmatched
      ),
      -- Fuzzy similarity is meaningless between code identifiers (INSEE, NUTS,
      -- ISO3...): '85271' ≈ '85212' is pure noise. Treat the source column as
      -- codes when every value casts to a number, or when fixed-length values
      -- are structurally code-like: each contains a digit, or all are uppercase
      -- alphabetic codes of at most 3 characters (ISO2/ISO3). A shared length
      -- alone is not enough because distinct place names can have equal lengths.
      source_code_signals AS (
        SELECT
          COUNT(*) FILTER (WHERE TRY_CAST(normalized_name AS DOUBLE) IS NULL) = 0 AS all_numeric,
          (COUNT(DISTINCT length(normalized_name)) = 1
            AND MAX(length(normalized_name)) <= 8
            AND COUNT(DISTINCT normalized_name) >= 3
            AND (
              COUNT(*) FILTER (WHERE regexp_matches(original_name, '[0-9]')) = COUNT(*)
              OR (
                MAX(length(normalized_name)) <= 3
                AND COUNT(*) FILTER (WHERE original_name = upper(original_name)) = COUNT(*)
              )
            )) AS fixed_length_codes
        FROM candidates
      ),
      bounded_unmatched AS (
        SELECT u.*
        FROM unmatched u, unmatched_count c, source_code_signals s
        WHERE c.count <= ${MAX_FUZZY_JOIN_CANDIDATES}
          AND NOT s.all_numeric
          AND NOT s.fixed_length_codes
      ),
      -- Jaro-Winkler is prefix-weighted, so 'korea north' scores closer to
      -- 'korea rep' than to 'north korea'. Comparing word-sorted forms as well
      -- recovers reordered names; the 0.99 factor keeps them below an exact
      -- match so they stay in the to-verify bucket.
      sorted_unmatched AS (
        SELECT
          u.*,
          array_to_string(list_sort(string_split(u.normalized_name, ' ')), ' ') AS normalized_sorted
        FROM bounded_unmatched u
      ),
      -- Blocking: fuzzy-score only basemaps made plausible by an exact match in
      -- this build; when no exact match exists, fall back to every basemap.
      candidate_basemaps AS (
        SELECT DISTINCT match_basemap AS basemap FROM exact_matches
      ),
      -- Jaro-Winkler depends only on the strings: scoring distinct normalized
      -- values then re-expanding to attribute rows is lossless and ~4x smaller.
      distinct_attributes AS (
        SELECT
          normalized,
          array_to_string(list_sort(string_split(normalized, ' ')), ' ') AS normalized_sorted
        FROM (
          SELECT DISTINCT ba.normalized
          FROM basemap_attributes ba
          WHERE NOT EXISTS (SELECT 1 FROM candidate_basemaps)
             OR ba.basemap IN (SELECT basemap FROM candidate_basemaps)
        )
      ),
      -- When both forms are already word-sorted the second term is exactly
      -- 0.99 x the first, so GREATEST can only return the first: skipping it
      -- is lossless, and the catalog is ~79% already sorted.
      fuzzy_scored AS (
        SELECT
          u.original_name,
          u.source_dup_count,
          da.normalized,
          CASE
            WHEN u.normalized_sorted = u.normalized_name
              AND da.normalized_sorted = da.normalized
            THEN jaro_winkler_similarity(u.normalized_name, da.normalized, ${FUZZY_SCORE_CUTOFF})
            ELSE GREATEST(
              jaro_winkler_similarity(u.normalized_name, da.normalized, ${FUZZY_SCORE_CUTOFF}),
              0.99 * jaro_winkler_similarity(u.normalized_sorted, da.normalized_sorted, ${FUZZY_SCORE_CUTOFF})
            )
          END AS match_score
        FROM sorted_unmatched u, distinct_attributes da
      ),
      fuzzy_matches AS (
        SELECT
          f.original_name,
          f.source_dup_count,
          f.match_score,
          'partial' AS typo_match,
          ba.id AS match_id,
          ba.raw AS match_raw,
          ba.variant AS match_variant,
          ba.basemap AS match_basemap,
          ba.basemap_count AS match_basemap_count
        FROM fuzzy_scored f
        JOIN basemap_attributes ba ON ba.normalized = f.normalized
        WHERE f.match_score > 0
      ),
      all_matches AS (
        SELECT * FROM exact_matches
        UNION ALL
        SELECT * FROM fuzzy_matches
      )
      SELECT
        c.original_name,
        c.source_dup_count,
        m.match_id,
        m.match_raw,
        m.match_variant,
        m.match_score,
        m.typo_match,
        m.match_basemap,
        m.match_basemap_count
      FROM candidates c
      LEFT JOIN all_matches m ON c.original_name = m.original_name
    `);

    similarityCacheEntries.delete(buildKey);
    similarityCacheEntries.set(buildKey, {
      tableName: dataset.tableName,
      geoColumn,
      cacheTableName
    });

    while (similarityCacheEntries.size > MAX_SIMILARITY_CACHE_ENTRIES) {
      const oldest = similarityCacheEntries.entries().next();
      if (oldest.done) break;
      const [oldestKey, oldestEntry] = oldest.value;
      similarityCacheEntries.delete(oldestKey);
      invalidateGradedCache(oldestEntry.cacheTableName, Duck);
      await Duck.query(
        `DROP TABLE IF EXISTS "${escapeIdentifier(oldestEntry.cacheTableName)}"`
      ).catch(() => undefined);
    }

    perfMeasure(PERF_PHASE.SIMILARITY_CACHE);
    return cacheTableName;
  })();

  pendingSimilarityCacheBuilds.set(buildKey, buildPromise);

  try {
    return await buildPromise;
  } finally {
    if (pendingSimilarityCacheBuilds.get(buildKey) === buildPromise) {
      pendingSimilarityCacheBuilds.delete(buildKey);
    }
  }
}

type JoinBucketStatus =
  'matched' | 'check' | 'ambiguous' | 'not_found' | 'duplicate';

function buildExcludedValuesFilter(excludedValues: string[]): string {
  if (excludedValues.length === 0) return '';
  const list = excludedValues
    .map((value) => `'${escapeSqlString(value)}'`)
    .join(', ');
  return `WHERE c.original_name NOT IN (${list})`;
}

// Exclusions filter the graded output only: claimed-id semantics must keep seeing excluded values.
function buildJoinGradingCtes(
  cacheTableName: string,
  basemapId: string,
  excludedValues: string[]
): string {
  const escapedCache = escapeIdentifier(cacheTableName);
  const escapedBasemapId = escapeSqlString(basemapId);

  return `WITH basemap_matches AS (
      SELECT *
      FROM "${escapedCache}"
      WHERE match_basemap = '${escapedBasemapId}'
        AND match_id IS NOT NULL
    ),
    -- IDs already claimed by an unambiguous exact match (1 candidate has score=1
    -- and maps to exactly 1 basemap id). These are "taken" and must not appear
    -- as suggestions for partial/ambiguous rows.
    exact_claimed_ids AS (
      SELECT MIN(match_id) AS match_id
      FROM basemap_matches
      WHERE typo_match = 'exact'
      GROUP BY original_name
      HAVING COUNT(DISTINCT match_id) = 1
    ),
    -- For non-exact rows, exclude candidates whose id is already claimed
    filtered_matches AS (
      SELECT bm.*
      FROM basemap_matches bm
      WHERE bm.typo_match = 'exact'
      UNION ALL
      SELECT bm.*
      FROM basemap_matches bm
      WHERE bm.typo_match != 'exact'
        AND bm.match_id NOT IN (SELECT match_id FROM exact_claimed_ids)
    ),
    -- One candidate per matched raw value (best-scoring row wins), ordered like
    -- ranked_join in applyCachedJoinAssociation so candidates[0] is the value
    -- the finalized join will actually apply.
    candidate_rows AS (
      SELECT
        original_name,
        match_id,
        match_raw,
        match_variant,
        match_score,
        typo_match,
        ROW_NUMBER() OVER (
          PARTITION BY original_name, match_raw
          ORDER BY match_score DESC, match_id, match_variant
        ) AS raw_rank
      FROM filtered_matches
    ),
    candidate_lists AS (
      SELECT
        original_name,
        list(
          {id: match_id, name: match_raw, score: match_score, type: typo_match, variant: match_variant}
          ORDER BY match_score DESC, match_id, match_raw
        ) as candidates
      FROM candidate_rows
      WHERE raw_rank = 1
      GROUP BY original_name
    ),
    best_matches AS (
      SELECT
        original_name,
        max(match_score) as best_score,
        count(DISTINCT CASE WHEN typo_match = 'exact' THEN match_id END) as distinct_exact_id_count
      FROM filtered_matches
      GROUP BY original_name
    ),
    all_candidates AS (
      SELECT DISTINCT original_name, source_dup_count
      FROM "${escapedCache}"
    ),
    graded AS (
      SELECT
        c.original_name,
        c.source_dup_count,
        CASE
          WHEN c.source_dup_count > 1 THEN 'duplicate'
          WHEN bm.best_score IS NULL THEN 'not_found'
          WHEN bm.best_score = 1 AND bm.distinct_exact_id_count = 1 THEN 'matched'
          WHEN bm.best_score = 1 AND bm.distinct_exact_id_count > 1 THEN 'ambiguous'
          ELSE 'check'
        END as status
      FROM all_candidates c
      LEFT JOIN best_matches bm ON c.original_name = bm.original_name
      ${buildExcludedValuesFilter(excludedValues)}
    )`;
}

/**
 * Materialize the graded rows once per (cache, basemap, exclusions). Counts,
 * bucket lists, the joined page and the joined value list all consume the same
 * chain, so re-inlining it per query re-ran the whole window/aggregate stack —
 * six times per basemap selection, byte-identical each time.
 */
async function ensureGradedMaterialized(
  cacheTableName: string,
  basemapId: string,
  Duck: DuckDBClientForJoin,
  excludedValues: string[]
): Promise<string> {
  const gradedKey = getGradedCacheKey(
    cacheTableName,
    basemapId,
    excludedValues
  );
  const gradedTableName = getGradedCacheTableName(basemapId, gradedKey);

  if (gradedCacheEntries.has(gradedKey)) {
    gradedCacheEntries.delete(gradedKey);
    gradedCacheEntries.set(gradedKey, gradedTableName);
    return gradedTableName;
  }

  const pendingBuild = pendingGradedBuilds.get(gradedKey);
  if (pendingBuild) {
    return pendingBuild;
  }

  const buildPromise = (async () => {
    perfMark(PERF_PHASE.JOIN_GRADING);
    const gradingCtes = buildJoinGradingCtes(
      cacheTableName,
      basemapId,
      excludedValues
    );

    await Duck.query(`
      CREATE OR REPLACE TEMP TABLE "${escapeIdentifier(gradedTableName)}" AS
      ${gradingCtes}
      SELECT
        g.original_name,
        g.source_dup_count,
        g.status,
        cl.candidates
      FROM graded g
      LEFT JOIN candidate_lists cl ON g.original_name = cl.original_name
    `);

    gradedCacheEntries.set(gradedKey, gradedTableName);

    while (gradedCacheEntries.size > MAX_GRADED_CACHE_ENTRIES) {
      const oldest = gradedCacheEntries.entries().next();
      if (oldest.done) break;
      const [oldestKey, oldestTable] = oldest.value;
      if (oldestKey === gradedKey) break;
      gradedCacheEntries.delete(oldestKey);
      await Duck.query(
        `DROP TABLE IF EXISTS "${escapeIdentifier(oldestTable)}"`
      ).catch(() => undefined);
    }

    perfMeasure(PERF_PHASE.JOIN_GRADING);
    return gradedTableName;
  })();

  pendingGradedBuilds.set(gradedKey, buildPromise);

  try {
    return await buildPromise;
  } finally {
    if (pendingGradedBuilds.get(gradedKey) === buildPromise) {
      pendingGradedBuilds.delete(gradedKey);
    }
  }
}

/** Derive one basemap's join quality from cached similarity rows, aggregated in SQL. */
async function deriveJoinQualityFromCache(
  cacheTableName: string,
  basemapId: string,
  Duck: DuckDBClientForJoin,
  excludedValues: string[]
): Promise<JoinQuality> {
  const gradedTable = escapeIdentifier(
    await ensureGradedMaterialized(
      cacheTableName,
      basemapId,
      Duck,
      excludedValues
    )
  );

  const countRows = (await Duck.query(
    `SELECT status, COUNT(*) AS cnt
    FROM "${gradedTable}"
    GROUP BY status`,
    { format: 'array' }
  )) as Array<{ status: JoinBucketStatus; cnt: number }>;

  const counts: Record<JoinBucketStatus, number> = {
    matched: 0,
    check: 0,
    ambiguous: 0,
    not_found: 0,
    duplicate: 0
  };
  for (const row of countRows ?? []) {
    counts[row.status] = Number(row.cnt);
  }

  const listRows = (await Duck.query(
    `SELECT status, original_name, candidates
    FROM (
      SELECT
        status,
        original_name,
        candidates,
        ROW_NUMBER() OVER (
          PARTITION BY status
          ORDER BY original_name
        ) AS bucket_rank
      FROM "${gradedTable}"
      WHERE status IN ('check', 'ambiguous', 'duplicate', 'not_found')
    )
    WHERE status IN ('check', 'ambiguous')
       OR bucket_rank <= ${MAX_JOIN_BUCKET_LIST_VALUES}
    ORDER BY original_name`,
    { format: 'array' }
  )) as Array<{
    status: Exclude<JoinBucketStatus, 'matched'>;
    original_name: string;
    candidates: RawJoinCandidate[] | null;
  }>;

  const joinMappings: JoinMapping[] = [];
  const duplicateEntities: string[] = [];
  const unrecognizedEntities: string[] = [];

  for (const row of listRows ?? []) {
    if (row.status === 'duplicate') {
      duplicateEntities.push(row.original_name);
      continue;
    }
    if (row.status === 'not_found') {
      unrecognizedEntities.push(row.original_name);
      continue;
    }

    const candidates = (row.candidates ?? []).map(toJoinCandidate);
    joinMappings.push({
      dataValue: row.original_name,
      basemapOptions: candidates.map((candidate) => candidate.name),
      selectedMapping: candidates.length > 0 ? candidates[0].name : '',
      candidates
    });
  }

  const quality: JoinQuality = {
    joinedCount: counts.matched,
    toVerifyCount: counts.check + counts.ambiguous,
    duplicateCount: counts.duplicate,
    unrecognizedCount: counts.not_found,
    totalEntities:
      counts.matched +
      counts.check +
      counts.ambiguous +
      counts.duplicate +
      counts.not_found,
    joinMappings,
    duplicateEntities,
    unrecognizedEntities,
    duplicateLines: []
  };

  return quality;
}

interface RawJoinCandidate {
  id: string;
  name: string;
  score: number;
  type: 'exact' | 'partial';
  variant: string | null;
}

function toJoinCandidate(raw: RawJoinCandidate): JoinCandidate {
  return {
    id: raw.id,
    name: raw.name,
    score: Number(raw.score),
    type: raw.type,
    variant: raw.variant ?? null
  };
}

export interface JoinGradingOptions {
  excludedValues?: string[];
}

export interface JoinedEntitiesPageOptions extends JoinGradingOptions {
  offset: number;
  limit: number;
}

/** One page of the joined bucket, ordered by source value. */
export async function getJoinedEntitiesPage(
  dataset: DuckDBDataset,
  basemap: BasemapMetadata,
  geoColumn: string,
  Duck: DuckDBClientForJoin,
  options: JoinedEntitiesPageOptions
): Promise<JoinedEntity[]> {
  const basemapId = getBasemapAttributesId(basemap);
  await ensureBasemapHasAttributes(basemapId, Duck);
  const cacheTableName = await ensureSimilarityCached(dataset, geoColumn, Duck);
  const gradedTable = escapeIdentifier(
    await ensureGradedMaterialized(
      cacheTableName,
      basemapId,
      Duck,
      options.excludedValues ?? []
    )
  );

  const rows = (await Duck.query(
    `SELECT original_name, candidates
    FROM "${gradedTable}"
    WHERE status = 'matched'
    ORDER BY original_name
    LIMIT ${Math.max(0, Math.trunc(options.limit))}
    OFFSET ${Math.max(0, Math.trunc(options.offset))}`,
    { format: 'array' }
  )) as Array<{
    original_name: string;
    candidates: RawJoinCandidate[] | null;
  }>;

  return (rows ?? []).map((row) => {
    const candidates = (row.candidates ?? []).map(toJoinCandidate);
    const basemapValue =
      candidates.length > 0 ? candidates[0].name : row.original_name;
    const otherIdentifiers = candidates
      .map((candidate) => candidate.name)
      .filter((name) => name !== basemapValue && name !== row.original_name);
    return {
      dataValue: row.original_name,
      basemapValue,
      otherIdentifiers
    };
  });
}

/** Every basemap value already consumed by the joined bucket (combo dedup). */
export async function getJoinedBasemapValues(
  dataset: DuckDBDataset,
  basemap: BasemapMetadata,
  geoColumn: string,
  Duck: DuckDBClientForJoin,
  options: JoinGradingOptions = {}
): Promise<string[]> {
  const basemapId = getBasemapAttributesId(basemap);
  await ensureBasemapHasAttributes(basemapId, Duck);
  const cacheTableName = await ensureSimilarityCached(dataset, geoColumn, Duck);
  const gradedTable = escapeIdentifier(
    await ensureGradedMaterialized(
      cacheTableName,
      basemapId,
      Duck,
      options.excludedValues ?? []
    )
  );

  const rows = (await Duck.query(
    `SELECT DISTINCT (candidates[1]).name AS value
    FROM "${gradedTable}"
    WHERE status = 'matched'
      AND candidates IS NOT NULL`,
    { format: 'array' }
  )) as Array<{ value: string | null }>;

  return (rows ?? []).flatMap((row) => (row.value ? [row.value] : []));
}

/** Per-basemap similarity scores; candidate share and basemap share use different scales. */
export interface JoinSynthesisResult {
  basemap: string;
  shareBasemap: number;
  shareCandidate: number;
}

/** Compute per-basemap synthesis metrics from cached similarity rows. */
export async function computeJoinSynthesis(
  dataset: DuckDBDataset,
  geoColumn: string,
  Duck: DuckDBClientForJoin
): Promise<JoinSynthesisResult[]> {
  const cacheTableName = await ensureSimilarityCached(dataset, geoColumn, Duck);

  const escapedCache = escapeIdentifier(cacheTableName);

  const rows = (await Duck.query(
    `WITH matched AS (
      SELECT DISTINCT
        original_name,
        match_basemap,
        match_basemap_count
      FROM "${escapedCache}"
      WHERE match_id IS NOT NULL
    ),
    total_candidates AS (
      SELECT COUNT(DISTINCT original_name) as cnt
      FROM "${escapedCache}"
    )
    SELECT
      match_basemap as basemap,
      COUNT(DISTINCT original_name)::DOUBLE / MAX(match_basemap_count) as share_basemap,
      COUNT(DISTINCT original_name)::DOUBLE / (SELECT cnt FROM total_candidates) as share_candidate
    FROM matched
    GROUP BY match_basemap
    ORDER BY share_basemap DESC`,
    { format: 'array' }
  )) as Array<{
    basemap: string;
    share_basemap: number;
    share_candidate: number;
  }>;

  return (rows || []).map((r) => ({
    basemap: r.basemap,
    shareBasemap: r.share_basemap,
    shareCandidate: r.share_candidate * 100
  }));
}

async function ensureBasemapAttributesLoaded(
  Duck: DuckDBClientForJoin
): Promise<void> {
  const tableCheck = (await Duck.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name = 'basemap_attributes'`,
    { format: 'array' }
  )) as Array<{ table_name: string }>;

  if (!tableCheck || tableCheck.length === 0) {
    await basemapService.ensureAttributesLoaded();

    const recheck = (await Duck.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'basemap_attributes'`,
      { format: 'array' }
    )) as Array<{ table_name: string }>;

    if (!recheck || recheck.length === 0) {
      throw new DuckDBError(m.error_basemap_attributes_load(), undefined, {
        tableName: 'basemap_attributes'
      });
    }
  }
}

async function getJoinColumnExcludeClause(
  tableName: string,
  Duck: DuckDBClientForJoin
): Promise<string> {
  const columnsToExclude = [...JOINED_BASEMAP_COLUMNS];
  const existingColumns = (await Duck.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = '${escapeSqlString(tableName)}'
     AND column_name IN (${columnsToExclude.map((column) => `'${column}'`).join(', ')})`,
    { format: 'array' }
  )) as Array<{ column_name: string }>;

  if (existingColumns.length === 0) {
    return '';
  }

  const excludeList = existingColumns
    .map((row) => `"${escapeIdentifier(row.column_name)}"`)
    .join(', ');

  return `EXCLUDE (${excludeList})`;
}

async function generateAttributesForBasemap(
  basemapId: string,
  Duck: DuckDBClientForJoin
): Promise<boolean> {
  try {
    const geometryTable =
      await basemapService.loadGeometryIntoDuckDB(basemapId);

    const escapedBasemapId = escapeSqlString(basemapId);
    const escapedGeomTable = escapeIdentifier(geometryTable);

    const columnsResult = (await Duck.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${escapeSqlString(geometryTable)}'`,
      { format: 'array' }
    )) as Array<{ column_name: string; data_type: string }>;

    if (!columnsResult || columnsResult.length === 0) return false;

    const textColumns = columnsResult.filter((col) => {
      const type = col.data_type.toUpperCase();
      if (
        !type.includes('VARCHAR') &&
        !type.includes('TEXT') &&
        !type.includes('STRING')
      )
        return false;
      if (/^(geom|geometry|wkb_geometry|the_geom)$/i.test(col.column_name))
        return false;
      return true;
    });

    const candidateColumns = textColumns.filter((col) => {
      const name = col.column_name.toLowerCase();
      return (
        /^(name|nom|libelle|label|id|code|iso|fips|postal|abbrev|admin|sovereignt|geounit|subunit)$/i.test(
          name
        ) ||
        /_(name|code|a3|a2)$/i.test(name) ||
        /^(name_|iso_|adm0_|brk_|un_|wb_|gu_|su_|sov_|formal_)/i.test(name)
      );
    });

    if (candidateColumns.length === 0) {
      candidateColumns.push(...textColumns.slice(0, 5));
    }

    const countResult = (await Duck.query(
      `SELECT COUNT(*) as total FROM "${escapedGeomTable}"`,
      { format: 'array' }
    )) as Array<{ total: number }>;
    const totalCount = Number(countResult?.[0]?.total ?? 0);

    if (totalCount === 0) return false;

    const unionQueries = candidateColumns.map((col) => {
      const safeColName = escapeIdentifier(col.column_name);
      const safeVariantName = escapeSqlString(col.column_name);
      return `
        SELECT DISTINCT
          "${safeColName}" as raw,
          "${safeColName}" as id,
          '${safeVariantName}' as variant,
          normalize_text_join(CAST("${safeColName}" AS VARCHAR)) as normalized,
          '${escapedBasemapId}' as basemap,
          ${totalCount} as basemap_count
        FROM "${escapedGeomTable}"
        WHERE "${safeColName}" IS NOT NULL
      `;
    });

    await Duck.query(`
      INSERT INTO basemap_attributes
      ${unionQueries.join('\nUNION ALL\n')}
    `);

    return true;
  } catch (error) {
    logger.error(
      'Failed to generate attributes for basemap',
      LogCategory.DATA,
      { basemapId, error }
    );
    return false;
  }
}

export async function computeJoinStats(
  dataset: DuckDBDataset,
  basemap: BasemapMetadata,
  geoColumn: string,
  Duck: DuckDBClientForJoin,
  options: JoinGradingOptions = {}
): Promise<JoinQuality> {
  const basemapId = getBasemapAttributesId(basemap);

  // Generate basemap attributes when needed.
  await ensureBasemapHasAttributes(basemapId, Duck);

  // One similarity cache covers all basemaps.
  const cacheTableName = await ensureSimilarityCached(dataset, geoColumn, Duck);

  const quality = await deriveJoinQualityFromCache(
    cacheTableName,
    basemapId,
    Duck,
    options.excludedValues ?? []
  );

  if (quality.duplicateCount > 0) {
    const escapedTable = escapeIdentifier(dataset.tableName);
    const escapedGeoCol = escapeIdentifier(geoColumn);
    const dupValues = quality.duplicateEntities
      .map((value) => `'${escapeSqlString(value)}'`)
      .join(', ');

    if (dupValues) {
      const hasRowId = (await Duck.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = '${escapeSqlString(dataset.tableName)}' AND column_name = '${INTERNAL_COLUMN.ID}'`,
        { format: 'array' }
      )) as Array<{ column_name: string }>;

      const idCol = hasRowId.length > 0 ? `"${INTERNAL_COLUMN.ID}"` : 'rowid';

      const dupRows = (await Duck.query(
        `SELECT "${escapedGeoCol}" as dataValue, array_agg(${idCol} ORDER BY ${idCol}) as lines FROM "${escapedTable}" WHERE "${escapedGeoCol}" IN (${dupValues}) GROUP BY "${escapedGeoCol}" HAVING COUNT(*) > 1`,
        { format: 'array' }
      )) as Array<{ dataValue: string; lines: number[] }>;

      quality.duplicateLines = dupRows;
    }
  }

  return quality;
}

/** Ensure a basemap has generated attribute rows before matching. */
async function ensureBasemapHasAttributes(
  basemapId: string,
  Duck: DuckDBClientForJoin
): Promise<void> {
  await ensureBasemapAttributesLoaded(Duck);

  const escapedBasemapId = escapeSqlString(basemapId);
  const attributeCount = (await Duck.query(
    `SELECT COUNT(*) as cnt FROM basemap_attributes WHERE basemap = '${escapedBasemapId}'`,
    { format: 'array' }
  )) as Array<{ cnt: number }>;

  if (!attributeCount?.[0]?.cnt || attributeCount[0].cnt === 0) {
    const generated = await generateAttributesForBasemap(basemapId, Duck);
    if (!generated) {
      throw new DataValidationError(
        m.error_no_attributes_basemap({ basemapId }),
        'basemapId',
        { basemapId }
      );
    }

    const recheck = (await Duck.query(
      `SELECT COUNT(*) as cnt FROM basemap_attributes WHERE basemap = '${escapedBasemapId}'`,
      { format: 'array' }
    )) as Array<{ cnt: number }>;

    if (!recheck?.[0]?.cnt || recheck[0].cnt === 0) {
      throw new DuckDBError(
        m.error_no_attributes_basemap_generated({ basemapId }),
        undefined,
        { basemapId, tableName: 'basemap_attributes' }
      );
    }

    // New basemap attributes must be included in future cache builds.
    invalidateSimilarityCache(undefined, Duck);
  }
}

/** Return manual-correction values for one basemap. */
export async function getBasemapAttributeValues(
  basemap: BasemapMetadata,
  Duck: DuckDBClientForJoin
): Promise<string[]> {
  const basemapId = getBasemapAttributesId(basemap);
  await ensureBasemapHasAttributes(basemapId, Duck);

  const escapedBasemapId = escapeSqlString(basemapId);
  const displayVariants = getBasemapDisplayVariants(basemap);
  const displayOrder =
    displayVariants.length > 0
      ? `CASE ${displayVariants
          .map(
            (variant, index) =>
              `WHEN variant = '${escapeSqlString(variant)}' THEN ${index}`
          )
          .join(' ')} ELSE ${displayVariants.length} END,`
      : '';
  const rows = (await Duck.query(
    `WITH source AS (
       SELECT
         raw,
         COALESCE(id, raw) AS entity_id,
         variant,
         ROW_NUMBER() OVER () AS source_order
       FROM basemap_attributes
       WHERE basemap = '${escapedBasemapId}' AND raw IS NOT NULL
     ),
     ranked AS (
       SELECT
         raw,
         ROW_NUMBER() OVER (
           PARTITION BY entity_id
           ORDER BY ${displayOrder} source_order
         ) AS rank
       FROM source
     )
     SELECT raw
     FROM ranked
     WHERE rank = 1
     ORDER BY raw`,
    { format: 'array' }
  )) as Array<{ raw: string }>;

  return rows.map((r) => r.raw);
}

export interface BasemapAlias {
  value: string;
  variant: string | null;
}

const FALLBACK_DISPLAY_VARIANTS: Record<'fr' | 'en', string[]> = {
  fr: ['name_fren', 'name_engl'],
  en: ['name_engl', 'name_fren']
};

function getBasemapDisplayVariants(basemap: BasemapMetadata): string[] {
  const locale = getLocale() === 'fr' ? 'fr' : 'en';
  const configured =
    locale === 'fr'
      ? [basemap.display_id_fr, basemap.display_id_en]
      : [basemap.display_id_en, basemap.display_id_fr];

  const variants = [
    ...configured.filter((variant): variant is string => Boolean(variant)),
    ...FALLBACK_DISPLAY_VARIANTS[locale]
  ];

  return variants.filter(
    (variant, index) => variants.indexOf(variant) === index
  );
}

/** Return aliases keyed by every raw value variant for manual correction. */
export async function getBasemapAttributeAliasesByValue(
  basemap: BasemapMetadata,
  Duck: DuckDBClientForJoin
): Promise<Record<string, BasemapAlias[]>> {
  const basemapId = getBasemapAttributesId(basemap);
  await ensureBasemapHasAttributes(basemapId, Duck);

  const escapedBasemapId = escapeSqlString(basemapId);

  const rows = (await Duck.query(
    `WITH source AS (
       SELECT
         raw,
         variant,
         COALESCE(id, raw) AS entity_id,
         ROW_NUMBER() OVER () AS rn
       FROM basemap_attributes
       WHERE basemap = '${escapedBasemapId}'
     )
     SELECT raw, variant, entity_id, rn
     FROM source
     WHERE raw IS NOT NULL
     ORDER BY entity_id, rn`,
    { format: 'array' }
  )) as Array<{
    raw: string;
    variant: string | null;
    entity_id: string;
    rn: number;
  }>;

  const groups = new Map<string, BasemapAlias[]>();
  for (const row of rows) {
    if (!row.raw || !row.entity_id) continue;
    let bucket = groups.get(row.entity_id);
    if (!bucket) {
      bucket = [];
      groups.set(row.entity_id, bucket);
    }
    bucket.push({ value: row.raw, variant: row.variant ?? null });
  }

  const result: Record<string, BasemapAlias[]> = {};
  for (const row of rows) {
    if (!row.raw) continue;
    if (row.raw in result) continue;
    const bucket = groups.get(row.entity_id);
    if (!bucket) continue;
    const aliases = bucket.filter((entry) => entry.value !== row.raw);
    if (aliases.length > 0) result[row.raw] = aliases;
  }
  return result;
}

export async function applyJoinCorrections(
  dataset: DuckDBDataset,
  geoColumn: string,
  corrections: Record<string, string>,
  Duck: DuckDBClientForJoin
): Promise<void> {
  const entries = Object.entries(corrections);
  if (entries.length === 0) return;

  const valueRows = entries
    .map(
      ([original, corrected]) =>
        `('${escapeSqlString(original)}', '${escapeSqlString(corrected)}')`
    )
    .join(', ');

  const correctionsTable = `corrections_${crypto.randomUUID().replace(/-/g, '_')}`;

  const escapedTableName = escapeIdentifier(dataset.tableName);
  const escapedGeoCol = escapeIdentifier(geoColumn);

  try {
    await Duck.query(
      `CREATE TEMP TABLE "${correctionsTable}" (original VARCHAR, corrected VARCHAR)`
    );
    await Duck.query(`INSERT INTO "${correctionsTable}" VALUES ${valueRows}`);

    await Duck.query(`
      UPDATE "${escapedTableName}"
      SET "${escapedGeoCol}" = c.corrected
      FROM "${correctionsTable}" c
      WHERE "${escapedGeoCol}" = c.original
    `);
  } finally {
    await Duck.query(`DROP TABLE IF EXISTS "${correctionsTable}"`);
  }

  // Corrected source values require a fresh similarity cache.
  invalidateSimilarityCache(dataset.tableName, Duck);
}

async function applyCachedJoinAssociation(
  datasetTableName: string,
  geoColumn: string,
  basemapId: string,
  cacheTableName: string,
  Duck: DuckDBClientForJoin,
  excludedValues: string[] = []
): Promise<void> {
  const escapedDatasetTable = escapeIdentifier(datasetTableName);
  const escapedGeoColumn = escapeIdentifier(geoColumn);
  const escapedBasemapId = escapeSqlString(basemapId);
  const escapedCacheTable = escapeIdentifier(cacheTableName);
  const excludeClause = await getJoinColumnExcludeClause(
    datasetTableName,
    Duck
  );
  const excludedValuesClause =
    excludedValues.length > 0
      ? `AND original_name NOT IN (${excludedValues
          .map((value) => `'${escapeSqlString(value)}'`)
          .join(', ')})`
      : '';

  await Duck.query(`
    CREATE OR REPLACE TABLE "${escapedDatasetTable}" AS
    WITH all_basemap_matches AS (
      SELECT
        original_name AS geoname,
        match_id AS id,
        match_raw AS label,
        match_score AS score,
        typo_match
      FROM "${escapedCacheTable}"
      WHERE match_basemap = '${escapedBasemapId}'
        AND match_id IS NOT NULL
        ${excludedValuesClause}
    ),
    -- IDs claimed by unambiguous exact matches (one candidate → one basemap id)
    exact_claimed_ids AS (
      SELECT MIN(id) AS id
      FROM all_basemap_matches
      WHERE typo_match = 'exact'
      GROUP BY geoname
      HAVING COUNT(DISTINCT id) = 1
    ),
    -- Keep all exact rows; for partial rows, drop those whose id is already claimed
    eligible_matches AS (
      SELECT * FROM all_basemap_matches WHERE typo_match = 'exact'
      UNION ALL
      SELECT * FROM all_basemap_matches
      WHERE typo_match != 'exact'
        AND id NOT IN (SELECT id FROM exact_claimed_ids)
    ),
    ranked_join AS (
      SELECT *
      FROM eligible_matches
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY geoname
        ORDER BY score DESC, id, label
      ) = 1
      )
    SELECT
      t.* ${excludeClause},
      j.id AS "${JOINED_BASEMAP_COLUMN.ID}",
      j.label AS "${JOINED_BASEMAP_COLUMN.LABEL}",
      j.typo_match AS "${JOINED_BASEMAP_COLUMN.TYPO_MATCH}"
    FROM "${escapedDatasetTable}" t
    LEFT JOIN ranked_join j
      ON t."${escapedGeoColumn}" = j.geoname
  `);
}

export interface FinalizeJoinOptions {
  excludedValues?: string[];
}

export async function finalizeJoin(
  dataset: DuckDBDataset,
  basemap: BasemapMetadata,
  geoColumn: string,
  Duck: DuckDBClientForJoin,
  options: FinalizeJoinOptions = {}
): Promise<FinalizeJoinResult> {
  if (isOSMBasemap(basemap)) {
    return finalizeGPSJoin(dataset, basemap);
  }

  // GPS mode with a catalog/custom basemap: no textual join needed
  if (!geoColumn && detectGPSColumns(dataset.columns, dataset.geoDetection)) {
    return finalizeGPSJoin(dataset, basemap);
  }

  if (geoColumn) {
    const columnExists = dataset.columns.some((c) => c.name === geoColumn);
    if (!columnExists) {
      throw new DataValidationError(
        m.error_column_not_found({
          geoColumn,
          columns: dataset.columns.map((c) => c.name).join(', ')
        }),
        geoColumn,
        {
          columns: dataset.columns.map((c) => c.name),
          datasetId: dataset.id,
          tableName: dataset.tableName
        }
      );
    }
  }

  perfMark(PERF_PHASE.JOIN_FINALIZE);
  const basemapId = getBasemapAttributesId(basemap);
  await ensureBasemapHasAttributes(basemapId, Duck);

  const cacheTableName = await ensureSimilarityCached(dataset, geoColumn, Duck);

  await applyCachedJoinAssociation(
    dataset.tableName,
    geoColumn,
    basemapId,
    cacheTableName,
    Duck,
    options.excludedValues ?? []
  );

  perfMeasure(PERF_PHASE.JOIN_FINALIZE);
  return {
    joinedBasemap: basemap.file,
    geoColumn,
    gpsMode: false,
    gpsColumns: undefined
  };
}

function finalizeGPSJoin(
  dataset: DuckDBDataset,
  basemap: BasemapMetadata
): FinalizeJoinResult {
  const gpsColumns = detectGPSColumns(dataset.columns, dataset.geoDetection);
  if (!gpsColumns) {
    throw new DataValidationError(
      m.error_gps_columns_not_found(),
      'gpsColumns',
      {
        datasetId: dataset.id,
        tableName: dataset.tableName
      }
    );
  }

  return {
    joinedBasemap: basemap.file,
    gpsMode: true,
    gpsColumns
  };
}

export async function getJoinedArrowTable(
  datasetTableName: string,
  basemapId: string,
  Duck: DuckDBClientForJoin,
  loadGeometryIntoDuckDB: (basemapId: string) => Promise<string>,
  getArrowTableDirect: (tableName: string) => Promise<Table>
): Promise<Table> {
  const geometryTable = await loadGeometryIntoDuckDB(basemapId);

  const sanitizedDataset = datasetTableName.replace(/[^a-zA-Z0-9_]/g, '_');
  const sanitizedBasemap = basemapId.replace(/[^a-zA-Z0-9_]/g, '_');
  const joinedView = `joined_${sanitizedDataset}_${sanitizedBasemap}`;
  const escapedDataset = escapeIdentifier(datasetTableName);
  const escapedGeometry = escapeIdentifier(geometryTable);

  const geometryTableColumns = (await Duck.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = '${escapeSqlString(geometryTable)}'`,
    { format: 'array' }
  )) as InformationSchemaColumn[];

  const geometryColumn = geometryTableColumns.find((column) =>
    isGeometryColumnName(column.column_name)
  );

  if (!geometryColumn) {
    throw new DataValidationError(
      m.error_no_geometry_column({ geometryTable }),
      'geometry',
      { geometryTable }
    );
  }

  const featureIdColumn = geometryTableColumns.find(
    (column) => column.column_name === INTERNAL_COLUMN.FEATURE_ID
  );
  const nativeIdColumn = geometryTableColumns.find(
    (column) =>
      column.column_name.toLowerCase() === CANONICAL_ID_COLUMN &&
      !isGeometryColumnName(column.column_name)
  );
  const escapedGeomCol = escapeIdentifier(geometryColumn.column_name);
  const escapedBasemapIdCol = escapeIdentifier(JOINED_BASEMAP_COLUMN.ID);

  const joinColumn = featureIdColumn ?? nativeIdColumn;

  if (joinColumn) {
    const escapedJoinCol = escapeIdentifier(joinColumn.column_name);
    await Duck.query(`
      CREATE OR REPLACE VIEW "${joinedView}" AS
      SELECT d.*, g."${escapedGeomCol}" AS geometry
      FROM "${escapedDataset}" d
      INNER JOIN "${escapedGeometry}" g
        ON CAST(d."${escapedBasemapIdCol}" AS VARCHAR) = CAST(g."${escapedJoinCol}" AS VARCHAR)
      WHERE g."${escapedGeomCol}" IS NOT NULL
    `);
  } else {
    const attrColumns = geometryTableColumns.filter((column) => {
      if (isGeometryColumnName(column.column_name)) {
        return false;
      }
      return ['VARCHAR', 'TEXT'].includes(column.data_type.toUpperCase());
    });

    const colList = attrColumns
      .map((c) => `"${escapeIdentifier(c.column_name)}"`)
      .join(', ');

    await Duck.query(`
      CREATE OR REPLACE VIEW "${joinedView}" AS
      WITH geom_unpivot AS (
        UNPIVOT "${escapedGeometry}"
        ON ${colList}
        INTO NAME _attr_col VALUE _attr_val
      )
      SELECT d.*, gu._geom_value AS geometry
      FROM "${escapedDataset}" d
      INNER JOIN (
        SELECT DISTINCT _attr_val, "${escapedGeomCol}" AS _geom_value
        FROM geom_unpivot
      ) gu
      ON CAST(d."${escapedBasemapIdCol}" AS VARCHAR) = CAST(gu._attr_val AS VARCHAR)
      WHERE gu._geom_value IS NOT NULL
    `);
  }

  let arrowTable = await getArrowTableDirect(joinedView);

  // The joined view contains a geometry column from the basemap, but DuckDB
  // does not propagate GeoArrow extension metadata through SQL VIEWs.
  // addGeoArrowMetadata detects the native GeoArrow struct type from the
  // Arrow field hierarchy and adds the required 'geo' schema metadata.
  arrowTable = addGeoArrowMetadata(arrowTable);

  return arrowTable;
}
