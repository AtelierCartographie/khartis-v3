import type { IParser } from '../../contracts/parser';
import { ParserError } from '../../contracts/parser';
import type { RawDataset } from '../../models/raw-dataset';
import { logger, LogCategory } from '$lib/features/commons/utils/logger';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';

/**
 * KML Parser - Uses DuckDB's native ST_Read for KML/KMZ parsing
 *
 * Parses Keyhole Markup Language (KML) and compressed KMZ files
 * directly using DuckDB's spatial extension, which is much more
 * efficient than converting through GeoJSON intermediates.
 *
 * Supports:
 * - KML files (.kml)
 * - KMZ files (.kmz - compressed KML)
 * - Placemarks with extended data
 * - Multi-geometry features
 * - Styles and descriptions (preserved as attributes)
 */
export class KMLParser implements IParser {
  readonly supportedExtensions = ['.kml', '.kmz'];

  readonly mimeTypes = [
    'application/vnd.google-earth.kml+xml',
    'application/vnd.google-earth.kmz',
    'application/xml',
    'text/xml'
  ];

  canParse(file: File): boolean {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    const hasValidExtension = this.supportedExtensions.includes(ext);
    const hasValidMime = this.mimeTypes.some((mime) =>
      file.type.includes(mime)
    );

    return (
      hasValidExtension || (hasValidMime && file.type !== 'application/xml')
    );
  }

  async parse(file: File): Promise<RawDataset> {
    const start = performance.now();
    let tableName: string | undefined;

    try {
      logger.info('Parsing KML/KMZ with DuckDB ST_Read', LogCategory.DATA, {
        fileName: file.name,
        fileType: file.type,
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
      tableName = `kml_${baseTableName}_${Date.now()}`;

      // Use DuckDB's native KML reading capability
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

      logger.success('KML parsed successfully with DuckDB', LogCategory.DATA, {
        fileName: file.name,
        rows: rowCount,
        columns: headers.length,
        geometryType,
        tableName,
        durationMs: (performance.now() - start).toFixed(2)
      });

      return {
        headers,
        rows,
        columns,
        metadata: {
          rowCount: Number(rowCount),
          columnCount: headers.length,
          fileType: 'kml',
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

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Check for specific KML errors
      if (
        errorMessage.includes('not well-formed') ||
        errorMessage.includes('XML')
      ) {
        throw new ParserError(
          'Invalid KML file: The file appears to be corrupted or not well-formed XML. Please verify the file is a valid KML/KMZ document.',
          error,
          'kml'
        );
      }

      logger.error('Failed to parse KML with DuckDB', LogCategory.DATA, error);
      throw new ParserError(
        `Failed to parse KML: ${errorMessage}`,
        error,
        'kml'
      );
    }
  }
}
