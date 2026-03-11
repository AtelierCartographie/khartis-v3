import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';

const {
  convertTabularDataToArrowMock,
  insertArrowTableIntoDuckDBMock,
  convertToCSVMock,
  isTabularDataMock
} = vi.hoisted(() => ({
  convertTabularDataToArrowMock: vi.fn(),
  insertArrowTableIntoDuckDBMock: vi.fn(),
  convertToCSVMock: vi.fn(),
  isTabularDataMock: vi.fn()
}));

vi.mock('$lib/features/duckdb/io/arrow-converter', () => ({
  convertTabularDataToArrow: convertTabularDataToArrowMock,
  insertArrowTableIntoDuckDB: insertArrowTableIntoDuckDBMock
}));

vi.mock(
  '$lib/features/data-pipeline/processors/strategies/processor-utils',
  () => ({
    convertToCSV: convertToCSVMock,
    isTabularData: isTabularDataMock
  })
);

import { csvProcessor } from '$lib/features/data-pipeline/processors/strategies/csv-processor';

function file(overrides: Partial<UploadedFile> = {}): UploadedFile {
  return {
    id: 'f1',
    name: 'data.csv',
    size: 10,
    type: 'text/csv',
    fileType: FileType.CSV,
    status: 'complete',
    sourceType: 'file_upload',
    parsedData: [{ a: 1 }],
    ...overrides
  } as UploadedFile;
}

function ctx() {
  return {
    tableName: 'tbl_csv',
    Duck: {
      analyse: vi.fn().mockResolvedValue([]),
      register_files: vi.fn().mockResolvedValue(undefined),
      read_tabular: vi.fn().mockResolvedValue('tbl_csv_actual')
    },
    callbacks: {
      getRowCount: vi.fn().mockResolvedValue(2),
      createArrowTableWithMetadata: vi.fn()
    }
  };
}

describe('csvProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isTabularDataMock.mockReturnValue(true);
    convertTabularDataToArrowMock.mockReturnValue({ mock: 'arrow' });
    insertArrowTableIntoDuckDBMock.mockResolvedValue(undefined);
    convertToCSVMock.mockReturnValue('a\n1');
  });

  it('matches CSV/TSV files by type and extension', () => {
    expect(csvProcessor.canHandle(file())).toBe(true);
    expect(csvProcessor.canHandle(file({ fileType: FileType.TSV }))).toBe(true);
    expect(csvProcessor.canHandle(file({ name: 'data.txt' }))).toBe(true);
    expect(
      csvProcessor.canHandle(
        file({ fileType: FileType.GEOJSON, name: 'x.geojson' })
      )
    ).toBe(false);
  });

  it('throws ParseError when parsedData is missing/invalid', async () => {
    isTabularDataMock.mockReturnValue(false);

    await expect(
      csvProcessor.process(ctx() as never, file())
    ).rejects.toMatchObject({
      name: 'ParseError'
    });
  });

  it('uses Arrow ingestion when available', async () => {
    const c = ctx();
    const result = await csvProcessor.process(c as never, file());

    expect(convertTabularDataToArrowMock).toHaveBeenCalledTimes(1);
    expect(insertArrowTableIntoDuckDBMock).toHaveBeenCalledWith(
      { mock: 'arrow' },
      'tbl_csv'
    );
    expect(c.Duck.register_files).not.toHaveBeenCalled();
    expect(result.tableName).toBe('tbl_csv');
  });

  it('falls back to legacy CSV ingestion when Arrow path fails', async () => {
    convertTabularDataToArrowMock.mockImplementation(() => {
      throw new Error('arrow failure');
    });

    const c = ctx();
    const result = await csvProcessor.process(c as never, file());

    expect(convertToCSVMock).toHaveBeenCalledTimes(1);
    expect(c.Duck.register_files).toHaveBeenCalledTimes(1);
    expect(c.Duck.read_tabular).toHaveBeenCalledTimes(1);
    expect(result.tableName).toBe('tbl_csv_actual');
  });
});
