import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import * as m from '$lib/paraglide/messages';
import wasmInit, {
  readGeoParquet as readGeoParquetWasm
} from '@geoarrow/geoparquet-wasm/esm/index.js';
import geoParquetWasmUrl from '@geoarrow/geoparquet-wasm/esm/index_bg.wasm?url';
import { tableFromIPC, type Table as ArrowTable } from 'apache-arrow/Arrow';
import type { GeoArrowMetadata } from '../types';
import { isGeoArrowMetadata } from '../types';

let wasmInitialized = false;
let initializationPromise: Promise<void> | null = null;

export async function initializeGeoParquetWasm(): Promise<void> {
  if (wasmInitialized) return;

  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  const start = performance.now();
  logger.info('Initializing GeoParquet WASM reader', LogCategory.DATA);

  initializationPromise = (async () => {
    try {
      await wasmInit({ module_or_path: geoParquetWasmUrl });
      wasmInitialized = true;
      logger.success('GeoParquet WASM ready', LogCategory.DATA, {
        durationMs: (performance.now() - start).toFixed(2)
      });
    } catch (error) {
      logger.error(
        'Failed to initialize GeoParquet WASM',
        LogCategory.DATA,
        error
      );
      throw new Error(m.pipeline_error_geoparquet_init_failed());
    } finally {
      initializationPromise = null;
    }
  })();

  await initializationPromise;
}

export async function readGeoParquet(
  buffer: ArrayBuffer | Uint8Array
): Promise<ArrowTable> {
  await initializeGeoParquetWasm();

  try {
    const start = performance.now();
    const uint8Buffer =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

    const data = await readGeoParquetWasm(uint8Buffer);
    const table = tableFromIPC(data.intoIPCStream());
    const hasMetadata = tableHasGeoArrowMetadata(table);

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
      m.pipeline_error_geoparquet_read_failed({
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    );
  }
}

export function extractGeoArrowMetadata(
  table: ArrowTable
): GeoArrowMetadata | null {
  if (!tableHasGeoArrowMetadata(table)) {
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
    logger.error('Failed to parse GeoArrow metadata', LogCategory.DATA, error);
    return null;
  }
}

export function tableHasGeoArrowMetadata(table: ArrowTable): boolean {
  return !!(table.schema.metadata && table.schema.metadata.has('geo'));
}

export const geoParquetReader = {
  initialize: initializeGeoParquetWasm,
  readGeoParquet,
  extractMetadata: extractGeoArrowMetadata,
  hasMetadata: tableHasGeoArrowMetadata
};
