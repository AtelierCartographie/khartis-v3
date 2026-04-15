import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as m from '$lib/paraglide/messages';

const { DuckMock } = vi.hoisted(() => ({
  DuckMock: {
    read_link: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue(undefined)
  }
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

import {
  processRemoteFile,
  processRemoteZipFile
} from '$lib/features/data-pipeline/processors/remote-processor';

const ctx = { projectId: 'p1' } as never;

describe('remote-processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects .shp URL with a standalone shapefile error', async () => {
    await expect(
      processRemoteFile(ctx, 'https://example.com/roads.shp')
    ).rejects.toThrow(m.pipeline_error_shp_standalone());
  });

  it('calls Duck.read_link for a CSV URL', async () => {
    await processRemoteFile(ctx, 'https://example.com/data.csv');
    expect(DuckMock.read_link).toHaveBeenCalledWith(
      'https://example.com/data.csv',
      expect.objectContaining({ tablename: expect.any(String) })
    );
  });

  it('passes decimal_separator to Duck.read_link when provided', async () => {
    await processRemoteFile(ctx, 'https://example.com/data.csv', {
      decimalSeparator: ','
    });
    expect(DuckMock.read_link).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ decimal_separator: ',' })
    );
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
      processRemoteZipFile(ctx, 'https://example.com/missing.zip')
    ).rejects.toThrow(
      m.pipeline_error_fetch_failed({ status: '404', statusText: 'Not Found' })
    );
    vi.unstubAllGlobals();
  });
});
