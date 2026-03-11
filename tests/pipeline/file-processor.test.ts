import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UploadedFilePayload } from '$lib/features/data-pipeline/types';

const {
  duckMock,
  buildDatasetFromDuckTableMock,
  detectCsvHeaderMock,
  detectDecimalSeparatorMock,
  detectGeoColumnsMock
} = vi.hoisted(() => ({
  duckMock: {
    register_files: vi.fn(),
    read_geofile: vi.fn(),
    read_tabular: vi.fn(),
    query: vi.fn()
  },
  buildDatasetFromDuckTableMock: vi.fn(),
  detectCsvHeaderMock: vi.fn(),
  detectDecimalSeparatorMock: vi.fn(),
  detectGeoColumnsMock: vi.fn()
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: duckMock
}));

vi.mock('$lib/features/data-pipeline/operations/analysis', () => ({
  buildDatasetFromDuckTable: buildDatasetFromDuckTableMock
}));

vi.mock('$lib/features/data-pipeline/utils/csv-header-detector', () => ({
  detectCsvHeader: detectCsvHeaderMock
}));

vi.mock('$lib/features/data-pipeline/utils/decimal-detector', () => ({
  detectDecimalSeparator: detectDecimalSeparatorMock
}));

vi.mock('$lib/features/commons/utils/geo-detector.utils', () => ({
  GeoColumnDetector: {
    detectGeoColumns: detectGeoColumnsMock
  }
}));

import {
  createCompanionFilesFromUpload,
  createFileFromUpload,
  createFileFromUploadContent,
  processFileInternal
} from '$lib/features/data-pipeline/processors/file-processor';

const ctx = { initialized: true };

function datasetFromParams(
  fileName: string,
  tableName = 'tbl_test',
  rowCount = 2
) {
  return {
    id: 'ds_1',
    name: fileName,
    sourceFileId: fileName,
    tableName,
    columns: [
      {
        name: 'country',
        type: 'text',
        values: [],
        stats: {
          name: 'country',
          type: 'text',
          count: rowCount,
          nulls: 0,
          uniques: rowCount
        }
      }
    ],
    rowCount,
    metadata: {
      processedAt: new Date(),
      fileType: 'csv',
      parserUsed: 'DuckDB',
      transformations: []
    },
    analysis: {
      columns: [],
      hasGeoData: false,
      geoColumns: [],
      rowCount,
      warnings: []
    }
  };
}

describe('file-processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    buildDatasetFromDuckTableMock.mockImplementation(
      async (_ctx, params: { file: { name: string }; tableName: string }) =>
        datasetFromParams(params.file.name, params.tableName)
    );

    detectDecimalSeparatorMock.mockResolvedValue({
      separator: '.',
      confidence: 1,
      sampleSize: 2,
      delimiter: ','
    });

    detectCsvHeaderMock.mockResolvedValue({
      hasHeader: true,
      confidence: 1,
      comparedColumns: 3
    });

    duckMock.read_geofile.mockResolvedValue(undefined);
    duckMock.read_tabular.mockResolvedValue(undefined);
    duckMock.query.mockResolvedValue([]);
    detectGeoColumnsMock.mockReturnValue({
      hasGeoColumns: false,
      geoColumns: [],
      warnings: []
    });
  });

  it('rejects standalone shapefiles without companion files', async () => {
    const shp = new File(['shp'], 'roads.shp');

    await expect(processFileInternal(ctx, shp)).rejects.toThrow();
    expect(duckMock.register_files).not.toHaveBeenCalled();
  });

  it('processes shapefiles with companion files via read_geofile', async () => {
    const shp = new File(['shp'], 'roads.shp');
    const dbf = new File(['dbf'], 'roads.dbf');

    const result = await processFileInternal(ctx, shp, {
      companionFiles: [dbf]
    });

    expect(duckMock.register_files).toHaveBeenCalledWith([shp, dbf], {
      shapefile: true
    });
    expect(duckMock.read_geofile).toHaveBeenCalledTimes(1);
    expect(result.name).toBe('roads.shp');
  });

  it('processes CSV with detected delimiter/header/decimal options', async () => {
    detectDecimalSeparatorMock.mockResolvedValue({
      separator: ',',
      confidence: 0.8,
      sampleSize: 10,
      delimiter: ';',
      thousandsSeparator: '.'
    });

    detectCsvHeaderMock.mockResolvedValue({
      hasHeader: false,
      confidence: 0.9,
      comparedColumns: 4
    });

    duckMock.query.mockResolvedValue([{ country: 'FR' }, { country: 'DE' }]);
    detectGeoColumnsMock.mockReturnValue({
      hasGeoColumns: true,
      geoColumns: [
        { index: 0, columnName: 'country', type: 'iso3', confidence: 0.9 }
      ],
      warnings: ['geo']
    });

    const file = new File(['a;b\n1;2'], 'data.csv', { type: 'text/csv' });
    const result = await processFileInternal(ctx, file);

    expect(duckMock.read_tabular).toHaveBeenCalledWith(
      file,
      expect.objectContaining({
        header: false,
        decimal_separator: ',',
        delimiter: ';',
        thousands_separator: '.'
      })
    );

    expect(result.metadata.csvOptions).toEqual({
      header: false,
      decimalSeparator: ',',
      delimiter: ';',
      thousandsSeparator: '.'
    });
    expect(result.geoDetection?.hasGeoColumns).toBe(true);
  });

  it('uses parquet ingestion path for parquet-like files', async () => {
    const file = new File(['parquet'], 'table.parquet', {
      type: 'application/octet-stream'
    });

    const result = await processFileInternal(ctx, file);

    expect(duckMock.read_tabular).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ format: 'parquet' })
    );
    expect(result.metadata.csvOptions).toBeUndefined();
  });

  it('maps rawDataset into originalData snapshot', async () => {
    const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });

    const result = await processFileInternal(ctx, file, {
      rawDataset: {
        headers: ['a', 'b'],
        rows: [[1, 2]],
        columns: [{ name: 'a', values: [1] }],
        metadata: {}
      }
    });

    expect(result.originalData).toEqual({
      columns: result.columns,
      data: [{ a: 1, b: 2 }],
      rowCount: 1
    });
  });

  it('does not fail hard when geo detection query fails', async () => {
    duckMock.query.mockRejectedValue(new Error('query failed'));

    const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });

    await expect(processFileInternal(ctx, file)).resolves.toBeDefined();
  });

  it('creates File from upload content (string and ArrayBuffer)', async () => {
    const strFile = await createFileFromUploadContent(
      'a,b\n1,2',
      'str.csv',
      'text/csv'
    );
    const binFile = await createFileFromUploadContent(
      new Uint8Array([1, 2, 3]).buffer,
      'bin.dat',
      'application/octet-stream'
    );

    expect(strFile.name).toBe('str.csv');
    expect(strFile.type).toBe('text/csv');
    expect(await strFile.text()).toContain('a,b');

    expect(binFile.name).toBe('bin.dat');
    expect(binFile.type).toBe('application/octet-stream');
    expect((await binFile.arrayBuffer()).byteLength).toBe(3);
  });

  it('creates File from uploaded payload and fails when content is missing', async () => {
    const payload: UploadedFilePayload = {
      id: 'u1',
      name: 'payload.csv',
      size: 10,
      type: 'text/csv',
      content: 'a,b\n1,2'
    };

    const file = await createFileFromUpload(payload);
    expect(file.name).toBe('payload.csv');

    await expect(
      createFileFromUpload({ ...payload, content: undefined })
    ).rejects.toThrow();
  });

  it('creates companion files from relatedFilesData and ignores main file', () => {
    const payload: UploadedFilePayload = {
      id: 'u2',
      name: 'roads.shp',
      size: 10,
      type: 'application/octet-stream',
      content: new Uint8Array([1]).buffer,
      relatedFilesData: {
        'roads.shp': [1, 2, 3],
        'roads.dbf': [4, 5, 6],
        'roads.shx': new Uint8Array([7, 8]).buffer
      }
    };

    const companions = createCompanionFilesFromUpload(payload);

    expect(companions).toHaveLength(2);
    expect(companions?.map((f) => f.name).sort()).toEqual([
      'roads.dbf',
      'roads.shx'
    ]);
  });

  it('returns undefined when there is no relatedFilesData', () => {
    const payload: UploadedFilePayload = {
      id: 'u3',
      name: 'file.csv',
      size: 1,
      type: 'text/csv',
      content: 'x'
    };

    expect(createCompanionFilesFromUpload(payload)).toBeUndefined();
  });
});
