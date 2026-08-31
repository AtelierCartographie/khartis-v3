import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import * as m from '$lib/paraglide/messages';

function makeZip(entries: Record<string, string | Uint8Array>): File {
  const normalized: Record<string, Uint8Array> = {};
  for (const [path, value] of Object.entries(entries)) {
    normalized[path] = typeof value === 'string' ? strToU8(value) : value;
  }
  const zipped = zipSync(normalized);
  return new File([Uint8Array.from(zipped)], 'bundle.zip', {
    type: 'application/zip'
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadHandler(mockFflate?: () => Record<string, any>) {
  vi.resetModules();
  if (mockFflate) {
    vi.doMock('fflate', async () => {
      const actual = await vi.importActual<typeof import('fflate')>('fflate');
      return { ...actual, ...mockFflate() };
    });
  }
  return import('$lib/features/data-pipeline/utils/zip-handler');
}

describe('zip-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignores __MACOSX/ and ._ prefixed entries and directory entries', async () => {
    const { extractZip } = await loadHandler();
    const zip = makeZip({
      '__MACOSX/._roads.shp': 'noise',
      'roads/': '',
      'roads/roads.shp': 'shp',
      'roads/roads.shx': 'shx',
      'roads/roads.dbf': 'dbf'
    });
    const result = await extractZip(zip);
    const names = result.files.map((f) => f.name);
    expect(names).not.toContain('._roads.shp');
    expect(names.some((n) => n.endsWith('/'))).toBe(false);
    expect(names).toContain('roads.shp');
  });

  it('detects shapefile archive when .shp has companions', async () => {
    const { extractZip } = await loadHandler();
    const zip = makeZip({
      'roads.shp': 'shp',
      'roads.shx': 'shx',
      'roads.dbf': 'dbf'
    });
    const result = await extractZip(zip);
    expect(result.isShapefileArchive).toBe(true);
    expect(result.shapefileBaseName).toBe('roads');
  });

  it('treats KMZ files as zip archives', async () => {
    const { isZipFile, isZipArchiveName } = await loadHandler();

    expect(isZipArchiveName('places.kmz')).toBe(true);
    expect(isZipFile(new File([], 'places.kmz'))).toBe(true);
  });

  it('returns isShapefileArchive=false when .shp has no companions', async () => {
    const { extractZip } = await loadHandler();
    const zip = makeZip({ 'roads.shp': 'shp-only' });
    const result = await extractZip(zip);
    expect(result.isShapefileArchive).toBe(false);
  });

  it('throws when the declared decompressed size exceeds the 500 MB limit before inflating', async () => {
    const { extractZip } = await loadHandler(() => ({
      unzip: (
        _data: unknown,
        opts: {
          filter: (entry: {
            name: string;
            originalSize: number;
            size: number;
            compression: number;
          }) => boolean;
        },
        cb: (err: Error | null, out: Record<string, unknown>) => void
      ) => {
        const accepted = opts.filter({
          name: 'big.csv',
          originalSize: 501 * 1024 * 1024,
          size: 1024,
          compression: 8
        });
        expect(accepted).toBe(false);
        cb(null, {});
      }
    }));
    const zip = new File([new Uint8Array([1])], 'huge.zip', {
      type: 'application/zip'
    });
    await expect(extractZip(zip)).rejects.toMatchObject({
      name: 'ParseError',
      code: 'PARSE_ERROR',
      fileType: 'zip',
      message: m.error_zip_size_exceeded({ limit: 500 }),
      details: {
        fileName: 'huge.zip',
        limitMb: 500,
        totalSize: 501 * 1024 * 1024
      }
    });
  });

  it('wraps unzip errors as pipeline errors', async () => {
    const { extractZip } = await loadHandler(() => ({
      unzip: (
        _data: unknown,
        _opts: unknown,
        cb: (err: Error | null, out: Record<string, unknown>) => void
      ) => cb(new Error('corrupt zip'), {})
    }));
    const zip = new File([new Uint8Array([1])], 'bad.zip', {
      type: 'application/zip'
    });
    await expect(extractZip(zip)).rejects.toMatchObject({
      name: 'ParseError',
      code: 'PARSE_ERROR',
      fileType: 'zip',
      details: {
        cause: 'corrupt zip',
        fileName: 'bad.zip'
      }
    });
  });
});
