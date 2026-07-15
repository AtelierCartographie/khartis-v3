import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/types/create-project.types';

const { getArrayBufferMock } = vi.hoisted(() => ({
  getArrayBufferMock: vi.fn()
}));

vi.mock(
  '$lib/features/data-pipeline/processors/strategies/processor-utils',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('$lib/features/data-pipeline/processors/strategies/processor-utils')
    >()),
    getArrayBuffer: getArrayBufferMock,
    getFileForDuckDB: vi.fn()
  })
);

import { geoparquetProcessor } from '$lib/features/data-pipeline/processors/strategies/geoparquet-processor';

function file(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    id: 'f1',
    name: 'data.parquet',
    size: 100,
    type: 'application/octet-stream',
    fileType: FileType.GEOPARQUET,
    status: 'complete',
    sourceType: 'file_upload',
    content: new ArrayBuffer(8),
    ...overrides
  } as UploadedFile;
}

function ctx() {
  return {
    tableName: 'tbl_parquet',
    Duck: {
      register_files: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue(undefined),
      read_tabular: vi.fn().mockResolvedValue('tbl_parquet'),
      analyse: vi.fn().mockResolvedValue([{ name: 'geom' }])
    },
    callbacks: {
      getRowCount: vi.fn().mockResolvedValue(10),
      createArrowTableWithMetadata: vi.fn()
    }
  };
}

describe('geoparquetProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getArrayBufferMock.mockResolvedValue(new ArrayBuffer(8));
  });

  it('canHandle matches parquet/geoparquet/gpq/arrow by fileType or extension', () => {
    expect(geoparquetProcessor.canHandle(file())).toBe(true);
    expect(
      geoparquetProcessor.canHandle(
        file({ name: 'data.geoparquet', fileType: FileType.GEOPARQUET })
      )
    ).toBe(true);
    expect(
      geoparquetProcessor.canHandle(
        file({ name: 'data.gpq', fileType: FileType.GEOPARQUET })
      )
    ).toBe(true);
    expect(
      geoparquetProcessor.canHandle(
        file({ name: 'data.csv', fileType: FileType.CSV })
      )
    ).toBe(false);
  });

  it('loads parquet through DuckDB tabular import and returns the dataset', async () => {
    const c = ctx();
    const result = await geoparquetProcessor.process(c as never, file());
    expect(c.Duck.read_tabular).toHaveBeenCalledWith(expect.any(File), {
      tablename: 'tbl_parquet',
      format: 'parquet'
    });
    expect(result.columns).toHaveLength(1);
    expect(result.rowCount).toBe(10);
  });
});
