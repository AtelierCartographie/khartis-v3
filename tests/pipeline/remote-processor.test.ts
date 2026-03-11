import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { duckMock, buildDatasetFromDuckTableMock, processZipFileMock } =
  vi.hoisted(() => ({
    duckMock: {
      read_link: vi.fn()
    },
    buildDatasetFromDuckTableMock: vi.fn(),
    processZipFileMock: vi.fn()
  }));

vi.mock('$lib/features/duckdb', () => ({
  Duck: duckMock
}));

vi.mock('$lib/features/data-pipeline/operations/analysis', () => ({
  buildDatasetFromDuckTable: buildDatasetFromDuckTableMock
}));

vi.mock('$lib/features/data-pipeline/processors/zip-processor', () => ({
  processZipFile: processZipFileMock
}));

import {
  processRemoteFile,
  processRemoteZipFile
} from '$lib/features/data-pipeline/processors/remote-processor';

const ctx = { initialized: true };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('remote-processor', () => {
  it('processes standard remote file via Duck.read_link', async () => {
    duckMock.read_link.mockResolvedValue(undefined);
    buildDatasetFromDuckTableMock.mockResolvedValue({
      id: 'd1',
      name: 'old',
      sourceFileId: 'old',
      tableName: 'my_tbl',
      columns: [],
      rowCount: 1,
      metadata: {
        processedAt: new Date(),
        fileType: 'csv',
        parserUsed: 'duck',
        transformations: []
      }
    });

    const result = await processRemoteFile(
      ctx,
      'https://example.com/path/data.csv',
      {
        tableName: 'my_tbl',
        decimalSeparator: ','
      }
    );

    expect(duckMock.read_link).toHaveBeenCalledWith(
      'https://example.com/path/data.csv',
      {
        tablename: 'my_tbl',
        decimal_separator: ','
      }
    );
    expect(buildDatasetFromDuckTableMock).toHaveBeenCalled();
    expect((result as { name: string }).name).toBe('data.csv');
    expect((result as { sourceFileId: string }).sourceFileId).toBe(
      'https://example.com/path/data.csv'
    );
  });

  it('throws on standalone remote shapefile', async () => {
    await expect(
      processRemoteFile(ctx, 'https://example.com/data.shp')
    ).rejects.toThrow();
  });

  it('supports URL parsing fallback when value is not a full URL', async () => {
    duckMock.read_link.mockResolvedValue(undefined);
    buildDatasetFromDuckTableMock.mockResolvedValue({
      id: 'd1',
      name: 'old',
      sourceFileId: 'old',
      tableName: 'tbl',
      columns: [],
      rowCount: 0,
      metadata: {
        processedAt: new Date(),
        fileType: 'csv',
        parserUsed: 'duck',
        transformations: []
      }
    });

    const result = await processRemoteFile(ctx, 'folder/input.tsv');

    expect((result as { name: string }).name).toBe('input.tsv');
  });

  it('routes .zip URL through remote zip flow', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
      })
    );

    processZipFileMock.mockResolvedValue({
      id: 'd1',
      name: 'archive.csv',
      sourceFileId: 'zip',
      tableName: 'tbl',
      columns: [],
      rowCount: 1,
      metadata: {
        processedAt: new Date(),
        fileType: 'csv',
        parserUsed: 'duck',
        transformations: []
      }
    });

    const result = await processRemoteFile(ctx, 'https://example.com/data.zip');
    expect(processZipFileMock).toHaveBeenCalledTimes(1);
    expect((result as { sourceFileId: string }).sourceFileId).toBe(
      'https://example.com/data.zip'
    );
  });

  it('processes remote zip and remaps sourceFileId on multi-dataset result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(16))
      })
    );

    processZipFileMock.mockResolvedValue({
      datasets: [
        {
          id: 'd1',
          name: 'a.csv',
          sourceFileId: 'local',
          tableName: 'a',
          columns: [],
          rowCount: 1,
          metadata: {
            processedAt: new Date(),
            fileType: 'csv',
            parserUsed: 'duck',
            transformations: []
          }
        }
      ],
      sourceZipName: 'archive.zip',
      totalFiles: 1,
      processedFiles: 1,
      skippedFiles: []
    });

    const result = await processRemoteZipFile(
      ctx,
      'https://example.com/archive.zip'
    );

    expect('datasets' in result).toBe(true);
    if ('datasets' in result) {
      expect(result.datasets[0].sourceFileId).toBe(
        'https://example.com/archive.zip'
      );
    }
  });

  it('fails when remote zip fetch status is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })
    );

    await expect(
      processRemoteZipFile(ctx, 'https://example.com/missing.zip')
    ).rejects.toThrow();
  });

  it('rethrows fetch/runtime failures during remote zip processing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down'))
    );

    await expect(
      processRemoteZipFile(ctx, 'https://example.com/down.zip')
    ).rejects.toThrow('network down');
  });
});
