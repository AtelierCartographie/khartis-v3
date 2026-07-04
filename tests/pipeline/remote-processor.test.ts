import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';

const { DuckMock, processZipFileMock } = vi.hoisted(() => ({
  DuckMock: {
    read_link: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue(undefined)
  },
  processZipFileMock: vi.fn()
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: DuckMock
}));

vi.mock('$lib/features/data-pipeline/operations/analysis', () => ({
  buildDatasetFromDuckTable: vi.fn().mockResolvedValue({
    id: 'ds1',
    tableName: 'tbl',
    columns: [],
    rowCount: 0,
    geometry: null,
    name: 'test',
    sourceFileId: 'url',
    format: 'csv',
    metadata: { processedAt: new Date(), fileType: 'csv' }
  })
}));

vi.mock(
  '$lib/features/data-pipeline/operations/tabular-numeric-normalization',
  () => ({
    normalizeFormattedNumericColumns: vi.fn().mockResolvedValue(undefined)
  })
);

vi.mock('$lib/features/data-pipeline/processors/tabular-geo-detection', () => ({
  applyTabularGeoDetection: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/features/data-pipeline/processors/zip-processor', () => ({
  processZipFile: (...args: unknown[]) => processZipFileMock(...args)
}));

import {
  processRemoteFile,
  processRemoteZipFile
} from '$lib/features/data-pipeline/processors/remote-processor';

describe('remote-processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processZipFileMock.mockResolvedValue({
      id: 'zip-ds',
      tableName: 'zip_table',
      columns: [],
      rowCount: 0,
      geometry: null,
      name: 'zip',
      sourceFileId: 'zip',
      format: 'kml',
      metadata: { processedAt: new Date(), fileType: 'kml' }
    });
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

  it('calls Duck.read_link for a CSV URL', async () => {
    await processRemoteFile('https://example.com/data.csv');
    expect(DuckMock.read_link).toHaveBeenCalledWith(
      'https://example.com/data.csv',
      expect.objectContaining({ tablename: expect.any(String) })
    );
  });

  it('passes decimal_separator to Duck.read_link when provided', async () => {
    await processRemoteFile('https://example.com/data.csv', {
      decimalSeparator: ','
    });
    expect(DuckMock.read_link).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ decimal_separator: ',' })
    );
  });

  it('processes remote KMZ as an archive instead of a direct DuckDB link', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await processRemoteFile('https://example.com/places.kmz');

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/places.kmz');
    expect(processZipFileMock).toHaveBeenCalledOnce();
    expect(DuckMock.read_link).not.toHaveBeenCalled();
    expect('datasets' in result).toBe(false);
    if ('datasets' in result) {
      throw new Error('Expected a single KMZ dataset result');
    }
    expect(result.sourceFileId).toBe('https://example.com/places.kmz');

    vi.unstubAllGlobals();
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
    vi.unstubAllGlobals();
  });
});
