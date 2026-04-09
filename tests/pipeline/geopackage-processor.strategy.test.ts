import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';

const { getFileForDuckDBMock } = vi.hoisted(() => ({
  getFileForDuckDBMock: vi.fn()
}));

vi.mock(
  '$lib/features/data-pipeline/processors/strategies/processor-utils',
  () => ({
    getFileForDuckDB: getFileForDuckDBMock
  })
);

import { geopackageProcessor } from '$lib/features/data-pipeline/processors/strategies/geopackage-processor';

function file(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    id: 'f1',
    name: 'map.gpkg',
    size: 10,
    type: 'application/geopackage+sqlite3',
    fileType: FileType.GEOPACKAGE,
    status: 'complete',
    sourceType: 'file_upload',
    content: new Uint8Array([1, 2, 3]).buffer,
    ...overrides
  } as UploadedFile;
}

function ctx() {
  return {
    tableName: 'tbl_gpkg',
    Duck: {
      register_files: vi.fn().mockResolvedValue(undefined),
      read_geofile: vi.fn().mockResolvedValue('tbl_gpkg_actual'),
      analyse: vi.fn().mockResolvedValue([])
    },
    callbacks: {
      getRowCount: vi.fn().mockResolvedValue(5),
      createArrowTableWithMetadata: vi.fn().mockResolvedValue({
        arrowTableWithMetadata: { rows: 5 },
        geoArrowMetadata: { version: '1.1.0' }
      })
    }
  };
}

describe('geopackageProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFileForDuckDBMock.mockImplementation(
      (uploaded: UploadedFile) =>
        new File([uploaded.content as ArrayBuffer], uploaded.name)
    );
  });

  it('matches geopackage files', () => {
    expect(geopackageProcessor.canHandle(file())).toBe(true);
    expect(
      geopackageProcessor.canHandle(
        file({ fileType: FileType.CSV, name: 'x.csv' })
      )
    ).toBe(false);
  });

  it('processes geopackage through read_geofile without eager Arrow export', async () => {
    const c = ctx();
    const result = await geopackageProcessor.process(c as never, file());

    expect(getFileForDuckDBMock).toHaveBeenCalledTimes(1);
    expect(c.Duck.register_files).toHaveBeenCalledTimes(1);
    expect(c.Duck.read_geofile).toHaveBeenCalledTimes(1);
    expect(c.callbacks.createArrowTableWithMetadata).not.toHaveBeenCalled();
    expect(result.tableName).toBe('tbl_gpkg_actual');
    expect(result.rowCount).toBe(5);
    expect(result.arrowTableWithMetadata).toBeUndefined();
  });
});
