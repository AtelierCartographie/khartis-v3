import { DuckDBError } from '$lib/features/commons/errors/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import type { IParser } from '../../contracts/parser';
import { ParserError } from '../../contracts/parser';
import type { RawDataset } from '../../models/raw-dataset';

// Re-export for backwards compatibility (used by shapefile conversion path)
export { convertGeoJSONToRawDataset } from '../../utils/geojson-converter';
export type {
  GeoJSONFeature,
  GeoJSONFeatureCollection
} from '../../utils/geojson-converter';

/**
 * Parses GeoJSON files using DuckDB's native ST_Read() for fast WASM ingestion.
 * DuckDB handles geometry parsing, type inference, and spatial operations.
 */
export class GeoJSONParser implements IParser {
  readonly supportedExtensions = ['.geojson', '.json'];

  readonly mimeTypes = ['application/geo+json', 'application/json'];

  canParse(file: File): boolean {
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    return this.supportedExtensions.includes(ext);
  }

  async parse(file: File): Promise<RawDataset> {
    const start = performance.now();
    logger.info('Parsing GeoJSON with DuckDB', LogCategory.DATA, {
      fileName: file.name,
      fileSize: file.size
    });

    let tableName: string | undefined;

    try {
      await initDuckDB();
      if (!Duck) {
        throw new DuckDBError('DuckDB not initialized');
      }

      // Generate unique table name
      const baseTableName = file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_]/g, '_');
      tableName = `geojson_${baseTableName}_${Date.now()}`;

      // Single call to DuckDB - it handles everything via ST_Read()
      await Duck.read_geofile(file, { tablename: tableName });

      // Get metadata using Duck's cached methods
      const tableInfo = await Duck.describe_table(tableName);
      const rowCount = await Duck.get_row_count(tableName);
      const headers = tableInfo.name;

      logger.success('GeoJSON parsed successfully', LogCategory.DATA, {
        fileName: file.name,
        tableName,
        rows: rowCount,
        columns: headers.length,
        durationMs: (performance.now() - start).toFixed(2)
      });

      return {
        headers,
        rows: [], // No sample needed - query DuckDB table directly
        columns: headers.map((name) => ({ name, values: [] })),
        metadata: {
          rowCount,
          columnCount: headers.length,
          fileType: 'geojson',
          parsedWithWorker: false,
          duckdbTableName: tableName
        }
      };
    } catch (error) {
      // Cleanup on error
      if (tableName && Duck) {
        try {
          await Duck.query(`DROP TABLE IF EXISTS "${tableName}"`);
        } catch (cleanupError) {
          logger.warn('Failed to cleanup table', LogCategory.DATA, {
            tableName,
            error: cleanupError
          });
        }
      }

      if (error instanceof ParserError) {
        throw error;
      }

      logger.error('GeoJSON parsing failed', LogCategory.DATA, {
        fileName: file.name,
        error
      });

      throw new ParserError(
        `Failed to parse GeoJSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
        'geojson'
      );
    }
  }
}
