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
 * GeoParquet reader that preserves GeoArrow metadata required by deck.gl layers.
 */
export class GeoParquetReader implements IGeoArrowReader {
  private static readonly LOCAL_WASM_URL = geoParquetWasmUrl;

  private static wasmInitialized = false;

  private static initializationPromise: Promise<void> | null = null;

  /** Initialize WASM module (idempotent). */
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
   * Reads GeoParquet while keeping the GeoArrow metadata that DuckDB queries drop.
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
        logger.warn(
          'GeoParquet table missing GeoArrow metadata',
          LogCategory.DATA
        );
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

  /** Extract GeoArrow metadata from the Arrow table if present. */
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

  /** Check whether the Arrow table carries GeoArrow metadata. */
  hasMetadata(table: ArrowTable): boolean {
    return !!(table.schema.metadata && table.schema.metadata.has('geo'));
  }
}

/** Convenience singleton instance. */
export const geoParquetReader = new GeoParquetReader();
