import { describe, expect, it, vi } from 'vitest';

type TableLike = {
  numRows: number;
  schema: {
    metadata: Map<string, string>;
  };
};

function table(hasGeoMeta: boolean, geoValue?: string): TableLike {
  const metadata = new Map<string, string>();
  if (hasGeoMeta) {
    metadata.set(
      'geo',
      geoValue ??
        JSON.stringify({
          version: '1.1.0',
          primary_column: 'geom',
          columns: {}
        })
    );
  }

  return {
    numRows: 5,
    schema: { metadata }
  };
}

async function loadReader(options?: {
  wasmInitReject?: boolean;
  readReject?: boolean;
  table?: TableLike;
}) {
  vi.resetModules();

  const wasmInitMock = vi.fn();
  if (options?.wasmInitReject) {
    wasmInitMock.mockRejectedValue(new Error('init failed'));
  } else {
    wasmInitMock.mockResolvedValue(undefined);
  }

  const readGeoParquetWasmMock = vi.fn();
  if (options?.readReject) {
    readGeoParquetWasmMock.mockRejectedValue(new Error('read failed'));
  } else {
    readGeoParquetWasmMock.mockResolvedValue({
      intoIPCStream: () => new Uint8Array([1, 2, 3])
    });
  }

  const tableFromIPCMock = vi
    .fn()
    .mockReturnValue(options?.table ?? table(false));

  vi.doMock('@geoarrow/geoparquet-wasm/esm/index.js', () => ({
    default: wasmInitMock,
    readGeoParquet: readGeoParquetWasmMock
  }));

  vi.doMock('@geoarrow/geoparquet-wasm/esm/index_bg.wasm?url', () => ({
    default: 'mock://geoparquet.wasm'
  }));

  vi.doMock('apache-arrow/Arrow', () => ({
    tableFromIPC: tableFromIPCMock
  }));

  const mod = await import('$lib/features/data-pipeline/io/geoparquet-reader');

  return {
    mod,
    wasmInitMock,
    readGeoParquetWasmMock,
    tableFromIPCMock
  };
}

describe('geoparquet-reader', () => {
  it('initializes wasm once even with concurrent calls', async () => {
    const { mod, wasmInitMock } = await loadReader();

    await Promise.all([
      mod.initializeGeoParquetWasm(),
      mod.initializeGeoParquetWasm(),
      mod.initializeGeoParquetWasm()
    ]);

    expect(wasmInitMock).toHaveBeenCalledTimes(1);

    await mod.initializeGeoParquetWasm();
    expect(wasmInitMock).toHaveBeenCalledTimes(1);
  });

  it('throws when wasm initialization fails', async () => {
    const { mod } = await loadReader({ wasmInitReject: true });

    await expect(mod.initializeGeoParquetWasm()).rejects.toThrow();
  });

  it('reads geoparquet and returns arrow table', async () => {
    const reader = await loadReader({ table: table(false) });

    const result = await reader.mod.readGeoParquet(new Uint8Array([1, 2, 3]));

    expect(reader.wasmInitMock).toHaveBeenCalledTimes(1);
    expect(reader.readGeoParquetWasmMock).toHaveBeenCalledTimes(1);
    expect(reader.tableFromIPCMock).toHaveBeenCalledTimes(1);
    expect(result.numRows).toBe(5);
  });

  it('handles table with geo metadata and exposes metadata helpers', async () => {
    const t = table(true);
    const { mod } = await loadReader({ table: t });

    expect(mod.tableHasGeoArrowMetadata(t as never)).toBe(true);
    expect(mod.extractGeoArrowMetadata(t as never)).toEqual({
      version: '1.1.0',
      primary_column: 'geom',
      columns: {}
    });
  });

  it('returns null for missing/invalid geo metadata', async () => {
    const { mod } = await loadReader();

    expect(mod.extractGeoArrowMetadata(table(false) as never)).toBeNull();

    const invalidJson = table(true, '{bad-json');
    expect(mod.extractGeoArrowMetadata(invalidJson as never)).toBeNull();

    const invalidShape = table(
      true,
      JSON.stringify({ version: 1, primary_column: 2, columns: null })
    );
    expect(mod.extractGeoArrowMetadata(invalidShape as never)).toBeNull();
  });

  it('wraps geoparquet read failures', async () => {
    const { mod } = await loadReader({ readReject: true });

    await expect(mod.readGeoParquet(new ArrayBuffer(4))).rejects.toThrow();
  });

  it('exposes reader facade', async () => {
    const { mod } = await loadReader();

    expect(mod.geoParquetReader.initialize).toBe(mod.initializeGeoParquetWasm);
    expect(mod.geoParquetReader.readGeoParquet).toBe(mod.readGeoParquet);
    expect(mod.geoParquetReader.extractMetadata).toBe(
      mod.extractGeoArrowMetadata
    );
    expect(mod.geoParquetReader.hasMetadata).toBe(mod.tableHasGeoArrowMetadata);
  });
});
