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

import { shapefileProcessor } from '$lib/features/data-pipeline/processors/strategies/shapefile-processor';

function file(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    id: 'f1',
    name: 'roads.shp',
    size: 10,
    type: 'application/octet-stream',
    fileType: FileType.SHAPEFILE,
    status: 'complete',
    sourceType: 'file_upload',
    content: new Uint8Array([1, 2, 3]).buffer,
    ...overrides
  } as UploadedFile;
}

function ctx() {
  return {
    tableName: 'tbl_shp',
    Duck: {
      register_files: vi.fn().mockResolvedValue(undefined),
      read_geofile: vi.fn().mockResolvedValue('tbl_shp_actual'),
      analyse: vi.fn().mockResolvedValue([])
    },
    callbacks: {
      getRowCount: vi.fn().mockResolvedValue(6),
      createArrowTableWithMetadata: vi.fn()
    }
  };
}

describe('shapefileProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFileForDuckDBMock.mockImplementation(
      (uploaded: UploadedFile) =>
        new File([uploaded.content as ArrayBuffer], uploaded.name)
    );
  });

  it('matches shapefile by type or extension', () => {
    expect(shapefileProcessor.canHandle(file())).toBe(true);
    expect(
      shapefileProcessor.canHandle(
        file({ fileType: FileType.CSV, name: 'x.csv' })
      )
    ).toBe(false);
  });

  it('throws ParseError when companion files are missing', async () => {
    await expect(
      shapefileProcessor.process(ctx() as never, file())
    ).rejects.toMatchObject({ name: 'ParseError' });
  });

  it('processes shapefile with companions via DuckDB shapefile mode', async () => {
    const c = ctx();

    const dbf = new File(['dbf'], 'roads.dbf');
    const shx = new File(['shx'], 'roads.shx');

    const result = await shapefileProcessor.process(
      c as never,
      file({ relatedFileObjects: [dbf, shx] })
    );

    expect(c.Duck.register_files).toHaveBeenCalledWith(
      [expect.any(File), dbf, shx],
      { shapefile: true }
    );
    expect(c.Duck.read_geofile).toHaveBeenCalledWith(expect.any(File), {
      tablename: 'tbl_shp',
      shapefile: true
    });
    expect(result.tableName).toBe('tbl_shp_actual');
    expect(result.rowCount).toBe(6);
  });
});
