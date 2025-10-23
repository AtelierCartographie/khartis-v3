import { tableFromIPC, type Table as ArrowTable } from 'apache-arrow/Arrow';

const PARQUET_WASM_URL =
  'https://cdn.jsdelivr.net/npm/parquet-wasm@0.6.1/esm/parquet_wasm.js';

let parquetWasm: any = null;

async function ensureWasmInitialized(): Promise<void> {
  if (!parquetWasm) {
    const module = await import(/* @vite-ignore */ PARQUET_WASM_URL);
    await module.default();
    parquetWasm = module;
  }
}

export async function readGeoArrowParquet(
  arrayBuffer: ArrayBuffer
): Promise<ArrowTable> {
  await ensureWasmInitialized();

  const wasmTable = parquetWasm.readParquet(new Uint8Array(arrayBuffer));
  const arrowIPC = wasmTable.intoIPCStream();
  const jsTable = tableFromIPC(arrowIPC);

  return jsTable;
}
