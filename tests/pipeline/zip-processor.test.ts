import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  extractZipMock,
  getShapefileFilesFromArchiveMock,
  getNonShapefileFilesFromArchiveMock,
  getSupportedFilesFromArchiveMock,
  createFileFromExtractedMock,
  processFileInternalMock
} = vi.hoisted(() => ({
  extractZipMock: vi.fn(),
  getShapefileFilesFromArchiveMock: vi.fn(),
  getNonShapefileFilesFromArchiveMock: vi.fn(),
  getSupportedFilesFromArchiveMock: vi.fn(),
  createFileFromExtractedMock: vi.fn(),
  processFileInternalMock: vi.fn()
}));

vi.mock('$lib/features/data-pipeline/utils/zip-handler', () => ({
  extractZip: extractZipMock,
  getShapefileFilesFromArchive: getShapefileFilesFromArchiveMock,
  getNonShapefileFilesFromArchive: getNonShapefileFilesFromArchiveMock,
  getSupportedFilesFromArchive: getSupportedFilesFromArchiveMock,
  createFileFromExtracted: createFileFromExtractedMock
}));

vi.mock('$lib/features/data-pipeline/processors/file-processor', () => ({
  processFileInternal: processFileInternalMock
}));

import { processZipFile } from '$lib/features/data-pipeline/processors/zip-processor';

const ctx = { initialized: true };
const zip = new File(['zip'], 'archive.zip', { type: 'application/zip' });

function extracted(name: string) {
  return { name, path: name, content: new Uint8Array([1, 2, 3]) };
}

function dataset(name: string) {
  return {
    id: `ds_${name}`,
    name,
    sourceFileId: 'local',
    tableName: `tbl_${name}`,
    columns: [],
    rowCount: 1,
    metadata: {
      processedAt: new Date(),
      fileType: 'csv',
      parserUsed: 'duck',
      transformations: []
    }
  };
}

describe('zip-processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createFileFromExtractedMock.mockImplementation(
      (f) => new File([f.content], f.name)
    );
  });

  it('processes pure shapefile archives as single dataset', async () => {
    const shp = extracted('roads.shp');
    const dbf = extracted('roads.dbf');

    extractZipMock.mockResolvedValue({
      files: [shp, dbf],
      isShapefileArchive: true,
      shapefileBaseName: 'roads'
    });
    getShapefileFilesFromArchiveMock.mockReturnValue([shp, dbf]);
    getNonShapefileFilesFromArchiveMock.mockReturnValue([]);
    processFileInternalMock.mockResolvedValue(dataset('roads'));

    const result = await processZipFile(ctx, zip);

    expect(processFileInternalMock).toHaveBeenCalledWith(
      ctx,
      expect.any(File),
      expect.objectContaining({
        originalName: 'roads.shp',
        companionFiles: [expect.any(File)]
      })
    );
    expect('datasets' in result).toBe(false);
    if (!('datasets' in result)) {
      expect(result.name).toBe('roads');
      expect(result.sourceFileId).toBe('archive.zip');
    }
  });

  it('processes shapefile + additional files into multi-dataset result', async () => {
    const shp = extracted('roads.shp');
    const dbf = extracted('roads.dbf');
    const csv = extracted('metrics.csv');
    const bad = extracted('broken.csv');

    extractZipMock.mockResolvedValue({
      files: [shp, dbf, csv, bad],
      isShapefileArchive: true,
      shapefileBaseName: 'roads'
    });
    getShapefileFilesFromArchiveMock.mockReturnValue([shp, dbf]);
    getNonShapefileFilesFromArchiveMock.mockReturnValue([csv, bad]);

    processFileInternalMock
      .mockResolvedValueOnce(dataset('roads'))
      .mockResolvedValueOnce(dataset('metrics'))
      .mockRejectedValueOnce(new Error('cannot parse'));

    const result = await processZipFile(ctx, zip);

    expect('datasets' in result).toBe(true);
    if ('datasets' in result) {
      expect(result.datasets).toHaveLength(2);
      expect(result.skippedFiles).toEqual(['broken.csv']);
      expect(result.processedFiles).toBe(2);
      expect(result.totalFiles).toBe(3);
    }
  });

  it('throws when generic archive has no supported files', async () => {
    extractZipMock.mockResolvedValue({
      files: [extracted('readme.md')],
      isShapefileArchive: false
    });
    getSupportedFilesFromArchiveMock.mockReturnValue([]);

    await expect(processZipFile(ctx, zip)).rejects.toThrow();
  });

  it('processes generic archive with a single supported file', async () => {
    const csv = extracted('data.csv');
    extractZipMock.mockResolvedValue({
      files: [csv],
      isShapefileArchive: false
    });
    getSupportedFilesFromArchiveMock.mockReturnValue([csv]);
    processFileInternalMock.mockResolvedValue(dataset('data'));

    const result = await processZipFile(ctx, zip);

    expect('datasets' in result).toBe(false);
    if (!('datasets' in result)) {
      expect(result.name).toBe('data.csv');
      expect(result.sourceFileId).toBe('archive.zip');
    }
  });

  it('processes generic archive with multiple files and tracks skips', async () => {
    const a = extracted('a.csv');
    const b = extracted('b.csv');

    extractZipMock.mockResolvedValue({
      files: [a, b],
      isShapefileArchive: false
    });
    getSupportedFilesFromArchiveMock.mockReturnValue([a, b]);

    processFileInternalMock
      .mockResolvedValueOnce(dataset('a'))
      .mockRejectedValueOnce(new Error('bad b'));

    const result = await processZipFile(ctx, zip);

    expect('datasets' in result).toBe(true);
    if ('datasets' in result) {
      expect(result.datasets).toHaveLength(1);
      expect(result.totalFiles).toBe(2);
      expect(result.processedFiles).toBe(1);
      expect(result.skippedFiles).toEqual(['b.csv']);
    }
  });

  it('throws when all supported files fail in generic mode', async () => {
    const a = extracted('a.csv');

    extractZipMock.mockResolvedValue({
      files: [a],
      isShapefileArchive: false
    });
    getSupportedFilesFromArchiveMock.mockReturnValue([a, extracted('b.csv')]);

    processFileInternalMock.mockRejectedValue(new Error('fail'));

    await expect(processZipFile(ctx, zip)).rejects.toThrow();
  });
});
