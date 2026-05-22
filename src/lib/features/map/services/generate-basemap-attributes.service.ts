import {
  escapeIdentifier,
  escapeSqlString
} from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from '$lib/features/duckdb';
import { getCustomBasemapJoinCandidateColumns } from './custom-basemap-columns.service';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { DuckDBError } from '$lib/features/commons/pipeline.errors';

export async function generateCustomBasemapAttributes(
  tableName: string,
  basemapId: string
): Promise<void> {
  const duck = Duck;
  if (!duck) {
    throw new DuckDBError('DuckDB not initialized');
  }

  await duck.query(`
      CREATE TABLE IF NOT EXISTS custom_basemap_attributes (
        raw VARCHAR,
        id VARCHAR,
        variant VARCHAR,
        normalized VARCHAR,
        basemap VARCHAR,
        basemap_count INTEGER
      )
    `);

  const safeTableName = escapeIdentifier(tableName);
  const safeBasemapId = escapeSqlString(basemapId);
  const safeFeatureId = escapeIdentifier(INTERNAL_COLUMN.FEATURE_ID);

  const columns = await duck.analyse(tableName);

  const candidateColumns = getCustomBasemapJoinCandidateColumns(columns);

  const countQuery = (await duck.query(
    `SELECT COUNT(*) as total FROM "${safeTableName}"`,
    { format: 'array', useProxy: false }
  )) as Array<{ total: number }>;
  const totalCount = Number(countQuery?.[0]?.total ?? 0);

  const validColumns = candidateColumns.filter((col) => {
    const nullCount = Number(col.nulls ?? 0);
    const recordCount = Number(col.count ?? 0);
    if (recordCount > 0 && nullCount > recordCount * 0.5) {
      return false;
    }
    return true;
  });

  if (validColumns.length === 0) {
    return;
  }

  const unionQueries = validColumns.map((col) => {
    const safeColName = escapeIdentifier(col.name);
    const safeVariantName = escapeSqlString(col.name);

    return `
        SELECT DISTINCT
          "${safeColName}" as raw,
          CAST("${safeFeatureId}" AS VARCHAR) as id,
          '${safeVariantName}' as variant,
          regexp_replace(
            regexp_replace(
              lower(strip_accents(trim("${safeColName}"))),
              '[^a-z0-9]',
              ''
            ),
            '\\s+',
            ''
          ) as normalized,
          '${safeBasemapId}' as basemap,
          ${totalCount} as basemap_count
        FROM "${safeTableName}"
        WHERE "${safeColName}" IS NOT NULL
      `;
  });

  await duck.query(`
      INSERT INTO custom_basemap_attributes
      ${unionQueries.join('\nUNION ALL\n')}
    `);
}
