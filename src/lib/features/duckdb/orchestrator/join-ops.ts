import { JoinStatus } from '$lib/features/commons/constants/ui.constants';
import {
  CANONICAL_ID_COLUMN,
  INTERNAL_COLUMN,
  JOINED_BASEMAP_COLUMN,
  JOINED_BASEMAP_COLUMNS
} from '$lib/features/commons/constants/data.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
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
import type { JoinCandidate } from '$lib/features/commons/types/data-tab.types';
import { detectGPSColumns } from './gps-ops';

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

function isGeometryColumnName(columnName: string): boolean {
  return /^(geom|geometry|wkb_geometry|the_geom)$/i.test(columnName);
}

const SIMILARITY_CACHE_PREFIX = '__similarity_cache__';
const MAX_FUZZY_JOIN_CANDIDATES = 1000;
const MAX_EXACT_MATCHES_PER_CANDIDATE_BASEMAP = 50;

interface SimilarityCacheEntry {
  tableName: string;
  geoColumn: string;
  filterClause: string | null;
  cacheTableName: string;
}

let activeSimilarityCache: SimilarityCacheEntry | null = null;
const pendingSimilarityCacheBuilds = new Map<string, Promise<string>>();

function getSimilarityCacheTableName(datasetTable: string): string {
  const sanitized = datasetTable.replace(/[^a-zA-Z0-9_]/g, '_');
  return `${SIMILARITY_CACHE_PREFIX}${sanitized}`;
}

function getSimilarityCacheBuildKey(
  datasetTable: string,
  geoColumn: string,
  filterClause: string | null
): string {
  return `${datasetTable}::${geoColumn}::${filterClause ?? ''}`;
}

/** Invalidate cached similarity rows after source-value mutations. */
export function invalidateSimilarityCache(datasetTableName?: string): void {
  if (
    !datasetTableName ||
    activeSimilarityCache?.tableName === datasetTableName
  ) {
    activeSimilarityCache = null;
  }
}

/** Build or reuse the cross-basemap similarity temp table. */
async function ensureSimilarityCached(
  dataset: DuckDBDataset,
  geoColumn: string,
  Duck: DuckDBClientForJoin,
  filterClause?: string | null
): Promise<string> {
  const cacheTableName = getSimilarityCacheTableName(dataset.tableName);
  const normalizedFilter = filterClause || null;
  const buildKey = getSimilarityCacheBuildKey(
    dataset.tableName,
    geoColumn,
    normalizedFilter
  );

  // Reuse only a cache matching the current dataset, column, and filters.
  if (
    activeSimilarityCache &&
    activeSimilarityCache.tableName === dataset.tableName &&
    activeSimilarityCache.geoColumn === geoColumn &&
    activeSimilarityCache.filterClause === normalizedFilter
  ) {
    // Rebuild if DuckDB dropped the temp table externally.
    const check = (await Duck.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = '${escapeSqlString(cacheTableName)}'`,
      { format: 'array' }
    )) as Array<{ table_name: string }>;

    if (check && check.length > 0) {
      return cacheTableName;
    }
    activeSimilarityCache = null;
  }

  const pendingBuild = pendingSimilarityCacheBuilds.get(buildKey);
  if (pendingBuild) {
    return pendingBuild;
  }

  const buildPromise = (async () => {
    await ensureBasemapAttributesLoaded(Duck);

    const escapedGeoCol = escapeIdentifier(geoColumn);
    const escapedCacheTable = escapeIdentifier(cacheTableName);

    // Build the similarity cache in two phases:
    // Phase 1: exact match via equi-join on pre-normalized text (hash join, O(n+m)).
    //          Cap rows per source value and basemap so broad codes such as
    //          department ids cannot cache every commune sharing the same attribute.
    // Phase 2: fuzzy Jaro-Winkler (score_cutoff=0.85) only on residual unmatched candidates
    //          — bounded because unmatched large code datasets would otherwise cross-join every
    //          source value with every basemap attribute on the browser main thread.
    // Normalization is pre-computed once in the candidates CTE (like the get_similarity macro)
    // to avoid redundant computation inside the join/cross-join.
    await Duck.query(`
      CREATE OR REPLACE TEMP TABLE "${escapedCacheTable}" AS
      WITH source_raw AS (
        SELECT
          CAST("${escapedGeoCol}" AS VARCHAR) as original_name,
          normalize_text_join(CAST("${escapedGeoCol}" AS VARCHAR)) as normalized_name
        FROM "${escapeIdentifier(dataset.tableName)}"
        WHERE "${escapedGeoCol}" IS NOT NULL${normalizedFilter ? ` AND (${normalizedFilter})` : ''}
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
      -- codes when every value casts to a number, or when all values share one
      -- fixed short length (≥ 3 distinct values so tiny name sets don't trip it).
      source_code_signals AS (
        SELECT
          COUNT(*) FILTER (WHERE TRY_CAST(normalized_name AS DOUBLE) IS NULL) = 0 AS all_numeric,
          (COUNT(DISTINCT length(normalized_name)) = 1
            AND MAX(length(normalized_name)) <= 8
            AND COUNT(DISTINCT normalized_name) >= 3) AS fixed_length_codes
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
      sorted_attributes AS (
        SELECT
          ba.*,
          array_to_string(list_sort(string_split(ba.normalized, ' ')), ' ') AS normalized_sorted
        FROM basemap_attributes ba
      ),
      fuzzy_raw AS (
        SELECT
          u.original_name,
          u.source_dup_count,
          GREATEST(
            jaro_winkler_similarity(u.normalized_name, ba.normalized, 0.85),
            0.99 * jaro_winkler_similarity(u.normalized_sorted, ba.normalized_sorted, 0.85)
          ) AS match_score,
          ba.id AS match_id,
          ba.raw AS match_raw,
          ba.variant AS match_variant,
          ba.basemap AS match_basemap,
          ba.basemap_count AS match_basemap_count
        FROM sorted_unmatched u, sorted_attributes ba
      ),
      fuzzy_matches AS (
        SELECT
          original_name,
          source_dup_count,
          match_score,
          'partial' AS typo_match,
          match_id,
          match_raw,
          match_variant,
          match_basemap,
          match_basemap_count
        FROM fuzzy_raw
        WHERE match_score > 0
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

    activeSimilarityCache = {
      tableName: dataset.tableName,
      geoColumn,
      filterClause: normalizedFilter,
      cacheTableName
    };

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

/** Derive one basemap's join quality from cached similarity rows. */
async function deriveJoinQualityFromCache(
  cacheTableName: string,
  basemapId: string,
  Duck: DuckDBClientForJoin
): Promise<JoinQuality> {
  const escapedCache = escapeIdentifier(cacheTableName);
  const escapedBasemapId = escapeSqlString(basemapId);

  const result = (await Duck.query(
    `WITH basemap_matches AS (
      SELECT *
      FROM "${escapedCache}"
      WHERE match_basemap = '${escapedBasemapId}'
        AND match_id IS NOT NULL
        AND typo_match != 'toofar'
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
    )
    SELECT
      c.original_name,
      c.source_dup_count,
      CASE
        WHEN c.source_dup_count > 1 THEN 'duplicate'
        WHEN bm.best_score IS NULL THEN 'not_found'
        WHEN bm.best_score = 1 AND bm.distinct_exact_id_count = 1 THEN 'matched'
        WHEN bm.best_score = 1 AND bm.distinct_exact_id_count > 1 THEN 'ambiguous'
        ELSE 'check'
      END as status,
      cl.candidates,
      bm.best_score
    FROM all_candidates c
    LEFT JOIN best_matches bm ON c.original_name = bm.original_name
    LEFT JOIN candidate_lists cl ON c.original_name = cl.original_name`,
    { format: 'array' }
  )) as Array<{
    original_name: string;
    source_dup_count: number;
    status: 'matched' | 'check' | 'ambiguous' | 'not_found' | 'duplicate';
    candidates: RawJoinCandidate[] | null;
    best_score: number | null;
  }>;

  return buildJoinQualityFromRows(result);
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

function buildJoinQualityFromRows(
  rows: Array<{
    original_name: string;
    source_dup_count: number;
    status: 'matched' | 'check' | 'ambiguous' | 'not_found' | 'duplicate';
    candidates: RawJoinCandidate[] | null;
    best_score: number | null;
  }>
): JoinQuality {
  const entities = rows.map((r) => {
    const candidates = (r.candidates ?? []).map(toJoinCandidate);
    return {
      dataValue: r.original_name,
      status:
        r.status === 'duplicate'
          ? JoinStatus.DUPLICATE
          : r.status === 'ambiguous'
            ? JoinStatus.TO_VERIFY
            : r.status === 'check'
              ? JoinStatus.TO_VERIFY
              : r.status === 'not_found'
                ? JoinStatus.UNRECOGNIZED
                : JoinStatus.JOINED,
      matches: candidates.map((c) => c.name),
      matchCount: candidates.length,
      candidates,
      basemapValue:
        r.status === 'matched' && candidates.length > 0
          ? candidates[0].name
          : undefined
    };
  });

  return {
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
  Duck: DuckDBClientForJoin,
  filterClause?: string | null
): Promise<JoinSynthesisResult[]> {
  const cacheTableName = await ensureSimilarityCached(
    dataset,
    geoColumn,
    Duck,
    filterClause
  );

  const escapedCache = escapeIdentifier(cacheTableName);

  const rows = (await Duck.query(
    `WITH matched AS (
      SELECT DISTINCT
        original_name,
        match_basemap,
        match_basemap_count
      FROM "${escapedCache}"
      WHERE match_id IS NOT NULL
        AND typo_match != 'toofar'
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
  filterClause?: string | null
): Promise<JoinQuality> {
  const basemapId = getBasemapAttributesId(basemap);

  // Generate basemap attributes when needed.
  await ensureBasemapHasAttributes(basemapId, Duck);

  // One similarity cache covers all basemaps.
  const cacheTableName = await ensureSimilarityCached(
    dataset,
    geoColumn,
    Duck,
    filterClause
  );

  const quality = await deriveJoinQualityFromCache(
    cacheTableName,
    basemapId,
    Duck
  );

  if (quality.duplicateCount > 0) {
    const escapedTable = escapeIdentifier(dataset.tableName);
    const escapedGeoCol = escapeIdentifier(geoColumn);
    const escapedFilter = filterClause ? ` AND (${filterClause})` : '';
    const dupValues = quality.entities
      .filter((e) => e.status === JoinStatus.DUPLICATE)
      .map((e) => `'${escapeSqlString(e.dataValue)}'`)
      .join(', ');

    if (dupValues) {
      const hasRowId = (await Duck.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = '${escapeSqlString(dataset.tableName)}' AND column_name = '__id'`,
        { format: 'array' }
      )) as Array<{ column_name: string }>;

      const idCol = hasRowId.length > 0 ? '"__id"' : 'rowid';

      const dupRows = (await Duck.query(
        `SELECT "${escapedGeoCol}" as dataValue, array_agg(${idCol} ORDER BY ${idCol}) as lines FROM "${escapedTable}" WHERE "${escapedGeoCol}" IN (${dupValues})${escapedFilter} GROUP BY "${escapedGeoCol}" HAVING COUNT(*) > 1`,
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
    invalidateSimilarityCache();
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
  invalidateSimilarityCache(dataset.tableName);
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
        AND typo_match != 'toofar'
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
