import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/types/create-project.types';

const { getFileForDuckDBMock } = vi.hoisted(() => ({
  getFileForDuckDBMock: vi.fn()
}));

vi.mock(
  '$lib/features/data-pipeline/processors/strategies/processor-utils',
  () => ({
    getFileForDuckDB: getFileForDuckDBMock,
    getArrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
  })
);

import { geopackageProcessor } from '$lib/features/data-pipeline/processors/strategies/geopackage-processor';
import { gpxProcessor } from '$lib/features/data-pipeline/processors/strategies/gpx-processor';

function file(name: string, fileType: FileType): UploadedFile {
  return {
    id: 'f1',
    name,
    size: 100,
    type: '',
    fileType,
    status: 'complete',
    sourceType: 'file_upload',
    content: new ArrayBuffer(8)
  } as UploadedFile;
}

function ctx(tableName = 'tbl') {
  return {
    tableName,
    Duck: {
      register_files: vi.fn().mockResolvedValue(undefined),
      read_geofile: vi.fn().mockResolvedValue(tableName),
      analyse: vi.fn().mockResolvedValue([])
    },
    callbacks: {
      getRowCount: vi.fn().mockResolvedValue(5),
      createArrowTableWithMetadata: vi.fn()
    }
  };
}

describe('geopackageProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFileForDuckDBMock.mockImplementation(
      (f: UploadedFile) => new File([f.content as ArrayBuffer], f.name)
    );
  });

  it('canHandle matches by fileType or .gpkg extension', () => {
    expect(
      geopackageProcessor.canHandle(file('data.gpkg', FileType.GEOPACKAGE))
    ).toBe(true);
    expect(geopackageProcessor.canHandle(file('data.csv', FileType.CSV))).toBe(
      false
    );
  });

  it('calls read_geofile with the gpkg file', async () => {
    const c = ctx();
    const result = await geopackageProcessor.process(
      c as never,
      file('data.gpkg', FileType.GEOPACKAGE)
    );
    expect(c.Duck.read_geofile).toHaveBeenCalledOnce();
    expect(result.metadata.fileType).toBe(FileType.GEOPACKAGE);
  });
});

describe('gpxProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('canHandle matches .gpx extension', () => {
    expect(gpxProcessor.canHandle(file('track.gpx', FileType.GPX))).toBe(true);
    expect(gpxProcessor.canHandle(file('data.csv', FileType.CSV))).toBe(false);
  });

  it('processes GPX file and returns ProcessorDataset with fileType', async () => {
    const c = ctx('tbl_gpx');
    const f = file('track.gpx', FileType.GPX);
    f.content =
      '<?xml version="1.0"?><gpx version="1.1"><wpt lat="48.8" lon="2.3"><name>P</name></wpt></gpx>';
    const result = await gpxProcessor.process(c as never, f);
    expect(result.metadata.fileType).toBe(FileType.GPX);
    expect(result.rowCount).toBeGreaterThanOrEqual(0);
  });
});
