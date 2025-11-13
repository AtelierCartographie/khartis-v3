import wasmInit, {
  readGeoParquet as readGeoParquetWasm
} from '@geoarrow/geoparquet-wasm/esm/index.js';
import { tableFromIPC, type Table as ArrowTable } from 'apache-arrow/Arrow';
import type { IGeoArrowReader } from '../../domain/interfaces/IGeoArrowReader';
import type { GeoArrowMetadata } from '../../domain/entities/GeoArrowMetadata';
import { isGeoArrowMetadata } from '../../domain/entities/GeoArrowMetadata';
import { logger, LogCategory } from '../../../commons/utils/logger';

/**
 * GeoParquet Reader with GeoArrow metadata preservation
 *
 * CRITICAL: This is ported from khartis-pipeline-old/src/lib/geoparquet.ts
 * which successfully preserves GeoArrow metadata
 *
 * WHY THIS WORKS:
 * - Uses @geoarrow/geoparquet-wasm (NOT parquet-wasm)
 * - Uses apache-arrow.tableFromIPC (NOT @uwdata/flechette)
 * - Preserves schema.metadata during IPC deserialization
 *
 * WHY DUCKDB QUERY DOESN'T WORK:
 * - Duck.query() uses Flechette internally
 * - Flechette strips schema metadata
 * - Result: ArrowTable without 'geo' key in metadata
 *
 * /!\ CRITICAL COMPATIBILITY NOTE (from pipeline-old):
 * @geoarrow/deckgl-layers a été conçu pour fonctionner spécifiquement
 * avec les classes que renvoie Apache Arrow JS. Notamment une classe Vector
 * pour le résultat de getChild('column_name').
 * Si on utilise Flechette, ça ne marche pas car c'est une classe Column
 * qui est renvoyée par getChild.
 *
 * Translation: @geoarrow/deck.gl-layers is designed to work specifically
 * with Apache Arrow JS classes. Particularly the Vector class returned
 * by getChild('column_name'). If you use Flechette, it doesn't work
 * because it returns a Column class from getChild.
 *
 * ARCHITECTURAL NOTE:
 * This implements IGeoArrowReader interface (SOLID: Interface Segregation)
 * Part of Infrastructure layer (DDD pattern)
 */
export class GeoParquetReader implements IGeoArrowReader {
  private static WASM_URL =
    'https://cdn.jsdelivr.net/npm/@geoarrow/geoparquet-wasm@0.2.0-beta.5/esm/index_bg.wasm';
  private static wasmInitialized = false;

  /**
   * Initialize WASM module
   * Called automatically on first use, but can be called explicitly
   * for better control over initialization timing
   */
  static async initialize(): Promise<void> {
    if (this.wasmInitialized) {
      return;
    }

    try {
      await wasmInit(this.WASM_URL);
      this.wasmInitialized = true;
      logger.success('GeoParquet WASM initialized', LogCategory.DATA);
    } catch (error) {
      logger.error('Failed to initialize GeoParquet WASM', LogCategory.DATA, error);
      throw new Error('GeoParquet WASM initialization failed');
    }
  }

  /**
   * Read GeoParquet file and preserve GeoArrow metadata
   *
   * CRITICAL: This is the ONLY way to get Arrow tables with GeoArrow metadata
   * preserved. DuckDB queries do NOT preserve metadata.
   *
   * IMPORTANT NOTE from pipeline-old:
   * @geoarrow/deck.gl-layers is designed to work specifically with
   * Apache Arrow JS classes (particularly Vector from getChild('column_name')).
   * If you use Flechette, it returns a Column class from getChild which
   * doesn't work with Deck.gl.
   *
   * @param buffer - GeoParquet file buffer
   * @returns Arrow table with metadata in schema.metadata.get('geo')
   */
  async readGeoParquet(buffer: ArrayBuffer | Uint8Array): Promise<ArrowTable> {
    await GeoParquetReader.initialize();

    try {
      // Convert to Uint8Array if needed
      const uint8Buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

      logger.debug('Reading GeoParquet with metadata preservation', LogCategory.DATA, {
        bufferSize: uint8Buffer.byteLength
      });

      // Step 1: Read GeoParquet with WASM - preserves metadata
      const data = await readGeoParquetWasm(uint8Buffer);

      // Step 2: Convert IPC stream to Arrow table - metadata is preserved
      const table = tableFromIPC(data.intoIPCStream());

      // Step 3: Verify metadata exists
      const hasMetadata = this.hasMetadata(table);

      logger.success('GeoParquet read complete', LogCategory.DATA, {
        numRows: table.numRows,
        numColumns: table.schema.fields.length,
        hasMetadata,
        metadataKeys: table.schema.metadata
          ? Array.from(table.schema.metadata.keys())
          : []
      });

      if (!hasMetadata) {
        logger.warn(
          'GeoParquet file read but no GeoArrow metadata found',
          LogCategory.DATA
        );
      }

      return table;
    } catch (error) {
      logger.error('Failed to read GeoParquet', LogCategory.DATA, error);
      throw new Error(
        `GeoParquet read failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Extract and parse GeoArrow metadata from Arrow table
   *
   * @param table - Arrow table with potential metadata
   * @returns Parsed GeoArrow metadata or null if not present
   */
  extractMetadata(table: ArrowTable): GeoArrowMetadata | null {
    if (!this.hasMetadata(table)) {
      return null;
    }

    try {
      const geoMetadataStr = table.schema.metadata.get('geo');
      if (!geoMetadataStr) {
        return null;
      }

      const parsed = JSON.parse(geoMetadataStr);

      if (!isGeoArrowMetadata(parsed)) {
        logger.warn('Invalid GeoArrow metadata structure', LogCategory.DATA, {
          parsed
        });
        return null;
      }

      logger.debug('GeoArrow metadata extracted', LogCategory.DATA, {
        version: parsed.version,
        primaryColumn: parsed.primary_column,
        columns: Object.keys(parsed.columns)
      });

      return parsed;
    } catch (error) {
      logger.error('Failed to parse GeoArrow metadata', LogCategory.DATA, error);
      return null;
    }
  }

  /**
   * Check if Arrow table has valid GeoArrow metadata
   *
   * @param table - Arrow table to check
   * @returns true if table.schema.metadata has 'geo' key
   */
  hasMetadata(table: ArrowTable): boolean {
    return !!(table.schema.metadata && table.schema.metadata.has('geo'));
  }
}

/**
 * Singleton instance for convenience
 * Can use either GeoParquetReader.instance or new GeoParquetReader()
 */
export const geoParquetReader = new GeoParquetReader();
