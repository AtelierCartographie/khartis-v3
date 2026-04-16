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
    size: 100,
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

  it('canHandle matches by fileType or .shp extension', () => {
    expect(shapefileProcessor.canHandle(file())).toBe(true);
    expect(
      shapefileProcessor.canHandle(
        file({ name: 'map.shp', fileType: FileType.CSV })
      )
    ).toBe(true);
    expect(
      shapefileProcessor.canHandle(
        file({ name: 'data.csv', fileType: FileType.CSV })
      )
    ).toBe(false);
  });

  it('throws ParseError when .dbf companion is missing', async () => {
    await expect(
      shapefileProcessor.process(ctx() as never, file())
    ).rejects.toMatchObject({ name: 'ParseError' });
  });

  it('throws ParseError when .shx companion is missing', async () => {
    const f = file({
      relatedFileObjects: [new File(['dbf'], 'roads.dbf')]
    });
    await expect(
      shapefileProcessor.process(ctx() as never, f)
    ).rejects.toMatchObject({ name: 'ParseError' });
  });

  it('processes shapefile with .shp + .shx + .dbf and returns ProcessorDataset', async () => {
    const c = ctx();
    const f = file({
      relatedFileObjects: [
        new File(['shx'], 'roads.shx'),
        new File(['dbf'], 'roads.dbf')
      ]
    });
    const result = await shapefileProcessor.process(c as never, f);
    expect(c.Duck.register_files).toHaveBeenCalledOnce();
    expect(result.tableName).toBe('tbl_shp_actual');
    expect(result.rowCount).toBe(6);
  });
});
