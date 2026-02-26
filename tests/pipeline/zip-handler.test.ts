import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';

function zipFileFromEntries(
  name: string,
  entries: Record<string, string | Uint8Array>
): File {
  const normalized: Record<string, Uint8Array> = {};

  for (const [path, value] of Object.entries(entries)) {
    normalized[path] = typeof value === 'string' ? strToU8(value) : value;
  }

  const zipped = zipSync(normalized);
  return new File([Uint8Array.from(zipped)], name, { type: 'application/zip' });
}

async function loadZipHandler(
  mockFflate?: () => {
    unzip: (
      data: Uint8Array,
      cb: (err: Error | null, out: Record<string, Uint8Array>) => void
    ) => void;
  }
) {
  vi.resetModules();
  if (mockFflate) {
    vi.doMock('fflate', async () => {
      const actual = await vi.importActual<typeof import('fflate')>('fflate');
      return {
        ...actual,
        ...mockFflate()
      };
    });
  }

  return import('$lib/features/data-pipeline/utils/zip-handler');
}

describe('zip-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects zip files from extension', async () => {
    const { isZipFile } = await loadZipHandler();

    expect(isZipFile(new File(['x'], 'data.zip'))).toBe(true);
    expect(isZipFile(new File(['x'], 'data.csv'))).toBe(false);
  });

  it('extracts files, ignores macOS noise, and detects shapefile archive', async () => {
    const {
      extractZip,
      getShapefileFilesFromArchive,
      getSupportedFilesFromArchive,
      getNonShapefileFilesFromArchive
    } = await loadZipHandler();

    const zip = zipFileFromEntries('bundle.zip', {
      '__MACOSX/metadata.txt': 'ignored',
      '._hidden': 'ignored',
      'roads/roads.shp': 'shp',
      'roads/roads.shx': 'shx',
      'roads/roads.dbf': 'dbf',
      'roads/roads.csv': 'id,value\n1,2',
      'roads/readme.md': '# ignored by supported filter'
    });

    const extraction = await extractZip(zip);

    expect(extraction.files.map((f) => f.name).sort()).toEqual([
      'readme.md',
      'roads.csv',
      'roads.dbf',
      'roads.shp',
      'roads.shx'
    ]);
    expect(extraction.isShapefileArchive).toBe(true);
    expect(extraction.shapefileBaseName).toBe('roads');

    const shapefileFiles = getShapefileFilesFromArchive(
      extraction.files,
      'roads'
    );
    expect(shapefileFiles.map((f) => f.name).sort()).toEqual([
      'roads.dbf',
      'roads.shp',
      'roads.shx'
    ]);

    const supported = getSupportedFilesFromArchive(extraction.files);
    expect(supported.map((f) => f.name).sort()).toEqual([
      'roads.csv',
      'roads.shp'
    ]);

    const nonShapefile = getNonShapefileFilesFromArchive(
      extraction.files,
      'roads'
    );
    expect(nonShapefile.map((f) => f.name)).toEqual(['roads.csv']);
  });

  it('creates File objects from extracted content with inferred and explicit mime types', async () => {
    const { createFileFromExtracted } = await loadZipHandler();

    const csv = createFileFromExtracted({
      name: 'data.csv',
      path: 'data.csv',
      content: strToU8('a,b\n1,2')
    });

    const forced = createFileFromExtracted(
      {
        name: 'data.unknown',
        path: 'data.unknown',
        content: strToU8('x')
      },
      'text/custom'
    );

    expect(csv.type).toBe('text/csv');
    expect(forced.type).toBe('text/custom');
  });

  it('returns non-shapefile archive flag when companions are missing', async () => {
    const { extractZip } = await loadZipHandler();

    const zip = zipFileFromEntries('incomplete.zip', {
      'roads/roads.shp': 'shp-only'
    });

    const extraction = await extractZip(zip);
    expect(extraction.isShapefileArchive).toBe(false);
    expect(extraction.shapefileBaseName).toBeUndefined();
  });

  it('wraps unzip errors in pipeline zip extraction error', async () => {
    const { extractZip } = await loadZipHandler(() => ({
      unzip: (_data, cb) =>
        cb(new Error('bad zip'), {} as Record<string, Uint8Array>)
    }));

    const zip = new File([new Uint8Array([1, 2, 3])], 'bad.zip', {
      type: 'application/zip'
    });

    await expect(extractZip(zip)).rejects.toThrow();
  });

  it('rejects archive when decompressed size exceeds hard limit', async () => {
    const { extractZip } = await loadZipHandler(() => ({
      unzip: (_data, cb) =>
        cb(null, {
          'big.csv': {
            byteLength: 501 * 1024 * 1024
          } as unknown as Uint8Array
        })
    }));

    const zip = new File([new Uint8Array([1])], 'huge.zip', {
      type: 'application/zip'
    });

    await expect(extractZip(zip)).rejects.toThrow();
  });
});
