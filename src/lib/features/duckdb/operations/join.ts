import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/errors/pipeline.errors';
import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import * as m from '$lib/paraglide/messages';
import { getTableMetadata, markTableMutated } from '../cache/cache-manager';
import { DUCK_CONST, TABLE_PATTERNS } from '../constants';
import { executeQuery } from '../core/query';
import type { AnalysisResults, DuckDBContext, JoinByIdOptions } from '../types';

/**
 * Joins a table to one or multiple basemaps based on Jaro-Winkler similarity of an ID column.
 *
 * Provides a unified interface for joining to either multiple basemaps
 * (using `basemaps_table`) or a single basemap (using `basemap_table`, `basemap_id`,
 * and optionally `basemap_others_id`). Uses the `apply_join_across_basemaps` SQL macro
 * and generates a synthesis of join results via `join_synthesis`.
 *
 * @param ctx - The DuckDB context.
 * @param table - The name of the table to join.
 * @param table_id - The name of the ID column in the table.
 * @param options.basemaps_table - The name of the table containing multiple basemaps.
 * @param options.basemap_table - The name of a single basemap table.
 * @param options.basemap_id - The main ID column in the single basemap table.
 * @param options.basemap_others_id - Other ID column names in the single basemap table (optional).
 * @returns A synthesis: basemap, share_basemap, share_candidate.
 */
export async function joinById(
  ctx: DuckDBContext,
  table: string,
  table_id: string,
  options: JoinByIdOptions = {}
): Promise<AnalysisResults> {
  const { basemaps_table, basemap_table, basemap_id, basemap_others_id } =
    options;

  if (!basemaps_table && !basemap_table) {
    throw new DataValidationError(
      m.error_basemaps_table_required(),
      undefined,
      { options }
    );
  }
  if (basemap_table && !basemap_id) {
    throw new DataValidationError(m.error_basemap_id_required(), 'basemap_id', {
      basemap_table
    });
  }

  const escapedBasemapTable = basemap_table
    ? escapeSqlString(basemap_table)
    : undefined;
  const escapedBasemapId = basemap_id ? escapeSqlString(basemap_id) : undefined;
  const escapedBasemapOthersId = basemap_others_id
    ? escapeSqlString(basemap_others_id)
    : undefined;

  const table_name = `${table}${TABLE_PATTERNS.JOIN_RESULTS_SUFFIX}`;
  const escapedTableName = escapeSqlString(table_name);
  const escapedGeoCol = escapeIdentifier(table_id);
  let basemap_join_ref_name: string | null = null;
  let join_across_query: string;

  const buildJoinAcrossSQL = (joinTableName: string): string => {
    const escapedJoinTable = escapeSqlString(joinTableName);
    return `CREATE OR REPLACE TABLE "${escapeIdentifier(table_name)}" AS
      WITH t1 AS (
        SELECT
          "${escapedGeoCol}" as geoname,
          count() over() as candidate_count
        FROM "${escapeIdentifier(table)}"
        WHERE "${escapedGeoCol}" IS NOT NULL
      ), t2 AS (
        FROM t1, LATERAL (SELECT * FROM get_similarity(geoname, '${escapedJoinTable}'))
        SELECT *
        ORDER BY basemap, geoname, score DESC
      )
      FROM t2
      SELECT unnest(max_by(t2, score, 1), recursive := true)
      GROUP BY basemap, id`;
  };

  if (basemaps_table) {
    const unified_table = TABLE_PATTERNS.UNIFIED_BASEMAP_ATTRS;

    const customTableCheck = (await executeQuery(
      ctx.connection,
      `SELECT COUNT(*) as cnt FROM information_schema.tables
       WHERE table_name = '${TABLE_PATTERNS.CUSTOM_BASEMAP_ATTRS}'`,
      { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
    )) as Array<{ cnt: number }>;
    const hasCustomTable = Number(customTableCheck?.[0]?.cnt ?? 0) > 0;

    let hasCustomAttributes = false;
    if (hasCustomTable) {
      const customCheck = (await executeQuery(
        ctx.connection,
        `SELECT COUNT(*) as count FROM ${TABLE_PATTERNS.CUSTOM_BASEMAP_ATTRS}`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      )) as Array<{ count: number }>;
      hasCustomAttributes = Number(customCheck?.[0]?.count ?? 0) > 0;
    }

    if (hasCustomAttributes) {
      await executeQuery(
        ctx.connection,
        `CREATE OR REPLACE TABLE "${escapeIdentifier(unified_table)}" AS
        SELECT * FROM "${escapeIdentifier(basemaps_table!)}"
        UNION ALL
        SELECT * FROM ${TABLE_PATTERNS.CUSTOM_BASEMAP_ATTRS}`,
        { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
      );
      markTableMutated(ctx, unified_table);

      join_across_query = buildJoinAcrossSQL(unified_table);
    } else {
      join_across_query = buildJoinAcrossSQL(basemaps_table);
    }
  } else if (basemap_table) {
    basemap_join_ref_name = `${basemap_table}_join_ref`;
    if (basemap_others_id) {
      await executeQuery(
        ctx.connection,
        `CREATE OR REPLACE TABLE "${escapeIdentifier(basemap_join_ref_name)}" AS
          FROM get_join_table_from_basemap('${escapedBasemapTable}', '${escapedBasemapId}', '${escapedBasemapOthersId}');`,
        { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
      );
      markTableMutated(ctx, basemap_join_ref_name);
    } else {
      await executeQuery(
        ctx.connection,
        `CREATE OR REPLACE TABLE "${escapeIdentifier(basemap_join_ref_name)}" AS
          FROM get_join_table_from_basemap('${escapedBasemapTable}', '${escapedBasemapId}')`,
        { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
      );
      markTableMutated(ctx, basemap_join_ref_name);
    }

    join_across_query = buildJoinAcrossSQL(basemap_join_ref_name);
  } else {
    throw new DataValidationError(m.error_invalid_options_config(), undefined, {
      options
    });
  }

  await executeQuery(ctx.connection, join_across_query, {
    format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC
  });
  markTableMutated(ctx, table_name);

  const synthesis = await executeQuery(
    ctx.connection,
    `FROM join_synthesis('${escapedTableName}')`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
  );

  const table_metadata = getTableMetadata(ctx, table);
  table_metadata.join = {
    id: table_id,
    join_results_name: table_name,
    basemap_join_ref: basemap_join_ref_name
  };

  return synthesis as AnalysisResults;
}

/**
 * Applies a join association to a table based on a previously performed join operation.
 *
 * Retrieves the join association stored during a previous `joinById` call and applies it,
 * adding columns from the join table to the original table: basemap_id and typo_match
 * (exact, partial, etc.). Deduplicates by keeping only the best score per geoname.
 *
 * @param ctx - The DuckDB context.
 * @param table - The name of the table to which the join association will be applied.
 * @param basemap - The name of the basemap to filter the join results by.
 */
export async function applyJoinAssociation(
  ctx: DuckDBContext,
  table: string,
  basemap: string
): Promise<void> {
  const { join } = getTableMetadata(ctx, table);
  if (!join) {
    throw new DuckDBError(m.error_no_join_association(), undefined, {
      table,
      basemap
    });
  }
  const { id, join_results_name } = join;
  const escapedTable = escapeIdentifier(table);
  const escapedId = escapeIdentifier(id);
  const escapedJoinResultsName = escapeIdentifier(join_results_name);
  const escapedBasemap = escapeSqlString(basemap);

  const columnsToExclude = ['basemap_id', 'basemap_label', 'typo_match'];
  const existingColumns = (await executeQuery(
    ctx.connection,
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = '${escapeSqlString(table)}'
     AND column_name IN (${columnsToExclude.map((c) => `'${c}'`).join(', ')})`,
    { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
  )) as Array<{ column_name: string }>;

  const excludeList = existingColumns.map((r) => r.column_name);
  const excludeClause =
    excludeList.length > 0
      ? `EXCLUDE (${excludeList.map((c) => `"${escapeIdentifier(c)}"`).join(', ')})`
      : '';

  await executeQuery(
    ctx.connection,
    `CREATE OR REPLACE TABLE "${escapedTable}" AS
      WITH ranked_join AS (
        SELECT *
        FROM "${escapedJoinResultsName}"
        WHERE basemap = '${escapedBasemap}'
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY geoname
          ORDER BY score DESC, id
        ) = 1
      )
      SELECT
        t.* ${excludeClause},
        j.id as basemap_id,
        j.raw as basemap_label,
        j.typo_match
      FROM "${escapedTable}" as t
      LEFT JOIN ranked_join as j
      ON t."${escapedId}" = j.geoname`
  );
  markTableMutated(ctx, table);
}
