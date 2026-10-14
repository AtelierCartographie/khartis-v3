import type * as ParquetWasm from 'parquet-wasm';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  FetchTimeoutError,
  fetchWithTimeout
} from '$lib/features/commons/utils/fetch-with-timeout';
import { getParquetWasm } from './read-geoparquet-arrow.service';

/**
 * Catalog geometry files shipped as row groups of a bigger file (communes of a
 * department inside the communes of France, see khartis-basemaps
 * lib/pack-geometry.py). The selected row groups are read with HTTP Range
 * requests and written back to a standalone GeoParquet buffer, so callers get
 * exactly the bytes they would have downloaded for the original file.
 */

// One ParquetFile per parent URL: its footer is read once and shared by every
// basemap and layer packed in it.
const parquetFiles = new Map<string, Promise<ParquetWasm.ParquetFile>>();

// Range support of each parent URL, probed once: null when the server answers
// 206, else the whole file it sent back instead (200). parquet-wasm must not
// range-read a server that ignores Range: it panics and never settles.
const rangeProbes = new Map<string, Promise<ArrayBuffer | null>>();

function probeRangeSupport(
  url: string,
  timeoutMs: number
): Promise<ArrayBuffer | null> {
  let probe = rangeProbes.get(url);
  if (!probe) {
    probe = fetchWithTimeout(
      new Request(url, { headers: { Range: 'bytes=-8' } }),
      async (response) => {
        if (response.status === 206) {
          await response.arrayBuffer();
          return null;
        }
        if (!response.ok) {
          throw new Error(`Range probe failed: HTTP ${response.status}`);
        }
        return response.arrayBuffer();
      },
      timeoutMs
    );
    rangeProbes.set(url, probe);
    probe.catch(() => rangeProbes.delete(url));
  }
  return probe;
}

function readRowGroupsFromBuffer(
  parquetWasm: typeof ParquetWasm,
  buffer: ArrayBuffer,
  rowGroups: number[]
): ArrayBuffer {
  // readParquet keeps the "geo" metadata in the Arrow schema, and writeParquet
  // writes it back.
  const table = parquetWasm.readParquet(new Uint8Array(buffer), { rowGroups });
  return toArrayBuffer(parquetWasm.writeParquet(table));
}

function openParquetFile(
  parquetWasm: typeof ParquetWasm,
  url: string
): Promise<ParquetWasm.ParquetFile> {
  let file = parquetFiles.get(url);
  if (!file) {
    file = parquetWasm.ParquetFile.fromUrl(url);
    parquetFiles.set(url, file);
    file.catch(() => parquetFiles.delete(url));
  }
  return file;
}

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new FetchTimeoutError(timeoutMs)),
      timeoutMs
    );
  });
  return Promise.race([operation, timeout]).finally(() =>
    clearTimeout(timeoutId)
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

/**
 * Reads `rowGroups` of the parquet file at `url` and returns them as a
 * standalone GeoParquet buffer. Falls back to downloading the whole file
 * (`fetchWholeFile`) when the range read fails, e.g. a server without Range
 * support.
 */
export async function readParquetRowGroups(
  url: string,
  rowGroups: number[],
  fetchWholeFile: () => Promise<ArrayBuffer>,
  timeoutMs: number
): Promise<ArrayBuffer> {
  const parquetWasm = await getParquetWasm();

  let wholeFile: ArrayBuffer | null;
  try {
    wholeFile = await probeRangeSupport(url, timeoutMs);
  } catch (error) {
    if (error instanceof FetchTimeoutError) {
      throw error;
    }
    // 404 and friends: let the regular download report it
    return readRowGroupsFromBuffer(
      parquetWasm,
      await fetchWholeFile(),
      rowGroups
    );
  }
  if (wholeFile) {
    return readRowGroupsFromBuffer(parquetWasm, wholeFile, rowGroups);
  }

  try {
    return await withTimeout(
      (async () => {
        const file = await openParquetFile(parquetWasm, url);
        // ParquetFile.read() drops the file key-value metadata: put the
        // GeoParquet "geo" entry back so the buffer reads like the original.
        const geo = file
          .metadata()
          .fileMetadata()
          .keyValueMetadata()
          .get('geo') as string | undefined;
        const table = await file.read({ rowGroups });
        const properties = geo
          ? new parquetWasm.WriterPropertiesBuilder()
              .setKeyValueMetadata(new Map([['geo', geo]]))
              .build()
          : undefined;
        return toArrayBuffer(parquetWasm.writeParquet(table, properties));
      })(),
      timeoutMs
    );
  } catch (error) {
    parquetFiles.delete(url);
    if (error instanceof FetchTimeoutError) {
      throw error;
    }
    logger.warn(
      'Range read of packed basemap geometry failed, downloading the whole file',
      LogCategory.MAP,
      { error, flow: 'basemap_geometry_pack', extra: { url, rowGroups } }
    );
  }

  return readRowGroupsFromBuffer(
    parquetWasm,
    await fetchWholeFile(),
    rowGroups
  );
}

export function clearParquetFileCache(): void {
  parquetFiles.clear();
  rangeProbes.clear();
}
