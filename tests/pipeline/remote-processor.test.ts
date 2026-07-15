import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';
import type { DatasetResult } from '$lib/features/data-pipeline/types';

const { processFileInternalMock, processZipFileMock } = vi.hoisted(() => ({
  processFileInternalMock: vi.fn(),
  processZipFileMock: vi.fn()
}));

vi.mock('$lib/features/data-pipeline/processors/file-processor', () => ({
  processFileInternal: processFileInternalMock
}));

vi.mock('$lib/features/data-pipeline/processors/zip-processor', () => ({
  processZipFile: (...args: unknown[]) => processZipFileMock(...args)
}));

import {
  processRemoteFile,
  processRemoteZipFile
} from '$lib/features/data-pipeline/processors/remote-processor';

function stubDataset(): DatasetResult {
  return {
    id: 'ds1',
    tableName: 'tbl',
    columns: [],
    rowCount: 3,
    name: 'test',
    sourceFileId: 'local',
    format: 'csv',
    metadata: { processedAt: new Date(), fileType: 'csv', parserUsed: 'DuckDB' }
  };
}

describe('remote-processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processFileInternalMock.mockResolvedValue(stubDataset());
    processZipFileMock.mockResolvedValue({
      id: 'zip-ds',
      tableName: 'zip_table',
      columns: [],
      rowCount: 0,
      name: 'zip',
      sourceFileId: 'zip',
      format: 'kml',
      metadata: { processedAt: new Date(), fileType: 'kml' }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects .shp URL with a standalone shapefile error', async () => {
    await expect(
      processRemoteFile('https://example.com/roads.shp')
    ).rejects.toMatchObject({
      name: 'ParseError',
      code: 'PARSE_ERROR',
      fileType: 'shapefile',
      message: m.pipeline_error_shp_standalone(),
      details: {
        fileName: 'roads.shp',
        url: 'https://example.com/roads.shp'
      }
    });
  });

  it('downloads a CSV URL and runs it through the local file pipeline', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/csv' }),
      arrayBuffer: vi
        .fn()
        .mockResolvedValue(new TextEncoder().encode('a\n1').buffer)
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await processRemoteFile('https://example.com/data.csv');

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/data.csv');
    expect(processFileInternalMock).toHaveBeenCalledTimes(1);
    const [downloadedFile, options] = processFileInternalMock.mock.calls[0];
    expect(downloadedFile).toBeInstanceOf(File);
    expect((downloadedFile as File).name).toBe('data.csv');
    expect(options).toEqual({ originalName: 'data.csv' });
    expect('datasets' in result).toBe(false);
    if (!('datasets' in result)) {
      expect(result.sourceFileId).toBe('https://example.com/data.csv');
      expect(result.name).toBe('data.csv');
    }
  });

  it('throws pipeline_error_fetch_failed when the CSV download fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })
    );

    await expect(
      processRemoteFile('https://example.com/missing.csv')
    ).rejects.toMatchObject({
      name: 'PipelineError',
      code: 'REMOTE_FILE_FETCH_FAILED',
      details: {
        status: 404,
        statusText: 'Not Found',
        url: 'https://example.com/missing.csv'
      }
    });
    expect(processFileInternalMock).not.toHaveBeenCalled();
  });

  it('processes remote KMZ as an archive instead of a direct file', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await processRemoteFile('https://example.com/places.kmz');

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/places.kmz');
    expect(processZipFileMock).toHaveBeenCalledOnce();
    expect(processFileInternalMock).not.toHaveBeenCalled();
    expect('datasets' in result).toBe(false);
    if ('datasets' in result) {
      throw new Error('Expected a single KMZ dataset result');
    }
    expect(result.sourceFileId).toBe('https://example.com/places.kmz');
  });

  it('throws pipeline_error_fetch_failed when fetch returns 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })
    );
    await expect(
      processRemoteZipFile('https://example.com/missing.zip')
    ).rejects.toMatchObject({
      name: 'PipelineError',
      code: 'REMOTE_FILE_FETCH_FAILED',
      message: m.pipeline_error_fetch_failed({
        status: '404',
        statusText: 'Not Found'
      }),
      details: {
        status: 404,
        statusText: 'Not Found',
        url: 'https://example.com/missing.zip'
      }
    });
  });
});
