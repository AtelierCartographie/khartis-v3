import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from '$lib/features/duckdb';
import type { BasemapAttribute } from '../types/basemap.types';

function escapeIdentifier(name: string): string {
  return name.replace(/"/g, '""');
}

export async function generateCustomBasemapAttributes(
  tableName: string,
  basemapId: string
): Promise<void> {
  const duck = Duck;
  if (!duck) {
    throw new DuckDBError('DuckDB not initialized');
  }

  try {
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

    const columns = await duck.analyse(tableName);

    const candidateColumns = columns.filter((col) => {
      const name = col.name.toLowerCase();
      return (
        /^(name|nom|libelle|label)$/i.test(name) ||
        /^(id|code|iso|insee|nuts)$/i.test(name) ||
        /_name$/i.test(name) ||
        /_code$/i.test(name)
      );
    });

    if (candidateColumns.length === 0) {
      const textColumn = columns.find((col) => col.type_simple === 'string');
      if (textColumn) {
        candidateColumns.push(textColumn);
      }
    }

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
          "${safeColName}" as id,
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
  } catch (error) {
    logger.error(
      `Failed to generate attributes for basemap ${basemapId}`,
      LogCategory.MAP,
      error
    );
    throw error;
  }
}

export async function clearCustomBasemapAttributes(
  basemapId?: string
): Promise<void> {
  const duck = Duck;
  if (!duck) {
    throw new DuckDBError('DuckDB not initialized');
  }
  try {
    if (basemapId) {
      const safeBasemapId = escapeSqlString(basemapId);
      await duck.query(`
        DELETE FROM custom_basemap_attributes
        WHERE basemap = '${safeBasemapId}'
      `);
    } else {
      await duck.query(`DROP TABLE IF EXISTS custom_basemap_attributes`);
    }
  } catch (error) {
    logger.error(
      'Failed to clear custom basemap attributes',
      LogCategory.MAP,
      error
    );
  }
}

export async function getBasemapAttributes(
  basemapId: string
): Promise<BasemapAttribute[]> {
  const duck = Duck;
  if (!duck) {
    throw new DuckDBError('DuckDB not initialized');
  }
  try {
    const safeBasemapId = escapeSqlString(basemapId);
    const rows = (await duck.query(
      `
      SELECT *
      FROM custom_basemap_attributes
      WHERE basemap = '${safeBasemapId}'
    `,
      { format: 'array', useProxy: false }
    )) as BasemapAttribute[];
    return rows;
  } catch (error) {
    logger.error(
      `Failed to get attributes for basemap ${basemapId}`,
      LogCategory.MAP,
      error
    );
    return [];
  }
}
