import { Duck } from '$lib/features/duckdb';
import { getCustomBasemapJoinCandidateColumns } from './custom-basemap-columns.service';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import { DuckDBError } from '$lib/features/commons/pipeline.errors';
import {
  sqlIdentifier,
  sqlString
} from '$lib/features/commons/utils/sql.utils';

const MAX_NULL_RATIO = 0.5;

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

  await duck.query(
    `DELETE FROM custom_basemap_attributes WHERE basemap = ${sqlString(basemapId)}`
  );

  const columns = await duck.analyse(tableName);

  const candidateColumns = getCustomBasemapJoinCandidateColumns(columns);

  const countQuery = (await duck.query(
    `SELECT COUNT(*) as total FROM ${sqlIdentifier(tableName)}`,
    { format: 'array', useProxy: false }
  )) as Array<{ total: number }>;
  const totalCount = Number(countQuery?.[0]?.total ?? 0);

  const validColumns = candidateColumns.filter((col) => {
    const nullCount = Number(col.nulls ?? 0);
    const recordCount = Number(col.count ?? 0);
    if (recordCount > 0 && nullCount > recordCount * MAX_NULL_RATIO) {
      return false;
    }
    return true;
  });

  if (validColumns.length === 0) {
    return;
  }

  const unionQueries = validColumns.map((col) => {
    return `
        SELECT DISTINCT
          ${sqlIdentifier(col.name)} as raw,
          CAST(${sqlIdentifier(INTERNAL_COLUMN.FEATURE_ID)} AS VARCHAR) as id,
          ${sqlString(col.name)} as variant,
          regexp_replace(
            regexp_replace(
              lower(strip_accents(trim(${sqlIdentifier(col.name)}))),
              '[^a-z0-9]',
              ''
            ),
            '\\s+',
            ''
          ) as normalized,
          ${sqlString(basemapId)} as basemap,
          ${totalCount} as basemap_count
        FROM ${sqlIdentifier(tableName)}
        WHERE ${sqlIdentifier(col.name)} IS NOT NULL
      `;
  });

  await duck.query(`
      INSERT INTO custom_basemap_attributes
      ${unionQueries.join('\nUNION ALL\n')}
    `);
}
