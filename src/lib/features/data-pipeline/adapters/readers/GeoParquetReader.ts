import wasmInit, {
  readGeoParquet as readGeoParquetWasm
} from '@geoarrow/geoparquet-wasm/esm/index.js';
import geoParquetWasmUrl from '@geoarrow/geoparquet-wasm/esm/index_bg.wasm?url';
import { tableFromIPC, type Table as ArrowTable } from 'apache-arrow/Arrow';
import { LogCategory, logger } from '../../../commons/utils/logger';
import type { IGeoArrowReader } from '../../contracts/geo-arrow-reader';
import type { GeoArrowMetadata } from '../../models/geo-arrow-metadata';
import { isGeoArrowMetadata } from '../../models/geo-arrow-metadata';

/**
 * GeoParquet reader ported from khartis-pipeline-old to preserve GeoArrow metadata.
 * @geoarrow/deck.gl-layers requires the Apache Arrow Vector instances returned by
 * `tableFromIPC`. Flechette returns Column objects instead and strips metadata,
 * which breaks Deck.gl rendering. This reader keeps the original metadata flow.
 */
export class GeoParquetReader implements IGeoArrowReader {
  private static readonly LOCAL_WASM_URL = geoParquetWasmUrl;

  private static wasmInitialized = false;

  private static initializationPromise: Promise<void> | null = null;

  /**
   * Initialize WASM module
   * Called automatically on first use, but can be called explicitly
   * for better control over initialization timing
   */
  static async initialize(): Promise<void> {
    if (this.wasmInitialized) {
      return;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    const wasmUrl = this.LOCAL_WASM_URL;

    const start = performance.now();
    logger.info('Initializing GeoParquet WASM reader', LogCategory.DATA);

    this.initializationPromise = (async () => {
      try {
        await wasmInit({ module_or_path: wasmUrl });
        this.wasmInitialized = true;
        logger.success('GeoParquet WASM ready', LogCategory.DATA, {
          durationMs: (performance.now() - start).toFixed(2)
        });
      } catch (error) {
        logger.error(
          'Failed to initialize GeoParquet WASM',
          LogCategory.DATA,
          error
        );
        throw new Error('GeoParquet WASM initialization failed');
      } finally {
        this.initializationPromise = null;
      }
    })();

    await this.initializationPromise;
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
      const start = performance.now();
      const uint8Buffer =
        buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);


      const data = await readGeoParquetWasm(uint8Buffer);
      const table = tableFromIPC(data.intoIPCStream());
      const hasMetadata = this.hasMetadata(table);


      if (!hasMetadata) {
        logger.warn('GeoParquet table missing GeoArrow metadata', LogCategory.DATA);
      } else {
        logger.debug('GeoParquet metadata detected', LogCategory.DATA);
      }

      logger.success('GeoParquet file read', LogCategory.DATA, {
        rows: table.numRows,
        durationMs: (performance.now() - start).toFixed(2)
      });
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
        return null;
      }


      return parsed;
    } catch (error) {
      logger.error(
        'Failed to parse GeoArrow metadata',
        LogCategory.DATA,
        error
      );
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
