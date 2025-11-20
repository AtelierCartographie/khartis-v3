import type { IParser } from '../../contracts/parser';
import { ParserError } from '../../contracts/parser';
import type { RawDataset } from '../../models/raw-dataset';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';

/**
 * Parses shapefiles (including zipped bundles) through DuckDB's ST_Read.
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

      await initDuckDB();
      if (!Duck) {
        throw new DuckDBError('DuckDB not initialized');
      }

      const baseTableName = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_]/g, '_');
      tableName = `shp_${baseTableName}_${Date.now()}`;

      await Duck.read_geofile(file, {
        tablename: tableName,
        meta: false
      });

      const columnsInfo = (await Duck.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position
      `)) as Array<{ column_name: string; data_type: string }>;

      const [{ count: rowCount }] = (await Duck.query(`
        SELECT COUNT(*) as count FROM ${tableName}
      `)) as Array<{ count: number }>;

      const headers = columnsInfo
        .filter((col) => col.data_type !== 'GEOMETRY')
        .map((col) => col.column_name);

      const geometryColumn = columnsInfo.find(
        (col) => col.data_type === 'GEOMETRY'
      );

      // Limit sample for type inference compatibility.
      const sampleSize = Math.min(1000, Number(rowCount));
      const sampleData = (await Duck.query(`
        SELECT * FROM ${tableName} LIMIT ${sampleSize}
      `)) as Array<Record<string, unknown>>;

      const rows: unknown[][] = sampleData.map((row) =>
        headers.map((header) => row[header] ?? null)
      );

      const columns = headers.map((name) => ({
        name,
        values: sampleData.map((row) => row[name] ?? null)
      }));

      let geometryType: string | undefined;
      let bounds: [number, number, number, number] | undefined;

      if (geometryColumn) {
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
