import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStatus } from '$lib/features/commons/constants/ui.constants';
import {
  DataSourceType,
  FileType,
  type UploadedFile
} from '$lib/features/commons/types/create-project.types';

const mocks = vi.hoisted(() => ({
  processUploadedFile: vi.fn(),
  isZipDatasetResult: vi.fn(),
  duckQuery: vi.fn(),
  analyzeDataContent: vi.fn()
}));

vi.mock('$lib/features/data-pipeline', () => ({
  dataPipeline: {
    processUploadedFile: mocks.processUploadedFile,
    processFile: mocks.processUploadedFile
  },
  isZipDatasetResult: mocks.isZipDatasetResult
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    query: mocks.duckQuery
  }
}));

vi.mock('$lib/features/commons/utils/deep-validator.utils', () => ({
  DeepDataValidator: {
    analyzeDataContent: mocks.analyzeDataContent
  }
}));

vi.mock('$lib/features/commons/utils/notification.utils.svelte', () => ({
  showWarning: vi.fn()
}));

import { createFileProcessorService } from '$lib/features/create-project/services/file-processor.service';

function makeUploadedFile(fileType: FileType): UploadedFile {
  return {
    id: 'source-gpx',
    name: 'track.gpx',
    size: 128,
    type: 'application/gpx+xml',
    fileType,
    status: FileStatus.UPLOADING,
    sourceType: DataSourceType.FILE_UPLOAD,
    uploadProgress: 0
  };
}

describe('createFileProcessorService geofile imports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isZipDatasetResult.mockReturnValue(false);
    mocks.processUploadedFile.mockResolvedValue({
      id: 'dataset-gpx',
      sourceFileId: 'source-gpx',
      name: 'track.gpx',
      tableName: 'track_gpx_table',
      rowCount: 1,
      columns: [
        {
          name: 'name',
          type: 'text',
          stats: {
            count: 1,
            nulls: 0,
            uniques: 1
          }
        }
      ],
      geometry: {
        type: 'Point',
        columnName: 'geom',
        bounds: [2.3, 48.8, 2.3, 48.8],
        centroid: [2.3, 48.8],
        featureCount: 1
      },
      metadata: {
        processedAt: new Date(),
        fileType: FileType.GPX
      }
    });
    mocks.duckQuery
      .mockResolvedValueOnce([{ name: 'Station' }])
      .mockResolvedValueOnce([
        {
          name: 'Station',
          __khartis_geometry_json: '{"type":"Point","coordinates":[2.3,48.8]}'
        }
      ]);
    mocks.analyzeDataContent.mockResolvedValue({
      rowCount: 1,
      columnCount: 1,
      columns: [],
      geoDetection: {
        hasGeoColumns: false,
        geoColumns: [],
        warnings: []
      },
      qualityIssues: [],
      performanceWarnings: [],
      suggestions: []
    });
  });

  it('preprocesses direct GPX uploads through the DuckDB data pipeline', async () => {
    const updates: Array<Partial<UploadedFile>> = [];
    const statuses: UploadedFile['status'][] = [];
    const uploadedFile = makeUploadedFile(FileType.GPX);
    const sourceFile = new File(
      [
        '<?xml version="1.0"?><gpx version="1.1"><wpt lat="48.8" lon="2.3"><name>Station</name></wpt></gpx>'
      ],
      'track.gpx',
      { type: 'application/gpx+xml' }
    );

    const service = createFileProcessorService({
      onProgress: vi.fn(),
      onStatusChange: (_fileId, status) => {
        statuses.push(status);
      },
      onDataUpdate: (_fileId, data) => {
        updates.push(data);
      }
    });

    await service.processFile(uploadedFile, sourceFile);

    expect(mocks.processUploadedFile).toHaveBeenCalledWith(
      uploadedFile,
      sourceFile
    );
    expect(mocks.duckQuery).toHaveBeenCalledWith(
      'SELECT * FROM "track_gpx_table" LIMIT 100',
      { format: 'array' }
    );
    expect(updates).toContainEqual(
      expect.objectContaining({
        duckdbTableName: 'track_gpx_table',
        parsedData: [{ name: 'Station' }],
        preparedGeoJSON: expect.stringContaining('FeatureCollection')
      })
    );
    const preparedGeoJSON = updates.find((update) => update.preparedGeoJSON)
      ?.preparedGeoJSON as string;
    expect(JSON.parse(preparedGeoJSON).features[0]).toMatchObject({
      geometry: { type: 'Point', coordinates: [2.3, 48.8] },
      properties: { name: 'Station' }
    });
    expect(
      updates.some(
        (update) => update.deepAnalysis?.geoDetection.hasGeoColumns === true
      )
    ).toBe(true);
    expect(statuses).toContain(FileStatus.COMPLETE);
  });
});
