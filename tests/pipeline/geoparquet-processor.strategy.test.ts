import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';

const { getArrayBufferMock } = vi.hoisted(() => ({
  getArrayBufferMock: vi.fn()
}));

vi.mock(
  '$lib/features/data-pipeline/processors/strategies/processor-utils',
  () => ({
    getArrayBuffer: getArrayBufferMock
  })
);

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
      analyse: vi.fn().mockResolvedValue([]),
      register_files: vi.fn().mockResolvedValue(undefined)
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

  it('processes geoparquet via DuckDB read_parquet', async () => {
    const c = ctx();

    const result = await geoparquetProcessor.process(c as never, file());

    expect(getArrayBufferMock).toHaveBeenCalledTimes(1);
    expect(c.Duck.register_files).toHaveBeenCalledTimes(1);
    // CREATE TABLE + sequence/alter = 2 query calls
    expect(c.Duck.query).toHaveBeenCalledTimes(2);
    expect(result.rowCount).toBe(4);
    expect(result.tableName).toBe('tbl_gpq');
  });

  it('creates __id sequence column', async () => {
    const c = ctx();

    await geoparquetProcessor.process(c as never, file());

    const calls = c.Duck.query.mock.calls.map(
      (call: unknown[]) => call[0] as string
    );
    const seqCall = calls.find(
      (sql: string) => sql.includes('SEQUENCE') && sql.includes('__id')
    );
    expect(seqCall).toBeDefined();
  });
});
