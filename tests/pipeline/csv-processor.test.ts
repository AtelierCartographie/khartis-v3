import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/stores/create-project.types';

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
    parsedData: [{ a: 1, b: 'x' }],
    ...overrides
  } as UploadedFile;
}

function ctx() {
  return {
    tableName: 'tbl_csv',
    Duck: {
      analyse: vi.fn().mockResolvedValue([{ name: 'a' }, { name: 'b' }]),
      register_files: vi.fn().mockResolvedValue(undefined),
      read_tabular: vi.fn().mockResolvedValue('tbl_csv_legacy')
    },
    callbacks: {
      getRowCount: vi.fn().mockResolvedValue(1),
      createArrowTableWithMetadata: vi.fn()
    }
  };
}

describe('csvProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('canHandle matches CSV/TSV by fileType or extension', () => {
    expect(csvProcessor.canHandle(file())).toBe(true);
    expect(
      csvProcessor.canHandle(file({ name: 'data.tsv', fileType: FileType.TSV }))
    ).toBe(true);
    expect(
      csvProcessor.canHandle(
        file({ name: 'data.geojson', fileType: FileType.GEOJSON })
      )
    ).toBe(false);
  });

  it('throws ParseError when parsedData is missing', async () => {
    isTabularDataMock.mockReturnValue(false);
    await expect(
      csvProcessor.process(ctx() as never, file({ parsedData: undefined }))
    ).rejects.toMatchObject({ name: 'ParseError' });
  });

  it('takes Arrow path when convertTabularDataToArrow succeeds', async () => {
    isTabularDataMock.mockReturnValue(true);
    convertTabularDataToArrowMock.mockReturnValue({ schema: {} });
    insertArrowTableIntoDuckDBMock.mockResolvedValue(undefined);
    const c = ctx();
    const result = await csvProcessor.process(c as never, file());
    expect(convertTabularDataToArrowMock).toHaveBeenCalledOnce();
    expect(insertArrowTableIntoDuckDBMock).toHaveBeenCalledOnce();
    expect(c.Duck.read_tabular).not.toHaveBeenCalled();
    expect(result.tableName).toBe('tbl_csv');
    expect(result.columns).toHaveLength(2);
  });

  it('falls back to legacy read_tabular when Arrow path throws', async () => {
    isTabularDataMock.mockReturnValue(true);
    convertTabularDataToArrowMock.mockImplementation(() => {
      throw new Error('arrow fail');
    });
    convertToCSVMock.mockReturnValue('a,b\n1,x');
    const c = ctx();
    const result = await csvProcessor.process(c as never, file());
    expect(c.Duck.read_tabular).toHaveBeenCalledOnce();
    expect(result.tableName).toBe('tbl_csv_legacy');
  });
});
