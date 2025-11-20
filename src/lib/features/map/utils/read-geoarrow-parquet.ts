import { tableFromIPC, type Table as ArrowTable } from 'apache-arrow/Arrow';
import initParquetWasm, {
  readParquet as wasmReadParquet
} from 'parquet-wasm/esm/parquet_wasm.js';
import parquetWasmUrl from 'parquet-wasm/esm/parquet_wasm_bg.wasm?url';

let parquetInitialized = false;

async function ensureWasmInitialized(): Promise<void> {
  if (!parquetInitialized) {
    await initParquetWasm({ module_or_path: parquetWasmUrl });
    parquetInitialized = true;
  }
}

export async function readGeoArrowParquet(
  arrayBuffer: ArrayBuffer
): Promise<ArrowTable> {
  await ensureWasmInitialized();

  const wasmTable = wasmReadParquet(new Uint8Array(arrayBuffer));
  const arrowIPC = wasmTable.intoIPCStream();
  const jsTable = tableFromIPC(arrowIPC);

  return jsTable;
}
