import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as parquetWasm from 'parquet-wasm';
import { tableFromIPC } from 'apache-arrow';
import type {
  BasemapGeometryPack,
  BasemapMetadata
} from '$lib/features/map/types/basemap.types';

// The browser build of parquet-wasm needs an async init; in node the "node"
// export is ready to use.
vi.mock('$lib/features/map/services/read-geoparquet-arrow.service', () => ({
  getParquetWasm: async () => parquetWasm
}));

const { readParquetRowGroups, clearParquetFileCache } =
  await import('$lib/features/map/services/basemap-geometry-pack.service');

const BASEMAPS_DIR = resolve(process.cwd(), 'static/basemaps');
const GEOMETRY_DIR = resolve(BASEMAPS_DIR, 'geometry');
const catalog = JSON.parse(
  readFileSync(resolve(BASEMAPS_DIR, 'all-basemaps-metadata.json'), 'utf-8')
) as BasemapMetadata[];

interface PackedFile {
  file: string;
  pack: BasemapGeometryPack;
  entityCount?: number;
}

const packedFiles = new Map<string, PackedFile>();
const referencedFiles = new Set<string>();
for (const basemap of catalog) {
  referencedFiles.add(basemap.file);
  if (basemap.pack) {
    packedFiles.set(basemap.file, {
      file: basemap.file,
      pack: basemap.pack,
      entityCount: basemap.entity_count
    });
  }
  for (const layer of basemap.layers ?? []) {
    if (!layer.file) continue;
    referencedFiles.add(layer.file);
    if (layer.pack && !packedFiles.has(layer.file)) {
      packedFiles.set(layer.file, { file: layer.file, pack: layer.pack });
    }
  }
}

const geometryPath = (file: string) => resolve(GEOMETRY_DIR, `${file}.parquet`);
// CI checks out static/basemaps without the geometry parquets.
const hasGeometry = [...packedFiles.values()].every((packed) =>
  existsSync(geometryPath(packed.pack.file))
);

function serveGeometry(acceptRanges: boolean): Promise<Server> {
  const server = createServer((request, response) => {
    const path = resolve(GEOMETRY_DIR, (request.url ?? '').slice(1));
    const size = statSync(path).size;
    const range = request.headers.range;
    if (!acceptRanges || !range) {
      response.writeHead(200, { 'content-length': size });
      createReadStream(path).pipe(response);
      return;
    }
    const [from, to] = range.replace('bytes=', '').split('-');
    const start = from === '' ? size - Number(to) : Number(from);
    const end = from === '' || to === '' ? size - 1 : Number(to);
    response.writeHead(206, {
      'accept-ranges': 'bytes',
      'content-length': end - start + 1,
      'content-range': `bytes ${start}-${end}/${size}`
    });
    createReadStream(path, { start, end }).pipe(response);
  });
  return new Promise((done) =>
    server.listen(0, '127.0.0.1', () => done(server))
  );
}

function readRows(buffer: ArrayBuffer) {
  return tableFromIPC(
    parquetWasm.readParquet(new Uint8Array(buffer)).intoIPCStream()
  );
}

describe('catalog geometry packs', () => {
  it('ships every referenced geometry file, standalone or packed', () => {
    const missing = [...referencedFiles].filter(
      (file) =>
        !packedFiles.has(file) && hasGeometry && !existsSync(geometryPath(file))
    );
    expect(missing).toEqual([]);
    for (const { pack } of packedFiles.values()) {
      expect(packedFiles.has(pack.file)).toBe(false);
    }
  });

  describe.skipIf(!hasGeometry)('reading packed files', () => {
    let server: Server;
    let baseUrl: string;

    beforeAll(async () => {
      server = await serveGeometry(true);
      const address = server.address();
      baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    });

    afterAll(() => {
      clearParquetFileCache();
      server.close();
    });

    const rowGroupFiles = [...packedFiles.values()].filter(
      (packed) => packed.pack.row_groups?.length
    );

    it.each(rowGroupFiles.map((packed) => [packed.file, packed] as const))(
      '%s reads back from its row groups',
      async (_file, packed) => {
        const url = `${baseUrl}/${packed.pack.file}.parquet`;
        const buffer = await readParquetRowGroups(
          url,
          packed.pack.row_groups!,
          () => Promise.reject(new Error('unexpected full download')),
          30_000
        );
        const table = readRows(buffer);
        expect(table.numRows).toBeGreaterThan(0);
        if (packed.entityCount !== undefined) {
          expect(table.numRows).toBe(packed.entityCount);
        }
        expect(table.schema.metadata.get('geo')).toBeTruthy();
      }
    );
  });

  describe.skipIf(!hasGeometry)('server without Range support', () => {
    it('falls back to the whole parent file', async () => {
      const server = await serveGeometry(false);
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      try {
        const packed = [...packedFiles.values()].find(
          (candidate) =>
            candidate.pack.row_groups?.length &&
            candidate.entityCount !== undefined
        )!;
        const url = `http://127.0.0.1:${port}/${packed.pack.file}.parquet`;
        let downloads = 0;
        clearParquetFileCache();
        const buffer = await readParquetRowGroups(
          url,
          packed.pack.row_groups!,
          async () => {
            downloads++;
            const bytes = readFileSync(geometryPath(packed.pack.file));
            return bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength
            );
          },
          30_000
        );
        const table = readRows(buffer);
        expect(downloads).toBeLessThanOrEqual(1);
        expect(table.numRows).toBe(packed.entityCount);
        expect(table.schema.metadata.get('geo')).toBeTruthy();
      } finally {
        server.close();
      }
    });
  });
});
