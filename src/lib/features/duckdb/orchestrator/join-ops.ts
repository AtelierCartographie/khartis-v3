import { JoinStatus } from '$lib/features/commons/constants/ui.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { isOSMBasemap } from '$lib/features/map/services/osm-tile.service';
import type {
  BasemapMetadata,
  JoinQuality
} from '$lib/features/map/types/basemap.types';
import type { Table } from 'apache-arrow/Arrow';
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

export function getBasemapAttributesId(basemap: BasemapMetadata): string {
  return basemap.file.replace(/\.(parquet|geojson)$/i, '');
}

async function ensureBasemapAttributesLoaded(
  Duck: DuckDBClientForJoin
): Promise<void> {
  const tableCheck = (await Duck.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name = 'basemap_attributes'`,
    { format: 'array' }
  )) as Array<{ table_name: string }>;

  if (!tableCheck || tableCheck.length === 0) {
    const { basemapService } =
      await import('$lib/features/map/services/basemap.service.svelte');
    await basemapService.initialize();

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

async function checkJoinResultsExist(
  tableName: string,
  Duck: DuckDBClientForJoin
): Promise<boolean> {
  const joinResultsTable = `${tableName}_join_results`;
  const escapedTableName = escapeSqlString(joinResultsTable);
  const check = (await Duck.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name = '${escapedTableName}'`,
    { format: 'array' }
  )) as Array<{ table_name: string }>;
  return check && check.length > 0;
}

async function generateAttributesForBasemap(
  basemapId: string,
  Duck: DuckDBClientForJoin
): Promise<boolean> {
  try {
    const { basemapService } =
      await import('$lib/features/map/services/basemap.service.svelte');
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
  Duck: DuckDBClientForJoin
): Promise<JoinQuality> {
  await ensureBasemapAttributesLoaded(Duck);

  const basemapId = getBasemapAttributesId(basemap);

  const joinTableView = `basemap_join_${basemapId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const escapedBasemapId = escapeSqlString(basemapId);
  await Duck.query(`
    CREATE OR REPLACE VIEW "${joinTableView}" AS
    SELECT raw, id, variant, normalized, basemap, basemap_count
    FROM basemap_attributes
    WHERE basemap = '${escapedBasemapId}'
  `);

  const attributeCount = (await Duck.query(
    `SELECT COUNT(*) as cnt FROM "${joinTableView}"`,
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

    await Duck.query(`
      CREATE OR REPLACE VIEW "${joinTableView}" AS
      SELECT raw, id, variant, normalized, basemap, basemap_count
      FROM basemap_attributes
      WHERE basemap = '${escapedBasemapId}'
    `);

    const recheck = (await Duck.query(
      `SELECT COUNT(*) as cnt FROM "${joinTableView}"`,
      { format: 'array' }
    )) as Array<{ cnt: number }>;

    if (!recheck?.[0]?.cnt || recheck[0].cnt === 0) {
      throw new Error(
        `No attributes found for basemap '${basemapId}' even after generation from geometry.`
      );
    }
  }

  const escapedGeoCol = escapeIdentifier(geoColumn);
  const escapedTable = escapeIdentifier(dataset.tableName);

  const result = (await Duck.query(
    `
    WITH source_with_counts AS (
      SELECT
        "${escapedGeoCol}" as original_name,
        COUNT(*) OVER (PARTITION BY normalize_text_join(CAST("${escapedGeoCol}" AS VARCHAR))) as source_dup_count
      FROM "${escapedTable}"
      WHERE "${escapedGeoCol}" IS NOT NULL
    ),
    candidates AS (
      SELECT DISTINCT original_name, source_dup_count FROM source_with_counts
    ),
    matches AS (
      FROM candidates, LATERAL (SELECT * FROM get_similarity(original_name, '${joinTableView}'))
    ),
    best_matches AS (
      SELECT
        original_name,
        list(DISTINCT {id: id, name: raw, score: score, type: typo_match}) as candidates,
        max(score) as best_score,
        count(*) as match_count,
        count(DISTINCT id) as distinct_id_count,
        count(DISTINCT CASE WHEN typo_match = 'exact' THEN id END) as distinct_exact_id_count
      FROM matches
      GROUP BY original_name
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
    FROM candidates c
    LEFT JOIN best_matches bm ON c.original_name = bm.original_name
    `,
    { format: 'array' }
  )) as Array<{
    original_name: string;
    source_dup_count: number;
    status: 'matched' | 'check' | 'ambiguous' | 'not_found' | 'duplicate';
    candidates: { id: string; name: string; score: number; type: string }[];
    best_score: number;
  }>;

  const entities = result.map((r) => ({
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
      r.status === 'matched' && r.candidates?.length > 0
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

  await Duck.query(`
    UPDATE "${dataset.tableName}"
    SET "${geoColumn}" = c.corrected
    FROM "${correctionsTable}" c
    WHERE "${geoColumn}" = c.original
  `);

  await Duck.query(`DROP TABLE "${correctionsTable}"`);
}

export interface FinalizeJoinOptions {
  skipJoinComputation?: boolean;
}

export async function finalizeJoin(
  dataset: DuckDBDataset,
  basemap: BasemapMetadata,
  geoColumn: string,
  Duck: DuckDBClientForJoin,
  options?: FinalizeJoinOptions
): Promise<FinalizeJoinResult> {
  const start = performance.now();
  logger.info('Finalizing join for dataset', LogCategory.DATA, {
    datasetId: dataset.id,
    basemap: basemap.file,
    geoColumn,
    skipJoinComputation: options?.skipJoinComputation
  });

  if (isOSMBasemap(basemap)) {
    return finalizeOSMJoin(dataset, basemap);
  }

  if (geoColumn) {
    const columnExists = dataset.columns.some((c) => c.name === geoColumn);
    if (!columnExists) {
      throw new Error(
        `Column '${geoColumn}' not found in dataset. Available columns: ${dataset.columns.map((c) => c.name).join(', ')}`
      );
    }
  }

  const joinTableExists = await checkJoinResultsExist(dataset.tableName, Duck);

  const shouldComputeJoin = !options?.skipJoinComputation || !joinTableExists;

  if (shouldComputeJoin) {
    if (options?.skipJoinComputation && !joinTableExists) {
      logger.warn(
        'Join table missing while skipJoinComputation=true, forcing recomputation',
        LogCategory.DATA,
        {
          datasetId: dataset.id,
          tableName: dataset.tableName
        }
      );
    }

    await ensureBasemapAttributesLoaded(Duck);
    await Duck.join_by_id(dataset.tableName, geoColumn, {
      basemaps_table: 'basemap_attributes'
    });
  }

  const basemapId = getBasemapAttributesId(basemap);
  await Duck.apply_join_association(dataset.tableName, basemapId);

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

function finalizeOSMJoin(
  dataset: DuckDBDataset,
  basemap: BasemapMetadata
): FinalizeJoinResult {
  const start = performance.now();
  logger.info('Finalizing OSM join (GPS mode)', LogCategory.DATA, {
    datasetId: dataset.id,
    basemap: basemap.file
  });

  const gpsColumns = detectGPSColumns(dataset.columns);
  if (!gpsColumns) {
    throw new Error(
      'GPS columns (latitude/longitude) not found in dataset for OSM basemap'
    );
  }

  logger.success('OSM join finalized (GPS mode)', LogCategory.DATA, {
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

  const geomColumns = (await Duck.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = '${escapeSqlString(geometryTable)}'
     AND column_name NOT IN ('geom', 'geometry', 'wkb_geometry', 'the_geom')
     AND data_type IN ('VARCHAR', 'TEXT')`,
    { format: 'array' }
  )) as Array<{ column_name: string }>;

  const colList = geomColumns
    .map((c) => `"${escapeIdentifier(c.column_name)}"`)
    .join(', ');

  await Duck.query(`
    CREATE OR REPLACE VIEW "${joinedView}" AS
    WITH geom_unpivot AS (
      UNPIVOT "${escapedGeometry}"
      ON ${colList}
      INTO NAME _attr_col VALUE _attr_val
    )
    SELECT d.*, gu.geom
    FROM "${escapedDataset}" d
    INNER JOIN (
      SELECT DISTINCT _attr_val, geom
      FROM geom_unpivot
    ) gu
    ON CAST(d.basemap_id AS VARCHAR) = CAST(gu._attr_val AS VARCHAR)
    WHERE gu.geom IS NOT NULL
  `);

  const arrowTable = await getArrowTableDirect(joinedView);

  logger.success('Joined Arrow table created', LogCategory.MAP, {
    joinedView,
    rows: arrowTable.numRows,
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

  await Duck.query(`
    CREATE TABLE "${joinedTableName}" AS
    SELECT
      b.*,
      d.* EXCLUDE ("${dataColumnName}")
    FROM "${basemapTableName}" b
    INNER JOIN "${dataTableName}" d
    ON LOWER(TRIM(b."${basemapColumnName}")) = LOWER(TRIM(d."${dataColumnName}"))
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
