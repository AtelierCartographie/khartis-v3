import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentProject: null as {
    data?: {
      sourceFiles?: Array<Record<string, unknown>>;
    };
  } | null,
  processUploadedFileMock: vi.fn(),
  duckQueryMock: vi.fn(),
  dropTableMock: vi.fn(),
  clearFiltersMock: vi.fn(),
  bumpDatasetsVersionMock: vi.fn(),
  registerExistingTableMock: vi.fn(),
  finalizeJoinMock: vi.fn(),
  addVirtualSourceFileMock: vi.fn(),
  clearColumnTransformationsMock: vi.fn(),
  loadBasemapCatalogMock: vi.fn(),
  getBasemapByIdMock: vi.fn(),
  getVisualizationsByDatasetMock: vi.fn(),
  duplicateVisualizationMock: vi.fn(),
  startProcessingMock: vi.fn(),
  endProcessingMock: vi.fn(),
  randomUUIDMock: vi.fn()
}));

vi.mock('$lib/features/data-pipeline', () => ({
  dataPipeline: {
    processUploadedFile: mocks.processUploadedFileMock
  },
  isZipDatasetResult: vi.fn(() => false)
}));

vi.mock('$lib/paraglide/messages', () => ({
  copy_suffix: () => ' (copie)'
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    STORE: 'STORE'
  },
  logger: {
    warn: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {
    query: mocks.duckQueryMock
  }
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    dropTable: mocks.dropTableMock,
    clearFilters: mocks.clearFiltersMock,
    bumpDatasetsVersion: mocks.bumpDatasetsVersionMock,
    registerExistingTable: mocks.registerExistingTableMock,
    finalizeJoin: mocks.finalizeJoinMock
  }
}));

vi.mock('$lib/features/map/services/basemap-catalog.service.svelte', () => ({
  basemapCatalogService: {
    loadCatalog: mocks.loadBasemapCatalogMock,
    getBasemapById: mocks.getBasemapByIdMock
  }
}));

vi.mock('$lib/features/commons/store/project.store.svelte', () => ({
  projectStore: {
    get currentProject() {
      return mocks.currentProject;
    },
    addVirtualSourceFile: mocks.addVirtualSourceFileMock,
    clearColumnTransformations: mocks.clearColumnTransformationsMock
  }
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: {
    getVisualizationsByDataset: mocks.getVisualizationsByDatasetMock,
    duplicateVisualization: mocks.duplicateVisualizationMock
  }
}));

vi.mock('$lib/features/commons/store/datasets/datasets-state.svelte', () => ({
  startProcessing: mocks.startProcessingMock,
  endProcessing: mocks.endProcessingMock
}));

import {
  DataSourceType,
  FileStatus,
  FileType
} from '$lib/features/commons/store/create-project.types';
import {
  duplicateDataset,
  resetDataset
} from '$lib/features/commons/store/datasets/datasets-operations';
import type { DatasetsState } from '$lib/features/commons/store/datasets/datasets-state.svelte';
import { ColumnType } from '$lib/features/data-pipeline/types';
import { SvelteSet } from 'svelte/reactivity';

describe('duplicateDataset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', {
      randomUUID: mocks.randomUUIDMock
    });

    mocks.randomUUIDMock
      .mockReturnValueOnce('new-dataset-id')
      .mockReturnValueOnce('new-file-id');
    mocks.duckQueryMock.mockResolvedValue(undefined);
    mocks.registerExistingTableMock.mockResolvedValue(undefined);
    mocks.getVisualizationsByDatasetMock.mockReturnValue([]);
    mocks.currentProject = {
      data: {
        sourceFiles: [
          {
            id: 'source-file-id',
            name: 'renamed-source.csv',
            size: 128,
            type: 'text/csv',
            fileType: FileType.CSV,
            status: FileStatus.COMPLETE,
            sourceType: DataSourceType.URL,
            content: 'entity,value\nFrance,1\nGermany,2',
            parsedData: [
              { entity: 'France', value: 1 },
              { entity: 'Germany', value: 2 }
            ],
            statistics: {
              entity: {
                type: 'text',
                count: 2,
                nullCount: 0,
                unique: 2
              },
              value: {
                type: 'number',
                count: 2,
                nullCount: 0,
                unique: 2,
                min: 1,
                max: 2,
                mean: 1.5
              }
            },
            columnTransformations: [
              {
                type: 'rename',
                column: 'old_name',
                newValue: 'new_name',
                timestamp: '2026-04-03T00:00:00.000Z'
              }
            ],
            deletedRowIds: [7],
            joinedBasemap: 'monde-countries-2024-medium',
            geoColumn: 'code'
          }
        ]
      }
    };
  });

  it('creates a restorable virtual copy from the renamed source file payload', async () => {
    const state: DatasetsState = {
      datasets: [
        {
          id: 'dataset-id',
          name: 'fossil-fuel-subsidies-gdp-2021.csv',
          sourceFileId: 'source-file-id',
          tableName: 'source_table',
          columns: [
            {
              name: 'entity',
              type: ColumnType.TEXT,
              values: [],
              stats: {
                name: 'entity',
                type: ColumnType.TEXT,
                count: 2,
                nulls: 0,
                uniques: 2
              }
            },
            {
              name: 'value',
              type: ColumnType.NUMBER,
              values: [],
              stats: {
                name: 'value',
                type: ColumnType.NUMBER,
                count: 2,
                nulls: 0,
                uniques: 2,
                min: 1,
                max: 2,
                mean: 1.5
              }
            }
          ],
          rowCount: 2,
          metadata: {
            processedAt: new Date('2026-04-03T00:00:00.000Z'),
            fileType: FileType.CSV,
            parserUsed: 'csv',
            transformations: []
          },
          data: [
            { entity: 'France', value: 1 },
            { entity: 'Germany', value: 2 }
          ]
        }
      ],
      enabledDatasetIds: new SvelteSet<string>(),
      isProcessing: false,
      hiddenColumns: new Map<string, Set<string>>()
    };

    const newDatasetId = await duplicateDataset(state, 'dataset-id');

    expect(newDatasetId).toBe('new-dataset-id');
    expect(mocks.duckQueryMock).toHaveBeenCalledWith(
      'CREATE TABLE "dataset_new_dataset_id" AS SELECT * FROM "source_table"'
    );
    expect(mocks.addVirtualSourceFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-file-id',
        name: 'renamed-source.csv (copie)',
        sourceType: DataSourceType.COPY,
        isVirtualCopy: true,
        originalSourceFileId: 'source-file-id',
        datasetId: 'new-dataset-id',
        duckdbTableName: 'dataset_new_dataset_id',
        content: 'entity,value\nFrance,1\nGermany,2',
        parsedData: [
          { entity: 'France', value: 1 },
          { entity: 'Germany', value: 2 }
        ],
        statistics: {
          entity: {
            type: 'text',
            count: 2,
            nullCount: 0,
            unique: 2
          },
          value: {
            type: 'number',
            count: 2,
            nullCount: 0,
            unique: 2,
            min: 1,
            max: 2,
            mean: 1.5
          }
        },
        columnTransformations: [
          {
            type: 'rename',
            column: 'old_name',
            newValue: 'new_name',
            timestamp: '2026-04-03T00:00:00.000Z'
          }
        ],
        deletedRowIds: [7],
        joinedBasemap: 'monde-countries-2024-medium',
        geoColumn: 'code'
      })
    );
    expect(mocks.registerExistingTableMock).toHaveBeenCalledWith(
      'dataset_new_dataset_id',
      'new-file-id',
      'renamed-source.csv (copie)',
      {
        geoDetection: undefined
      }
    );
    expect(state.datasets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'new-dataset-id',
          name: 'renamed-source.csv (copie)',
          sourceFileId: 'new-file-id',
          tableName: 'dataset_new_dataset_id'
        })
      ])
    );
    expect(state.enabledDatasetIds.has('new-dataset-id')).toBe(true);
  });
});

describe('resetDataset', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.dropTableMock.mockResolvedValue(undefined);
    mocks.clearFiltersMock.mockReturnValue(undefined);
    mocks.bumpDatasetsVersionMock.mockReturnValue(undefined);
    mocks.registerExistingTableMock.mockResolvedValue({
      id: 'duck-dataset-id',
      tableName: 'table_reset'
    });
    mocks.finalizeJoinMock.mockResolvedValue(undefined);
    mocks.clearColumnTransformationsMock.mockResolvedValue(undefined);
    mocks.loadBasemapCatalogMock.mockResolvedValue(undefined);
    mocks.getBasemapByIdMock.mockReturnValue({
      file: 'monde-countries-2024-medium'
    });

    mocks.currentProject = {
      data: {
        sourceFiles: [
          {
            id: 'source-file-id',
            name: 'fossil-fuel-subsidies-gdp-2021.csv',
            size: 128,
            type: 'text/csv',
            fileType: FileType.CSV,
            status: FileStatus.COMPLETE,
            sourceType: DataSourceType.URL,
            content: 'entity,code\nFrance,FRA',
            joinedBasemap: 'monde-countries-2024-medium',
            geoColumn: 'code',
            duckdbTableName: 'table_old',
            deletedRowIds: [7],
            columnTransformations: [
              {
                type: 'rename',
                column: 'legacy_code',
                newValue: 'code',
                timestamp: '2026-04-03T00:00:00.000Z'
              }
            ]
          }
        ]
      }
    };

    mocks.processUploadedFileMock.mockResolvedValue({
      id: 'new-generated-id',
      name: 'fossil-fuel-subsidies-gdp-2021.csv',
      sourceFileId: 'source-file-id',
      tableName: 'table_reset',
      columns: [
        {
          name: 'entity',
          type: ColumnType.TEXT,
          values: []
        },
        {
          name: 'code',
          type: ColumnType.TEXT,
          values: []
        }
      ],
      rowCount: 81,
      metadata: {
        processedAt: new Date('2026-04-03T00:00:00.000Z'),
        fileType: FileType.CSV,
        parserUsed: 'csv',
        transformations: []
      },
      geoDetection: {
        geoColumns: [
          {
            index: 1,
            columnName: 'code',
            type: 'iso3',
            confidence: 0.98
          }
        ],
        warnings: []
      }
    });
  });

  it('rebuilds the dataset in place and preserves join metadata while swapping tables', async () => {
    const state: DatasetsState = {
      datasets: [
        {
          id: 'dataset-id',
          name: 'fossil-fuel-subsidies-gdp-2021.csv',
          sourceFileId: 'source-file-id',
          tableName: 'table_old',
          columns: [
            {
              name: 'entity',
              type: ColumnType.TEXT,
              values: [],
              stats: {
                name: 'entity',
                type: ColumnType.TEXT,
                count: 80,
                nulls: 0,
                uniques: 80
              }
            },
            {
              name: 'code',
              type: ColumnType.TEXT,
              values: [],
              stats: {
                name: 'code',
                type: ColumnType.TEXT,
                count: 80,
                nulls: 0,
                uniques: 80
              }
            },
            {
              name: 'audit_index',
              type: ColumnType.NUMBER,
              values: [],
              stats: {
                name: 'audit_index',
                type: ColumnType.NUMBER,
                count: 80,
                nulls: 0,
                uniques: 80
              }
            }
          ],
          rowCount: 80,
          metadata: {
            processedAt: new Date('2026-04-03T00:00:00.000Z'),
            fileType: FileType.CSV,
            parserUsed: 'csv',
            transformations: ['Deleted 1 row']
          },
          joinedBasemap: 'monde-countries-2024-medium',
          geoColumn: 'code'
        }
      ],
      enabledDatasetIds: new SvelteSet<string>(),
      isProcessing: false,
      hiddenColumns: new Map<string, Set<string>>()
    };

    const success = await resetDataset(state, 'dataset-id');

    expect(success).toBe(true);
    expect(mocks.processUploadedFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'source-file-id',
        joinedBasemap: 'monde-countries-2024-medium',
        geoColumn: 'code'
      }),
      undefined
    );
    expect(state.datasets).toEqual([
      expect.objectContaining({
        id: 'dataset-id',
        tableName: 'table_reset',
        rowCount: 81,
        joinedBasemap: 'monde-countries-2024-medium',
        geoColumn: 'code'
      })
    ]);
    expect(mocks.registerExistingTableMock).toHaveBeenCalledWith(
      'table_reset',
      'source-file-id',
      'fossil-fuel-subsidies-gdp-2021.csv',
      {
        geoDetection: expect.objectContaining({
          geoColumns: expect.any(Array)
        }),
        preserveExistingJoinState: false
      }
    );
    expect(mocks.loadBasemapCatalogMock).toHaveBeenCalled();
    expect(mocks.getBasemapByIdMock).toHaveBeenCalledWith(
      'monde-countries-2024-medium'
    );
    expect(mocks.finalizeJoinMock).toHaveBeenCalledWith(
      'duck-dataset-id',
      expect.objectContaining({
        file: 'monde-countries-2024-medium'
      }),
      'code'
    );
    expect(mocks.clearFiltersMock).toHaveBeenCalledWith('table_old');
    expect(mocks.dropTableMock).toHaveBeenCalledWith('table_old');
    expect(mocks.clearColumnTransformationsMock).toHaveBeenCalledWith(
      'source-file-id',
      expect.objectContaining({
        duckdbTableName: 'table_reset',
        joinedBasemap: 'monde-countries-2024-medium',
        geoColumn: 'code'
      })
    );
    expect(mocks.bumpDatasetsVersionMock).toHaveBeenCalled();
    expect(mocks.startProcessingMock).toHaveBeenCalled();
    expect(mocks.endProcessingMock).toHaveBeenCalled();
  });
});
