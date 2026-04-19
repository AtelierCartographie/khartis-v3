import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStatus } from '$lib/features/commons/constants/ui.constants';
import {
  DataSourceType,
  FileType
} from '$lib/features/commons/store/create-project.types';

const mocks = vi.hoisted(() => ({
  registerMock: vi.fn(),
  notifyChangeMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  processUploadedFileMock: vi.fn(),
  dropTableMock: vi.fn(),
  setEnrichDataStateMock: vi.fn(),
  currentProject: undefined as
    | {
        data: {
          sourceFiles: Array<Record<string, unknown>>;
        };
      }
    | undefined
}));

vi.mock('$lib/features/project-management/core/persistence-registry', () => ({
  persistenceRegistry: {
    register: mocks.registerMock,
    notifyChange: mocks.notifyChangeMock
  },
  SavePriority: {
    IMMEDIATE: 'immediate',
    DEBOUNCED: 'debounced'
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  logger: {
    warn: mocks.loggerWarnMock,
    debug: mocks.loggerDebugMock,
    error: mocks.loggerErrorMock,
    info: mocks.loggerInfoMock
  },
  LogCategory: {
    STORE: 'STORE',
    DATA: 'DATA',
    PROJECT: 'PROJECT',
    DUCKDB: 'DUCKDB'
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    dropTable: mocks.dropTableMock
  }
}));

vi.mock('$lib/features/commons/store/project.store.svelte', () => ({
  projectStore: {
    get currentProject() {
      return mocks.currentProject;
    }
  }
}));

vi.mock('$lib/features/commons/store/data-tab.store.svelte', () => ({
  dataTabActions: {
    setEnrichDataState: mocks.setEnrichDataStateMock
  }
}));

vi.mock('$lib/features/data-pipeline', () => ({
  ColumnType: {
    TEXT: 'text'
  },
  computeCentroid: vi.fn(() => [0, 0]),
  dataPipeline: {
    processUploadedFile: mocks.processUploadedFileMock
  },
  isZipDatasetResult: vi.fn(() => false)
}));

vi.mock('$lib/paraglide/messages', () => ({}));
vi.mock('$lib/features/commons/utils/notification.utils.svelte', () => ({
  showWarning: vi.fn()
}));

import { datasetsStore } from './datasets.store.svelte';

function makeDataset(id: string, sourceFileId = `source-${id}`) {
  return {
    id,
    name: `Dataset ${id}`,
    sourceFileId,
    tableName: `table_${id}`,
    columns: [],
    rowCount: 1,
    metadata: {
      processedAt: new Date(),
      fileType: 'geojson',
      parserUsed: 'test'
    }
  };
}

function makeUploadedFile(
  id: string,
  name = `${id}.geojson`,
  overrides: Record<string, unknown> = {}
) {
  return {
    id,
    name,
    size: 1,
    type: 'application/geo+json',
    fileType: FileType.GEOJSON,
    status: FileStatus.COMPLETE,
    uploadProgress: 100,
    sourceType: DataSourceType.FILE_UPLOAD,
    content: '{"type":"FeatureCollection","features":[]}',
    ...overrides
  };
}

describe('datasetsStore persisted view state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentProject = undefined;
    datasetsStore.clear();
    datasetsStore.restorePersistedViewState(undefined);
  });

  it('serializes the pending persisted view while datasets are still restoring', () => {
    datasetsStore.restorePersistedViewState({
      enabledSourceFileIds: ['source-a'],
      hiddenColumnsBySourceFileId: {
        'source-a': ['population']
      },
      simplificationBySourceFileId: {
        'source-a': 250
      }
    });

    expect(datasetsStore.serializePersistedViewState()).toEqual({
      enabledSourceFileIds: ['source-a'],
      hiddenColumnsBySourceFileId: {
        'source-a': ['population']
      },
      simplificationBySourceFileId: {
        'source-a': 250
      }
    });
  });

  it('re-enables the only dataset when persisted visibility restores an empty map', () => {
    datasetsStore.addProcessedDataset(makeDataset('dataset-1'));
    datasetsStore.restorePersistedViewState({
      enabledSourceFileIds: [],
      hiddenColumnsBySourceFileId: {},
      simplificationBySourceFileId: {}
    });

    datasetsStore.applyPersistedViewState();

    expect(datasetsStore.enabledDatasets.map((dataset) => dataset.id)).toEqual([
      'dataset-1'
    ]);
    expect(mocks.loggerWarnMock).toHaveBeenCalledWith(
      'Persisted datasets view restored with no visible dataset, re-enabling the only dataset',
      'STORE',
      {
        datasetId: 'dataset-1',
        sourceFileId: 'source-dataset-1'
      }
    );
  });

  it('keeps the dataset enabled when the same source file is restored with a new dataset id', async () => {
    mocks.processUploadedFileMock
      .mockResolvedValueOnce(makeDataset('dataset-1', 'source-a'))
      .mockResolvedValueOnce(makeDataset('dataset-2', 'source-a'));

    await datasetsStore.addFile(makeUploadedFile('source-a'), true);
    await datasetsStore.addFile(makeUploadedFile('source-a'), false);

    expect(datasetsStore.datasets.map((dataset) => dataset.id)).toEqual([
      'dataset-2'
    ]);
    expect(datasetsStore.enabledDatasets.map((dataset) => dataset.id)).toEqual([
      'dataset-2'
    ]);
    expect(datasetsStore.selectedDatasetId).toBe('dataset-2');
  });

  it('replays the pipeline from asset refs instead of exposing a stale preprocessed table', async () => {
    mocks.processUploadedFileMock.mockResolvedValueOnce(
      makeDataset('dataset-asset', 'source-asset')
    );

    await datasetsStore.addFile(
      makeUploadedFile('source-asset', 'data.csv', {
        content: undefined,
        type: 'text/csv',
        fileType: FileType.CSV,
        duckdbTableName: 'legacy_data_csv_123',
        parsedData: [{ country: 'France' }],
        statistics: {
          country: {
            type: 'text',
            count: 1
          }
        },
        assetRef: {
          assetId: 'asset-1',
          originalName: 'data.csv',
          mimeType: 'text/csv',
          size: 16,
          kind: 'primary'
        }
      }),
      true
    );

    expect(mocks.processUploadedFileMock).toHaveBeenCalledTimes(1);
    expect(datasetsStore.datasets.map((dataset) => dataset.id)).toEqual([
      'dataset-asset'
    ]);
    expect(datasetsStore.datasets[0]?.tableName).toBe('table_dataset-asset');
  });

  it('treats persisted source-file row deletions and column transformations as modifications after restore', () => {
    datasetsStore.addProcessedDataset(makeDataset('dataset-1', 'source-a'));
    mocks.currentProject = {
      data: {
        sourceFiles: [
          makeUploadedFile('source-a', 'data.csv', {
            columnTransformations: [
              {
                type: 'rename',
                column: 'place_name',
                newValue: 'city_name',
                timestamp: '2026-04-18T00:00:00.000Z'
              }
            ],
            deletedRowIds: [1, 3, 8]
          })
        ]
      }
    };

    expect(datasetsStore.hasModifications('dataset-1')).toBe(true);
  });
});
