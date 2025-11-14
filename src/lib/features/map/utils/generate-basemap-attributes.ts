import { Duck } from '$lib/features/duckdb';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';

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
  try {
    logger.info(
      `Generating attributes for custom basemap: ${basemapId}`,
      LogCategory.MAP
    );

    // Create custom attributes table if it doesn't exist
    await Duck.query(`
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
    const columns = await Duck.analyse(tableName);

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
      logger.warn(
        `No candidate columns found for basemap ${basemapId}. Using first text column as fallback.`,
        LogCategory.MAP
      );

      // Fallback: use first text column
      const textColumn = columns.find((col) => col.type_simple === 'text');
      if (textColumn) {
        candidateColumns.push(textColumn);
      }
    }

    logger.info(
      `Found ${candidateColumns.length} candidate columns: ${candidateColumns.map((c) => c.name).join(', ')}`,
      LogCategory.MAP
    );

    // Get total count for basemap_count field
    const countQuery = await Duck.query(
      `SELECT COUNT(*) as total FROM "${safeTableName}"`
    );
    const totalCount = countQuery[0].total;

    // Filter columns with too many nulls
    const validColumns = candidateColumns.filter((col) => {
      if (col.nulls && col.nulls > col.count * 0.5) {
        logger.warn(
          `Skipping column ${col.name} (${col.nulls} nulls out of ${col.count})`,
          LogCategory.MAP
        );
        return false;
      }
      return true;
    });

    if (validColumns.length === 0) {
      logger.warn(
        `No valid columns found for basemap ${basemapId}`,
        LogCategory.MAP
      );
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
    await Duck.query(`
      INSERT INTO custom_basemap_attributes
      ${unionQueries.join('\nUNION ALL\n')}
    `);

    logger.success(
      `Generated attributes for ${validColumns.length} columns in basemap ${basemapId}`,
      LogCategory.MAP
    );

    // Verify attributes were created
    const verifyQuery = await Duck.query(`
      SELECT COUNT(*) as count
      FROM custom_basemap_attributes
      WHERE basemap = '${safeBasemapId}'
    `);

    logger.success(
      `Generated ${verifyQuery[0].count} attribute entries for basemap ${basemapId}`,
      LogCategory.MAP
    );
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
  try {
    if (basemapId) {
      const safeBasemapId = escapeLiteral(basemapId);
      await Duck.query(`
        DELETE FROM custom_basemap_attributes
        WHERE basemap = '${safeBasemapId}'
      `);
      logger.info(
        `Cleared attributes for basemap ${basemapId}`,
        LogCategory.MAP
      );
    } else {
      await Duck.query(`DROP TABLE IF EXISTS custom_basemap_attributes`);
      logger.info('Cleared all custom basemap attributes', LogCategory.MAP);
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
export async function getBasemapAttributes(basemapId: string): Promise<any[]> {
  try {
    const safeBasemapId = escapeLiteral(basemapId);
    return await Duck.query(`
      SELECT *
      FROM custom_basemap_attributes
      WHERE basemap = '${safeBasemapId}'
    `);
  } catch (error) {
    logger.error(
      `Failed to get attributes for basemap ${basemapId}`,
      LogCategory.MAP,
      error
    );
    return [];
  }
}
