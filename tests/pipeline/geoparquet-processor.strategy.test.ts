import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';

const {
  getArrayBufferMock,
  insertArrowTableIntoDuckDBMock,
  geoParquetReaderMock
} = vi.hoisted(() => ({
  getArrayBufferMock: vi.fn(),
  insertArrowTableIntoDuckDBMock: vi.fn(),
  geoParquetReaderMock: {
    readGeoParquet: vi.fn(),
    extractMetadata: vi.fn()
  }
}));

vi.mock(
  '$lib/features/data-pipeline/processors/strategies/processor-utils',
  () => ({
    getArrayBuffer: getArrayBufferMock
  })
);

vi.mock('$lib/features/duckdb/io/arrow-converter', () => ({
  insertArrowTableIntoDuckDB: insertArrowTableIntoDuckDBMock
}));

vi.mock('$lib/features/data-pipeline', () => ({
  geoParquetReader: geoParquetReaderMock
}));

import { geoparquetProcessor } from '$lib/features/data-pipeline/processors/strategies/geoparquet-processor';

function file(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    id: 'f1',
    name: 'map.geoparquet',
    size: 10,
    type: 'application/octet-stream',
    fileType: FileType.GEOPARQUET,
    status: 'complete',
    sourceType: 'file_upload',
    ...overrides
  } as UploadedFile;
}

function ctx() {
  return {
    tableName: 'tbl_gpq',
    Duck: {
      query: vi.fn().mockResolvedValue(undefined),
      analyse: vi.fn().mockResolvedValue([])
    },
    callbacks: {
      getRowCount: vi.fn().mockResolvedValue(4),
      createArrowTableWithMetadata: vi.fn()
    }
  };
}

describe('geoparquetProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getArrayBufferMock.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    geoParquetReaderMock.readGeoParquet.mockResolvedValue({ rows: 4 });
    geoParquetReaderMock.extractMetadata.mockReturnValue({
      primary_column: 'geom',
      columns: {
        geom: { encoding: 'WKB' }
      }
    });
    insertArrowTableIntoDuckDBMock.mockResolvedValue(undefined);
  });

  it('matches parquet and arrow extensions', () => {
    expect(geoparquetProcessor.canHandle(file())).toBe(true);
    expect(geoparquetProcessor.canHandle(file({ name: 'a.arrow' }))).toBe(true);
    expect(geoparquetProcessor.canHandle(file({ name: 'a.parquet' }))).toBe(
      true
    );
    expect(
      geoparquetProcessor.canHandle(
        file({ fileType: FileType.CSV, name: 'data.csv' })
      )
    ).toBe(false);
  });

  it('processes geoparquet and attempts geometry conversion when metadata exists', async () => {
    const c = ctx();

    const result = await geoparquetProcessor.process(c as never, file());

    expect(getArrayBufferMock).toHaveBeenCalledTimes(1);
    expect(insertArrowTableIntoDuckDBMock).toHaveBeenCalledWith(
      { rows: 4 },
      'tbl_gpq'
    );
    expect(c.Duck.query).toHaveBeenCalledTimes(2);
    expect(result.rowCount).toBe(4);
    expect(result.geoArrowMetadata).toBeDefined();
  });

  it('continues when geometry conversion query fails', async () => {
    const c = ctx();
    c.Duck.query
      .mockRejectedValueOnce(new Error('geom conversion failed'))
      .mockResolvedValueOnce(undefined);

    const result = await geoparquetProcessor.process(c as never, file());

    expect(c.Duck.query).toHaveBeenCalledTimes(2);
    expect(result.tableName).toBe('tbl_gpq');
  });

  it('skips conversion query when metadata is missing', async () => {
    geoParquetReaderMock.extractMetadata.mockReturnValue(null);

    const c = ctx();
    await geoparquetProcessor.process(c as never, file());

    expect(c.Duck.query).toHaveBeenCalledTimes(1);
  });
});
