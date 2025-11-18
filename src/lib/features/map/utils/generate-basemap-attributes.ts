import { Duck } from '$lib/features/duckdb';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import type { BasemapAttribute } from '../types/basemap.types';

/**
 * Escape SQL identifier (table/column names) by doubling quotes
 */
function escapeIdentifier(name: string): string {
  return name.replace(/"/g, '""');
}

/**
 * Escape SQL string literal by doubling single quotes
 */
function escapeLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Generate normalized attributes for a custom basemap to enable fuzzy matching
 * Extracts candidate columns (name, id, code) and normalizes them for join operations
 */
export async function generateCustomBasemapAttributes(
  tableName: string,
  basemapId: string
): Promise<void> {
  const duck = Duck;
  if (!duck) {
    throw new DuckDBError('DuckDB not initialized');
  }

  try {

    // Create custom attributes table if it doesn't exist
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

    // Escape table name for safe SQL queries
    const safeTableName = escapeIdentifier(tableName);
    const safeBasemapId = escapeLiteral(basemapId);

    // Analyze columns to find candidates for attribute extraction
    const columns = await duck.analyse(tableName);

    // Filter candidate columns (common geographic identifiers)
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

      // Fallback: use first text column
      const textColumn = columns.find((col) => col.type_simple === 'string');
      if (textColumn) {
        candidateColumns.push(textColumn);
      }
    }


    // Get total count for basemap_count field
    const countQuery = (await duck.query(
      `SELECT COUNT(*) as total FROM "${safeTableName}"`,
      { format: 'array', useProxy: false }
    )) as Array<{ total: number }>;
    const totalCount = Number(countQuery?.[0]?.total ?? 0);

    // Filter columns with too many nulls
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

    // Generate normalized attributes for all columns in a single batched query
    const unionQueries = validColumns.map((col) => {
      const safeColName = escapeIdentifier(col.name);
      const safeVariantName = escapeLiteral(col.name);

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

    // Execute single batched INSERT with UNION ALL
    await duck.query(`
      INSERT INTO custom_basemap_attributes
      ${unionQueries.join('\nUNION ALL\n')}
    `);


    // Verify attributes were created
    const verifyQuery = (await duck.query(
      `
      SELECT COUNT(*) as count
      FROM custom_basemap_attributes
      WHERE basemap = '${safeBasemapId}'
    `,
      { format: 'array', useProxy: false }
    )) as Array<{ count: number }>;

    const generatedCount = Number(verifyQuery?.[0]?.count ?? 0);
  } catch (error) {
    logger.error(
      `Failed to generate attributes for basemap ${basemapId}`,
      LogCategory.MAP,
      error
    );
    throw error;
  }
}

/**
 * Clear custom basemap attributes (useful for cleanup)
 */
export async function clearCustomBasemapAttributes(
  basemapId?: string
): Promise<void> {
  const duck = Duck;
  if (!duck) {
    throw new DuckDBError('DuckDB not initialized');
  }
  try {
    if (basemapId) {
      const safeBasemapId = escapeLiteral(basemapId);
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

/**
 * Get all attributes for a basemap (for debugging)
 */
export async function getBasemapAttributes(
  basemapId: string
): Promise<BasemapAttribute[]> {
  const duck = Duck;
  if (!duck) {
    throw new DuckDBError('DuckDB not initialized');
  }
  try {
    const safeBasemapId = escapeLiteral(basemapId);
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
