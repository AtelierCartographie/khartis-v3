import wasmInit, {
  readGeoParquet as readGeoParquetWasm
} from '@geoarrow/geoparquet-wasm/esm/index.js';
import { tableFromIPC, type Table as ArrowTable } from 'apache-arrow/Arrow';

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@geoarrow/geoparquet-wasm@0.2.0-beta.5/esm/index_bg.wasm';

let wasmInitialized = false;

async function ensureWasmInitialized(): Promise<void> {
  if (!wasmInitialized) {
    await wasmInit(WASM_URL);
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
