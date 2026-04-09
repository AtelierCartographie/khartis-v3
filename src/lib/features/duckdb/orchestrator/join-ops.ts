import { JoinStatus } from '$lib/features/commons/constants/ui.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { basemapService } from '$lib/features/map/services/basemap.service.svelte';
import { isOSMBasemap } from '$lib/features/map/services/osm-tile.service';
import type {
  BasemapMetadata,
  JoinQuality
} from '$lib/features/map/types/basemap.types';
import type { Table } from 'apache-arrow/Arrow';
import { addGeoArrowMetadata } from '$lib/features/map/utils/read-geojson-arrow';
import type { DuckDBDataset, FinalizeJoinResult } from '../types';
import { detectGPSColumns } from './gps-ops';

export type { FinalizeJoinResult };

export interface DuckDBClientForJoin {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  join_by_id(
    tableName: string,
    geoColumn: string,
    options: { basemaps_table: string }
  ): Promise<unknown>;
  apply_join_association(
    tableName: string,
    basemapFile: string
  ): Promise<unknown>;
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

// ---------------------------------------------------------------------------
// Similarity cache — run get_similarity once against ALL basemap_attributes,
// then derive per-basemap JoinQuality from the cached raw matches.
// ---------------------------------------------------------------------------

const SIMILARITY_CACHE_PREFIX = '__similarity_cache__';

interface SimilarityCacheEntry {
  tableName: string;
  geoColumn: string;
  filterClause: string | null;
  cacheTableName: string;
}

let activeSimilarityCache: SimilarityCacheEntry | null = null;

function getSimilarityCacheTableName(datasetTable: string): string {
  const sanitized = datasetTable.replace(/[^a-zA-Z0-9_]/g, '_');
  return `${SIMILARITY_CACHE_PREFIX}${sanitized}`;
}

/**
 * Invalidates the similarity cache for a given dataset. Must be called after
 * data mutations (e.g. corrections) that change the source values.
 */
export function invalidateSimilarityCache(datasetTableName?: string): void {
  if (
    !datasetTableName ||
    activeSimilarityCache?.tableName === datasetTableName
  ) {
    activeSimilarityCache = null;
  }
}

/**
 * Builds the similarity cache by running get_similarity once against ALL
 * basemap_attributes. The cache is a temp table with raw match rows
 * (one per source_value × basemap_attribute match).
 */
async function ensureSimilarityCached(
  dataset: DuckDBDataset,
  geoColumn: string,
  Duck: DuckDBClientForJoin,
  filterClause?: string | null
): Promise<string> {
  const cacheTableName = getSimilarityCacheTableName(dataset.tableName);
  const normalizedFilter = filterClause || null;

  // Return existing cache if it matches the current dataset + geoColumn + filters
  if (
    activeSimilarityCache &&
    activeSimilarityCache.tableName === dataset.tableName &&
    activeSimilarityCache.geoColumn === geoColumn &&
    activeSimilarityCache.filterClause === normalizedFilter
  ) {
    // Verify the table still exists in DuckDB
    const check = (await Duck.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = '${escapeSqlString(cacheTableName)}'`,
      { format: 'array' }
    )) as Array<{ table_name: string }>;

    if (check && check.length > 0) {
      return cacheTableName;
    }
    // Table was dropped externally — rebuild
    activeSimilarityCache = null;
  }

  const start = performance.now();

  await ensureBasemapAttributesLoaded(Duck);

  const escapedGeoCol = escapeIdentifier(geoColumn);
  const escapedCacheTable = escapeIdentifier(cacheTableName);

  // Build the cache: cross-join candidates × basemap_attributes, compute
  // jaro_winkler inline and filter score > 0 early (score_cutoff=0.85 returns
  // 0 for pairs below threshold, so score > 0 ≡ typo_match != 'toofar').
  // This avoids the LATERAL+get_similarity pattern which forces full
  // materialization of N_candidates × N_attrs rows (OOM with large basemaps).
  await Duck.query(`
    CREATE OR REPLACE TEMP TABLE "${escapedCacheTable}" AS
    WITH source_data AS (
      SELECT
        CAST("${escapedGeoCol}" AS VARCHAR) as original_name,
        COUNT(*) OVER (PARTITION BY normalize_text_join(CAST("${escapedGeoCol}" AS VARCHAR))) as source_dup_count
      FROM "${escapeIdentifier(dataset.tableName)}"
      WHERE "${escapedGeoCol}" IS NOT NULL${normalizedFilter ? ` AND (${normalizedFilter})` : ''}
    ),
    candidates AS (
      SELECT DISTINCT original_name, source_dup_count FROM source_data
    ),
    jw_pairs AS (
      SELECT
        c.original_name,
        c.source_dup_count,
        jaro_winkler_similarity(normalize_text_join(CAST(c.original_name AS VARCHAR)), ba.normalized, 0.85) AS score,
        ba.id AS match_id,
        ba.raw AS match_raw,
        ba.variant AS match_variant,
        ba.basemap AS match_basemap,
        ba.basemap_count AS match_basemap_count
      FROM candidates c, basemap_attributes ba
    ),
    matches AS (
      SELECT
        original_name,
        source_dup_count,
        score AS match_score,
        CASE WHEN score = 1 THEN 'exact' ELSE 'partial' END AS typo_match,
        match_id,
        match_raw,
        match_variant,
        match_basemap,
        match_basemap_count
      FROM jw_pairs
      WHERE score > 0
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
    LEFT JOIN matches m ON c.original_name = m.original_name
  `);

  activeSimilarityCache = {
    tableName: dataset.tableName,
    geoColumn,
    filterClause: normalizedFilter,
    cacheTableName
  };

  logger.info('Similarity cache built against all basemaps', LogCategory.DATA, {
    cacheTableName,
    datasetTable: dataset.tableName,
    durationMs: (performance.now() - start).toFixed(2)
  });

  return cacheTableName;
}

/**
 * Derives JoinQuality for a specific basemap from the cached similarity table.
 * Reproduces the same logic as analyze_join_quality but filtered by basemap.
 */
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
    best_matches AS (
      SELECT
        original_name,
        list(DISTINCT {id: match_id, name: match_raw, score: match_score, type: typo_match}) as candidates,
        max(match_score) as best_score,
        count(*) as match_count,
        count(DISTINCT match_id) as distinct_id_count,
        count(DISTINCT CASE WHEN typo_match = 'exact' THEN match_id END) as distinct_exact_id_count
      FROM basemap_matches
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
      bm.candidates,
      bm.best_score
    FROM all_candidates c
    LEFT JOIN best_matches bm ON c.original_name = bm.original_name`,
    { format: 'array' }
  )) as Array<{
    original_name: string;
    source_dup_count: number;
    status: 'matched' | 'check' | 'ambiguous' | 'not_found' | 'duplicate';
    candidates:
      | { id: string; name: string; score: number; type: string }[]
      | null;
    best_score: number | null;
  }>;

  return buildJoinQualityFromRows(result);
}

function buildJoinQualityFromRows(
  rows: Array<{
    original_name: string;
    source_dup_count: number;
    status: 'matched' | 'check' | 'ambiguous' | 'not_found' | 'duplicate';
    candidates:
      | { id: string; name: string; score: number; type: string }[]
      | null;
    best_score: number | null;
  }>
): JoinQuality {
  const entities = rows.map((r) => ({
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
    matches: [...new Set(r.candidates?.map((c) => c.name) || [])],
    matchCount: r.candidates?.length || 0,
    basemapValue:
      r.status === 'matched' && r.candidates && r.candidates.length > 0
        ? r.candidates[0].name
        : undefined
  }));

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
    totalEntities: entities.length
  };
}

/**
 * Join synthesis result: per-basemap share scores derived from similarity cache.
 */
export interface JoinSynthesisResult {
  basemap: string;
  shareBasemap: number;
  shareCandidate: number;
}

/**
 * Computes join_synthesis metrics from the similarity cache for all basemaps.
 * Returns per-basemap coverage scores sorted by shareBasemap descending.
 */
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
      throw new Error(
        'basemap_attributes table could not be loaded. Check network connectivity and basemap files.'
      );
    }
  }
}

async function getJoinColumnExcludeClause(
  tableName: string,
  Duck: DuckDBClientForJoin
): Promise<string> {
  const columnsToExclude = ['basemap_id', 'typo_match'];
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

    logger.info('Generated basemap attributes on-the-fly', LogCategory.DATA, {
      basemapId,
      columnsUsed: candidateColumns.map((c) => c.column_name),
      totalCount
    });

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

  // Ensure basemap has attributes (generate from geometry if needed)
  await ensureBasemapHasAttributes(basemapId, Duck);

  // Build or reuse the similarity cache (one computation across ALL basemaps)
  const cacheTableName = await ensureSimilarityCached(
    dataset,
    geoColumn,
    Duck,
    filterClause
  );

  // Derive per-basemap stats from the cached raw matches
  return deriveJoinQualityFromCache(cacheTableName, basemapId, Duck);
}

/**
 * Ensures a specific basemap has entries in basemap_attributes.
 * If not, generates them from the basemap geometry table.
 */
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
    logger.info(
      'No pre-built attributes found, generating from geometry',
      LogCategory.DATA,
      { basemapId }
    );

    const generated = await generateAttributesForBasemap(basemapId, Duck);
    if (!generated) {
      throw new Error(
        `No attributes found for basemap '${basemapId}'. The basemap may not be properly indexed in basemap_attributes.`
      );
    }

    const recheck = (await Duck.query(
      `SELECT COUNT(*) as cnt FROM basemap_attributes WHERE basemap = '${escapedBasemapId}'`,
      { format: 'array' }
    )) as Array<{ cnt: number }>;

    if (!recheck?.[0]?.cnt || recheck[0].cnt === 0) {
      throw new Error(
        `No attributes found for basemap '${basemapId}' even after generation from geometry.`
      );
    }

    // New basemap attributes were added — invalidate cache so they're included
    invalidateSimilarityCache();
  }
}

/**
 * Returns distinct raw attribute values for a given basemap from the
 * basemap_attributes table. Used to populate the manual correction dropdown
 * for unrecognized entities.
 */
export async function getBasemapAttributeValues(
  basemap: BasemapMetadata,
  Duck: DuckDBClientForJoin
): Promise<string[]> {
  const basemapId = getBasemapAttributesId(basemap);
  await ensureBasemapHasAttributes(basemapId, Duck);

  const escapedBasemapId = escapeSqlString(basemapId);
  const rows = (await Duck.query(
    `SELECT DISTINCT raw FROM basemap_attributes WHERE basemap = '${escapedBasemapId}' AND raw IS NOT NULL ORDER BY raw`,
    { format: 'array' }
  )) as Array<{ raw: string }>;

  return rows.map((r) => r.raw);
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

  await Duck.query(
    `CREATE TEMP TABLE "${correctionsTable}" (original VARCHAR, corrected VARCHAR)`
  );
  await Duck.query(`INSERT INTO "${correctionsTable}" VALUES ${valueRows}`);

  const escapedTableName = escapeIdentifier(dataset.tableName);
  const escapedGeoCol = escapeIdentifier(geoColumn);

  await Duck.query(`
    UPDATE "${escapedTableName}"
    SET "${escapedGeoCol}" = c.corrected
    FROM "${correctionsTable}" c
    WHERE "${escapedGeoCol}" = c.original
  `);

  await Duck.query(`DROP TABLE "${correctionsTable}"`);

  // Source values changed — similarity cache must be rebuilt
  invalidateSimilarityCache(dataset.tableName);
}

export interface FinalizeJoinOptions {
  skipJoinComputation?: boolean;
}

async function applyCachedJoinAssociation(
  datasetTableName: string,
  geoColumn: string,
  basemapId: string,
  cacheTableName: string,
  Duck: DuckDBClientForJoin
): Promise<void> {
  const escapedDatasetTable = escapeIdentifier(datasetTableName);
  const escapedGeoColumn = escapeIdentifier(geoColumn);
  const escapedBasemapId = escapeSqlString(basemapId);
  const escapedCacheTable = escapeIdentifier(cacheTableName);
  const excludeClause = await getJoinColumnExcludeClause(
    datasetTableName,
    Duck
  );

  await Duck.query(`
    CREATE OR REPLACE TABLE "${escapedDatasetTable}" AS
    WITH ranked_join AS (
      SELECT
        original_name AS geoname,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM basemap_attributes ba
            WHERE ba.basemap = match_basemap
              AND ba.variant = match_id
            LIMIT 1
          )
            THEN match_raw
          ELSE match_id
        END AS id,
        match_score AS score,
        typo_match
      FROM "${escapedCacheTable}"
      WHERE match_basemap = '${escapedBasemapId}'
        AND match_id IS NOT NULL
        AND typo_match != 'toofar'
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY original_name
        ORDER BY match_score DESC, match_id
      ) = 1
    )
    SELECT
      t.* ${excludeClause},
      j.id AS basemap_id,
      j.typo_match
    FROM "${escapedDatasetTable}" t
    LEFT JOIN ranked_join j
      ON t."${escapedGeoColumn}" = j.geoname
  `);
}

export async function finalizeJoin(
  dataset: DuckDBDataset,
  basemap: BasemapMetadata,
  geoColumn: string,
  Duck: DuckDBClientForJoin,
  _options?: FinalizeJoinOptions
): Promise<FinalizeJoinResult> {
  const start = performance.now();
  logger.info('Finalizing join for dataset', LogCategory.DATA, {
    datasetId: dataset.id,
    basemap: basemap.file,
    geoColumn
  });

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
      throw new Error(
        `Column '${geoColumn}' not found in dataset. Available columns: ${dataset.columns.map((c) => c.name).join(', ')}`
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
    Duck
  );

  const joinedCountResult = (await Duck.query(
    `SELECT COUNT(*) as cnt FROM "${dataset.tableName}" WHERE basemap_id IS NOT NULL`,
    { format: 'array' }
  )) as Array<{ cnt: number }>;

  const joinedCount = Number(joinedCountResult?.[0]?.cnt ?? 0);
  if (joinedCount === 0) {
    logger.warn('Join produced 0 matches', LogCategory.DATA, {
      datasetId: dataset.id,
      basemap: basemap.file,
      geoColumn
    });
  } else {
    logger.info('Join validation passed', LogCategory.DATA, {
      joinedCount,
      totalRows: dataset.rowCount,
      matchPercentage: ((joinedCount / dataset.rowCount) * 100).toFixed(1)
    });
  }

  logger.success('Join finalized successfully', LogCategory.DATA, {
    datasetId: dataset.id,
    basemap: basemap.file,
    joinedCount,
    durationMs: (performance.now() - start).toFixed(2)
  });

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
  const start = performance.now();
  logger.info(
    'Finalizing GPS join (no textual join needed)',
    LogCategory.DATA,
    {
      datasetId: dataset.id,
      basemap: basemap.file
    }
  );

  const gpsColumns = detectGPSColumns(dataset.columns, dataset.geoDetection);
  if (!gpsColumns) {
    throw new Error('GPS columns (latitude/longitude) not found in dataset');
  }

  logger.success('GPS join finalized', LogCategory.DATA, {
    datasetId: dataset.id,
    basemap: basemap.file,
    gpsColumns,
    durationMs: (performance.now() - start).toFixed(2)
  });

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
  const start = performance.now();
  logger.info('Creating joined Arrow table for rendering', LogCategory.MAP, {
    datasetTableName,
    basemapId
  });

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
    throw new Error(
      `No geometry column found in basemap geometry table "${geometryTable}".`
    );
  }

  const attrColumns = geometryTableColumns.filter((column) => {
    if (isGeometryColumnName(column.column_name)) {
      return false;
    }

    return ['VARCHAR', 'TEXT'].includes(column.data_type.toUpperCase());
  });

  const colList = attrColumns
    .map((c) => `"${escapeIdentifier(c.column_name)}"`)
    .join(', ');

  const geometrySelectExpression = 'gu._geom_value';

  await Duck.query(`
    CREATE OR REPLACE VIEW "${joinedView}" AS
    WITH geom_unpivot AS (
      UNPIVOT "${escapedGeometry}"
      ON ${colList}
      INTO NAME _attr_col VALUE _attr_val
    )
    SELECT d.*, ${geometrySelectExpression} AS geometry
    FROM "${escapedDataset}" d
    INNER JOIN (
      SELECT DISTINCT _attr_val, "${escapeIdentifier(geometryColumn.column_name)}" AS _geom_value
      FROM geom_unpivot
    ) gu
    ON CAST(d.basemap_id AS VARCHAR) = CAST(gu._attr_val AS VARCHAR)
    WHERE gu._geom_value IS NOT NULL
  `);

  let arrowTable = await getArrowTableDirect(joinedView);

  // The joined view contains a geometry column from the basemap, but DuckDB
  // does not propagate GeoArrow extension metadata through SQL VIEWs.
  // addGeoArrowMetadata detects the native GeoArrow struct type from the
  // Arrow field hierarchy and adds the required 'geo' schema metadata.
  arrowTable = addGeoArrowMetadata(arrowTable);

  logger.success('Joined Arrow table created', LogCategory.MAP, {
    joinedView,
    rows: arrowTable.numRows,
    hasGeoMetadata: Boolean(arrowTable.schema.metadata?.get('geo')),
    durationMs: (performance.now() - start).toFixed(2)
  });

  return arrowTable;
}

interface ArrowTableLike {
  get(index: number): Record<string, unknown>;
  numRows: number;
}

export async function joinDataWithBasemap(
  dataTableName: string,
  dataColumnName: string,
  basemapTableName: string,
  basemapColumnName: string,
  Duck: DuckDBClientForJoin
): Promise<string> {
  const start = performance.now();

  logger.info('Joining data with basemap in DuckDB', LogCategory.DUCKDB, {
    dataTableName,
    basemapTableName,
    dataColumnName,
    basemapColumnName
  });

  const joinedTableName = `joined_${Date.now().toString(36)}`;
  const escapedDataTable = escapeIdentifier(dataTableName);
  const escapedDataCol = escapeIdentifier(dataColumnName);
  const escapedBasemapTable = escapeIdentifier(basemapTableName);
  const escapedBasemapCol = escapeIdentifier(basemapColumnName);

  await Duck.query(`
    CREATE TABLE "${joinedTableName}" AS
    SELECT
      b.*,
      d.* EXCLUDE ("${escapedDataCol}")
    FROM "${escapedBasemapTable}" b
    INNER JOIN "${escapedDataTable}" d
    ON LOWER(TRIM(b."${escapedBasemapCol}")) = LOWER(TRIM(d."${escapedDataCol}"))
  `);

  const countResult = (await Duck.query(`
    SELECT COUNT(*) as count FROM "${joinedTableName}"
  `)) as ArrowTableLike;

  const countRow = countResult.get(0) as Record<string, unknown>;
  const joinedCount = Number(countRow?.count) || 0;

  logger.success('DuckDB basemap join completed', LogCategory.DUCKDB, {
    joinedTableName,
    joinedCount,
    durationMs: (performance.now() - start).toFixed(2)
  });

  return joinedTableName;
}
