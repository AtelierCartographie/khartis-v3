import {
  DataValidationError,
  DuckDBError
} from '$lib/features/commons/errors/pipeline.errors';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { getTableMetadata, markTableMutated } from '../cache/cache-manager';
import { DUCK_CONST } from '../constants';
import { executeQuery } from '../core/query';
import type { AnalysisResults, DuckDBContext, JoinByIdOptions } from '../types';

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
      'Either basemaps_table or basemap_table must be provided in options.',
      undefined,
      { options }
    );
  }
  if (basemap_table && !basemap_id) {
    throw new DataValidationError(
      'basemap_id must be provided when using basemap_table.',
      'basemap_id',
      { basemap_table }
    );
  }

  const escapedTable = escapeSqlString(table);
  const escapedTableId = escapeSqlString(table_id);
  const escapedBasemapsTable = basemaps_table
    ? escapeSqlString(basemaps_table)
    : undefined;
  const escapedBasemapTable = basemap_table
    ? escapeSqlString(basemap_table)
    : undefined;
  const escapedBasemapId = basemap_id ? escapeSqlString(basemap_id) : undefined;
  const escapedBasemapOthersId = basemap_others_id
    ? escapeSqlString(basemap_others_id)
    : undefined;

  const table_name = `${table}_join_results`;
  const escapedTableName = escapeSqlString(table_name);
  let basemap_join_ref_name: string | null = null;
  let join_across_query: string;

  if (basemaps_table) {
    const unified_table = 'unified_basemap_attributes';

    let hasCustomAttributes = false;
    try {
      const customCheck = (await executeQuery(
        ctx.connection,
        `SELECT COUNT(*) as count FROM custom_basemap_attributes`,
        { format: DUCK_CONST.QUERY_FORMAT.ARRAY }
      )) as Array<{ count: number }>;
      const count = customCheck?.[0]?.count ?? 0;
      hasCustomAttributes = count > 0;
    } catch {
      hasCustomAttributes = false;
    }

    if (hasCustomAttributes) {
      await executeQuery(
        ctx.connection,
        `CREATE OR REPLACE TABLE "${unified_table}" AS
        SELECT * FROM "${basemaps_table}"
        UNION ALL
        SELECT * FROM custom_basemap_attributes`,
        { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
      );
      markTableMutated(ctx, unified_table);

      join_across_query = `CREATE OR REPLACE TABLE "${table_name}" AS
      FROM apply_join_across_basemaps('${escapedTable}', '${escapedTableId}', '${unified_table}')`;
    } else {
      join_across_query = `CREATE OR REPLACE TABLE "${table_name}" AS
      FROM apply_join_across_basemaps('${escapedTable}', '${escapedTableId}', '${escapedBasemapsTable}')`;
    }
  } else if (basemap_table) {
    basemap_join_ref_name = `${basemap_table}_join_ref`;
    const escapedBasemapJoinRefName = basemap_join_ref_name.replace(/'/g, "''");
    if (basemap_others_id) {
      await executeQuery(
        ctx.connection,
        `CREATE OR REPLACE TABLE "${basemap_join_ref_name}" AS
          FROM get_join_table_from_basemap('${escapedBasemapTable}', '${escapedBasemapId}', '${escapedBasemapOthersId}');`,
        { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
      );
      markTableMutated(ctx, basemap_join_ref_name);
    } else {
      await executeQuery(
        ctx.connection,
        `CREATE OR REPLACE TABLE "${basemap_join_ref_name}" AS
          FROM get_join_table_from_basemap('${escapedBasemapTable}', '${escapedBasemapId}')`,
        { format: DUCK_CONST.QUERY_FORMAT.ARROW_IPC }
      );
      markTableMutated(ctx, basemap_join_ref_name);
    }

    join_across_query = `CREATE OR REPLACE TABLE "${table_name}" AS
      FROM apply_join_across_basemaps('${escapedTable}', '${escapedTableId}', '${escapedBasemapJoinRefName}')`;
  } else {
    throw new DataValidationError('Invalid options configuration', undefined, {
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

export async function applyJoinAssociation(
  ctx: DuckDBContext,
  table: string,
  basemap: string
): Promise<void> {
  const { join } = getTableMetadata(ctx, table);
  if (!join) {
    throw new DuckDBError(
      'No join association found for the specified table',
      undefined,
      {
        table,
        basemap
      }
    );
  }
  const { id, join_results_name } = join;
  const escapedBasemap = escapeSqlString(basemap);
  await executeQuery(
    ctx.connection,
    `CREATE OR REPLACE TABLE "${table}" AS
      FROM "${table}" as t
      SELECT
        t.*,
        j.id as basemap_id,
        j.typo_match
      LEFT JOIN "${join_results_name}" as j
      ON t."${id}" = j.geoname
      WHERE j.basemap = '${escapedBasemap}'`
  );
  markTableMutated(ctx, table);
}
