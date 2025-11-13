import { tableFromIPC, type Table as ArrowTable } from 'apache-arrow/Arrow';

const PARQUET_WASM_URL =
  'https://cdn.jsdelivr.net/npm/parquet-wasm@0.6.1/esm/parquet_wasm.js';

type ParquetWasmExports = {
  default: () => Promise<void>;
  readParquet(buffer: Uint8Array): {
    intoIPCStream(): Uint8Array;
  };
};

let parquetWasm: ParquetWasmExports | null = null;

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

  if (!parquetWasm) {
    throw new Error('Parquet WASM module is not initialized');
  }

  const wasmTable = parquetWasm.readParquet(new Uint8Array(arrayBuffer));
  const arrowIPC = wasmTable.intoIPCStream();
  const jsTable = tableFromIPC(arrowIPC);

  return jsTable;
}
