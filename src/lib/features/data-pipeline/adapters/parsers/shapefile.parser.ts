import type { IParser } from '../../contracts/parser';
import { ParserError } from '../../contracts/parser';
import type { RawDataset } from '../../models/raw-dataset';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';

/**
 * Shapefile Parser - Uses DuckDB's native ST_Read for shapefile parsing
 *
 * Accepts zipped shapefiles (recommended) and transforms them directly
 * into DuckDB tables using the spatial extension's ST_Read function.
 * This is significantly faster and more memory-efficient than the
 * previous shpjs-based approach.
 *
 * Supports:
 * - Zipped shapefiles (.zip with .shp, .shx, .dbf, .prj)
 * - Individual .shp files (with companion files)
 * - Direct spatial analysis without intermediate GeoJSON conversion
 */
export class ShapefileParser implements IParser {
  readonly supportedExtensions = ['.shp', '.zip'];

  readonly mimeTypes = ['application/x-shapefile', 'application/zip'];

  canParse(file: File): boolean {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    return this.supportedExtensions.includes(ext);
  }

  async parse(file: File): Promise<RawDataset> {
    const start = performance.now();
    let tableName: string | undefined;

    try {
      logger.info('Parsing shapefile with DuckDB ST_Read', LogCategory.DATA, {
        fileName: file.name,
        fileSize: file.size
      });

      // Ensure DuckDB is initialized with spatial extension
      await initDuckDB();
      if (!Duck) {
        throw new DuckDBError('DuckDB not initialized');
      }

      // Generate unique table name
      const baseTableName = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_]/g, '_');
      tableName = `shp_${baseTableName}_${Date.now()}`;

      // Use DuckDB's native shapefile reading capability
      await Duck.read_geofile(file, {
        tablename: tableName,
        meta: false
      });

      // Get table structure
      const columnsInfo = (await Duck.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position
      `)) as Array<{ column_name: string; data_type: string }>;

      // Get row count
      const [{ count: rowCount }] = (await Duck.query(`
        SELECT COUNT(*) as count FROM ${tableName}
      `)) as Array<{ count: number }>;

      // Extract headers (excluding geometry column for RawDataset compatibility)
      const headers = columnsInfo
        .filter((col) => col.data_type !== 'GEOMETRY')
        .map((col) => col.column_name);

      // Get geometry column info
      const geometryColumn = columnsInfo.find(
        (col) => col.data_type === 'GEOMETRY'
      );

      // For RawDataset compatibility, fetch a sample of data
      // We'll limit to 1000 rows for type inference compatibility
      const sampleSize = Math.min(1000, Number(rowCount));
      const sampleData = (await Duck.query(`
        SELECT * FROM ${tableName} LIMIT ${sampleSize}
      `)) as Array<Record<string, unknown>>;

      // Convert to rows format (excluding geometry for tabular view)
      const rows: unknown[][] = sampleData.map((row) =>
        headers.map((header) => row[header] ?? null)
      );

      // Build columns structure for compatibility
      const columns = headers.map((name) => ({
        name,
        values: sampleData.map((row) => row[name] ?? null)
      }));

      // Get geometry type and bounds if geometry exists
      let geometryType: string | undefined;
      let bounds: [number, number, number, number] | undefined;

      if (geometryColumn) {
        // Get geometry type and bounds in a single query
        const [geomInfo] = (await Duck.query(`
          WITH bbox AS (
            SELECT ST_Extent(${geometryColumn.column_name}) AS extent
            FROM ${tableName}
          ),
          first_geom AS (
            SELECT ${geometryColumn.column_name} AS geom
            FROM ${tableName}
            WHERE ${geometryColumn.column_name} IS NOT NULL
            LIMIT 1
          )
          SELECT
            ST_GeometryType((SELECT geom FROM first_geom)) AS geom_type,
            ST_XMin(extent) AS minX,
            ST_YMin(extent) AS minY,
            ST_XMax(extent) AS maxX,
            ST_YMax(extent) AS maxY
          FROM bbox
        `)) as Array<{
          geom_type: string;
          minX: number | null;
          minY: number | null;
          maxX: number | null;
          maxY: number | null;
        }>;

        if (geomInfo) {
          geometryType = geomInfo.geom_type;
          if (
            geomInfo.minX !== null &&
            geomInfo.minY !== null &&
            geomInfo.maxX !== null &&
            geomInfo.maxY !== null
          ) {
            bounds = [
              geomInfo.minX,
              geomInfo.minY,
              geomInfo.maxX,
              geomInfo.maxY
            ];
          }
        }
      }

      logger.success(
        'Shapefile parsed successfully with DuckDB',
        LogCategory.DATA,
        {
          fileName: file.name,
          rows: rowCount,
          columns: headers.length,
          geometryType,
          tableName,
          durationMs: (performance.now() - start).toFixed(2)
        }
      );

      return {
        headers,
        rows,
        columns,
        metadata: {
          rowCount: Number(rowCount),
          columnCount: headers.length,
          fileType: 'shapefile',
          duckdbTableName: tableName,
          geometryType,
          bounds,
          hasGeometry: !!geometryColumn
        }
      };
    } catch (error) {
      // Clean up table if created
      if (tableName && Duck) {
        try {
          await Duck.query(`DROP TABLE IF EXISTS ${tableName}`);
        } catch (cleanupError) {
          logger.warn(
            'Failed to clean up table after error',
            LogCategory.DATA,
            {
              tableName,
              error: cleanupError
            }
          );
        }
      }

      if (error instanceof ParserError) {
        throw error;
      }

      // Check for specific shapefile errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (errorMessage.includes('companion files')) {
        throw new ParserError(
          'Shapefile requires companion files (.shx, .dbf). Please upload a zipped shapefile with all required files.',
          error,
          'shapefile'
        );
      }

      logger.error(
        'Failed to parse shapefile with DuckDB',
        LogCategory.DATA,
        error
      );
      throw new ParserError(
        `Failed to parse shapefile: ${errorMessage}`,
        error,
        'shapefile'
      );
    }
  }
}
