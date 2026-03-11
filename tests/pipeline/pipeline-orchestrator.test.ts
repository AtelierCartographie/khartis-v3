import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataAnalysisResult } from '$lib/features/commons/utils/deep-validator.utils';

const initDuckDBMock = vi.fn();
const duckMock = {
  join_by_id: vi.fn(),
  apply_join_association: vi.fn()
};

const validateFileMock = vi.fn();
const createCompanionFilesFromUploadMock = vi.fn();
const createFileFromUploadMock = vi.fn();
const createFileFromUploadContentMock = vi.fn();
const processFileInternalMock = vi.fn();
const processRemoteFileMock = vi.fn();
const processRemoteZipFileMock = vi.fn();
const processZipFileMock = vi.fn();
const isZipFileMock = vi.fn();

async function loadPipelineModule() {
  vi.resetModules();

  vi.doMock('$lib/features/duckdb', () => ({
    Duck: duckMock,
    initDuckDB: initDuckDBMock
  }));

  vi.doMock('$lib/features/data-pipeline/core/validators', () => ({
    validateFile: validateFileMock
  }));

  vi.doMock('$lib/features/data-pipeline/processors', () => ({
    createCompanionFilesFromUpload: createCompanionFilesFromUploadMock,
    createFileFromUpload: createFileFromUploadMock,
    createFileFromUploadContent: createFileFromUploadContentMock,
    processFileInternal: processFileInternalMock,
    processRemoteFile: processRemoteFileMock,
    processRemoteZipFile: processRemoteZipFileMock,
    processZipFile: processZipFileMock
  }));

  vi.doMock('$lib/features/data-pipeline/utils/zip-handler', () => ({
    isZipFile: isZipFileMock
  }));

  return import('$lib/features/data-pipeline/pipeline');
}

function dataset(name = 'dataset.csv') {
  return {
    id: 'ds1',
    name,
    sourceFileId: 'original',
    tableName: 'tbl',
    columns: [],
    rowCount: 1,
    metadata: {
      processedAt: new Date(),
      fileType: 'csv',
      parserUsed: 'duck',
      transformations: []
    },
    analysis: {
      columns: [],
      hasGeoData: false,
      geoColumns: [],
      rowCount: 1,
      warnings: []
    }
  };
}

function uploaded() {
  return {
    id: 'up1',
    name: 'uploaded.csv',
    size: 10,
    type: 'text/csv',
    content: 'a,b\n1,2'
  };
}

describe('dataPipeline orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    validateFileMock.mockResolvedValue({
      isValid: true,
      errors: [],
      warnings: []
    });

    processFileInternalMock.mockResolvedValue(dataset());
    processZipFileMock.mockResolvedValue(dataset('zipped.csv'));
    processRemoteFileMock.mockResolvedValue(dataset('remote.csv'));
    processRemoteZipFileMock.mockResolvedValue(dataset('remote-zipped.csv'));
    createFileFromUploadMock.mockResolvedValue(
      new File(['x'], 'fallback.csv', { type: 'text/csv' })
    );
    createFileFromUploadContentMock.mockResolvedValue(
      new File(['x'], 'pasted.csv', { type: 'text/csv' })
    );

    isZipFileMock.mockReturnValue(false);
    initDuckDBMock.mockResolvedValue(undefined);
  });

  it('initializes only once', async () => {
    const { dataPipeline } = await loadPipelineModule();

    await dataPipeline.initialize();
    await dataPipeline.initialize();

    expect(initDuckDBMock).toHaveBeenCalledTimes(1);
    expect(dataPipeline.initialized).toBe(true);
  });

  it('propagates initialization failures', async () => {
    initDuckDBMock.mockRejectedValue(new Error('duck init failed'));
    const { dataPipeline } = await loadPipelineModule();

    await expect(dataPipeline.initialize()).rejects.toThrow('duck init failed');
    expect(dataPipeline.initialized).toBe(false);
  });

  it('rejects invalid files with DataValidationError', async () => {
    validateFileMock.mockResolvedValue({
      isValid: false,
      errors: ['bad file'],
      warnings: []
    });

    const { dataPipeline } = await loadPipelineModule();
    await expect(
      dataPipeline.processFile(new File(['x'], 'bad.csv'))
    ).rejects.toMatchObject({ name: 'DataValidationError' });
  });

  it('routes processFile to zip processor for zip files', async () => {
    isZipFileMock.mockReturnValue(true);
    const { dataPipeline } = await loadPipelineModule();

    const result = await dataPipeline.processFile(
      new File(['x'], 'archive.zip')
    );

    expect(processZipFileMock).toHaveBeenCalledTimes(1);
    expect(processFileInternalMock).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('routes processFile to file processor for non-zip files', async () => {
    const { dataPipeline } = await loadPipelineModule();

    const file = new File(['a,b\n1,2'], 'data.csv', { type: 'text/csv' });
    const result = await dataPipeline.processFile(file);

    expect(processFileInternalMock).toHaveBeenCalledTimes(1);
    expect(processZipFileMock).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('processes uploaded file with original non-zip + filtered companions', async () => {
    const { dataPipeline } = await loadPipelineModule();

    const originalFile = new File(['x'], 'roads.shp');
    const sameName = new File(['same'], 'ROADS.SHP');
    const companion = new File(['dbf'], 'roads.dbf');

    const result = await dataPipeline.processUploadedFile(
      {
        ...uploaded(),
        name: 'roads.shp',
        relatedFileObjects: [sameName, companion],
        deepAnalysis: {
          rowCount: 0,
          columnCount: 1,
          columns: [],
          geoDetection: {
            hasGeoColumns: true,
            geoColumns: [
              {
                index: 0,
                columnName: 'code',
                type: 'iso3',
                confidence: 0.9
              }
            ],
            warnings: ['geo warning']
          },
          qualityIssues: [],
          performanceWarnings: [],
          suggestions: []
        } as DataAnalysisResult
      },
      originalFile
    );

    expect(processFileInternalMock).toHaveBeenCalledWith(
      { initialized: true },
      originalFile,
      { companionFiles: [companion] }
    );

    expect('datasets' in result).toBe(false);
    if (!('datasets' in result)) {
      expect(result.sourceFileId).toBe('up1');
      expect(result.name).toBe('roads.shp');
      expect(result.geoDetection?.hasGeoColumns).toBe(true);
      expect(result.analysis?.warnings).toContain('geo warning');
    }
  });

  it('processes uploaded file without original file (fallback path)', async () => {
    createCompanionFilesFromUploadMock.mockReturnValue([
      new File(['dbf'], 'roads.dbf')
    ]);

    const { dataPipeline } = await loadPipelineModule();

    const result = await dataPipeline.processUploadedFile(uploaded());

    expect(createFileFromUploadMock).toHaveBeenCalledTimes(1);
    expect(processFileInternalMock).toHaveBeenCalledWith(
      { initialized: true },
      expect.any(File),
      {
        companionFiles: [expect.any(File)]
      }
    );
    expect('datasets' in result).toBe(false);
  });

  it('remaps sourceFileId on zip multi-dataset uploaded result', async () => {
    isZipFileMock.mockReturnValue(true);
    processZipFileMock.mockResolvedValue({
      datasets: [dataset('a.csv')],
      sourceZipName: 'archive.zip',
      totalFiles: 1,
      processedFiles: 1,
      skippedFiles: []
    });

    const { dataPipeline } = await loadPipelineModule();

    const original = new File(['zip'], 'archive.zip', {
      type: 'application/zip'
    });
    const result = await dataPipeline.processUploadedFile(uploaded(), original);

    expect('datasets' in result).toBe(true);
    if ('datasets' in result) {
      expect(result.datasets[0].sourceFileId).toBe('up1');
    }
  });

  it('delegates remote processing methods', async () => {
    const { dataPipeline } = await loadPipelineModule();

    await dataPipeline.processRemoteFile('https://example.com/a.csv', {
      tableName: 'tbl'
    });
    await dataPipeline.processRemoteZipFile('https://example.com/a.zip');

    expect(processRemoteFileMock).toHaveBeenCalledWith(
      { initialized: true },
      'https://example.com/a.csv',
      { tableName: 'tbl' }
    );
    expect(processRemoteZipFileMock).toHaveBeenCalledWith(
      { initialized: true },
      'https://example.com/a.zip'
    );
  });

  it('processes pasted data through file creation then processFile', async () => {
    const { dataPipeline } = await loadPipelineModule();

    const result = await dataPipeline.processPastedData('a,b\n1,2', {
      name: 'paste.csv',
      type: 'text/csv'
    });

    expect(createFileFromUploadContentMock).toHaveBeenCalledWith(
      'a,b\n1,2',
      'paste.csv',
      'text/csv'
    );
    expect(processFileInternalMock).toHaveBeenCalledTimes(1);
    expect(result).toBeDefined();
  });

  it('delegates join and association operations to Duck API', async () => {
    duckMock.join_by_id.mockResolvedValue({ ok: true });
    duckMock.apply_join_association.mockResolvedValue(undefined);

    const { dataPipeline } = await loadPipelineModule();

    const join = await dataPipeline.joinDatasetById('tbl', 'id', {
      basemapsTable: 'base_tbl',
      basemapTable: 'base',
      basemapId: 'code',
      basemapOthersId: 'others'
    });

    await dataPipeline.applyJoinAssociation('tbl', 'world');

    expect(duckMock.join_by_id).toHaveBeenCalledWith('tbl', 'id', {
      basemaps_table: 'base_tbl',
      basemap_table: 'base',
      basemap_id: 'code',
      basemap_others_id: 'others'
    });
    expect(duckMock.apply_join_association).toHaveBeenCalledWith(
      'tbl',
      'world'
    );
    expect(join).toEqual({ ok: true });
  });

  it('resets state on destroy', async () => {
    const { dataPipeline } = await loadPipelineModule();

    await dataPipeline.initialize();
    expect(dataPipeline.initialized).toBe(true);

    await dataPipeline.destroy();
    expect(dataPipeline.initialized).toBe(false);
  });
});
