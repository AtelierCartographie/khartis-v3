import wasmInit, {
  readGeoParquet as readGeoParquetWasm
} from '@geoarrow/geoparquet-wasm/esm/index.js';
import geoParquetWasmUrl from '@geoarrow/geoparquet-wasm/esm/index_bg.wasm?url';
import { tableFromIPC, type Table as ArrowTable } from 'apache-arrow/Arrow';

let wasmInitialized = false;

async function ensureWasmInitialized(): Promise<void> {
  if (!wasmInitialized) {
    await wasmInit({ module_or_path: geoParquetWasmUrl });
    wasmInitialized = true;
  }
}

export async function readGeoParquet(
  arrayBuffer: ArrayBuffer
): Promise<ArrowTable> {
  await ensureWasmInitialized();
  const data = await readGeoParquetWasm(new Uint8Array(arrayBuffer));
  const table = tableFromIPC(data.intoIPCStream());
  return table;
}

export async function convertGeoParquetToArrow(
  buffer: Uint8Array
): Promise<ArrowTable> {
  return readGeoParquet(buffer.buffer as ArrayBuffer);
}
