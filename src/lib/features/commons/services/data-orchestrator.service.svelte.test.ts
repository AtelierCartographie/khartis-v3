import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activeVisualizations: [] as Array<Record<string, unknown>>,
  addFile: vi.fn(),
  calculateBreaks: vi.fn(),
  createFileFromUpload: vi.fn(),
  currentProject: undefined as Record<string, unknown> | undefined,
  datasets: [] as Array<Record<string, unknown>>,
  deserializeAll: vi.fn(),
  duckClear: vi.fn(),
  duckProcessFile: vi.fn(),
  duckRegisterExistingTable: vi.fn(),
  duckWaitForInitialization: vi.fn<() => Promise<void>>(),
  isCurrentProjectRuntime: true,
  loggerError: vi.fn(),
  showWarning: vi.fn(),
  updateClassification: vi.fn()
}));

vi.unmock('$lib/features/commons/services/data-orchestrator.service.svelte');
vi.unmock('./data-orchestrator.service.svelte');

vi.mock('$lib/features/data-pipeline', () => ({
  createFileFromUpload: mocks.createFileFromUpload,
  dataPipeline: {},
  isZipDatasetResult: vi.fn(() => false)
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: null,
  RefineOperation: {
    MERGE: 'merge'
  },
  duckDBOrchestrator: {
    applyPersistedTableFilters: vi.fn(),
    beginBatch: vi.fn(),
    clear: mocks.duckClear,
    endBatch: vi.fn(),
    getDataset: vi.fn(),
    getDatasetBySourceFile: vi.fn(),
    processFile: mocks.duckProcessFile,
    registerExistingTable: mocks.duckRegisterExistingTable,
    updateDatasetJoinInfo: vi.fn(),
    waitForInitialization: mocks.duckWaitForInitialization
  }
}));

vi.mock('$lib/features/project-management/core', () => ({
  persistenceRegistry: {
    deserializeAll: mocks.deserializeAll,
    markClean: vi.fn(),
    register: vi.fn(),
    withPersistenceSuspended: vi.fn(async (callback: () => Promise<void>) =>
      callback()
    )
  }
}));

vi.mock(
  '$lib/features/project-management/services/asset-store.service',
  () => ({
    createCompanionFilesFromAssetRefs: vi.fn()
  })
);

vi.mock('$lib/features/step-toolbar/tools/facets', () => ({
  facetsStore: {
    restoreGeneratedVisualizations: vi.fn()
  }
}));

vi.mock('$lib/features/step-toolbar/tools/layers', () => ({
  layersActions: {
    reset: vi.fn(),
    syncWithVisualizations: vi.fn()
  }
}));

vi.mock('$lib/features/step-toolbar/tools/legend', () => ({
  legendActions: {
    syncWithVisualizations: vi.fn()
  }
}));

vi.mock('$lib/features/step-toolbar/tools/projections', () => ({
  projectionActions: {
    setState: vi.fn()
  }
}));

vi.mock('../stores/data-tab.store.svelte', () => ({
  dataTabActions: {
    setGeolocationState: vi.fn(),
    setJoinStats: vi.fn()
  },
  dataTabState: {
    basemapJoin: {
      ignoredEntities: [] as Array<{ dataValue: string }>
    },
    geolocation: {
      linkedVariableName: ''
    }
  }
}));

vi.mock('../stores/datasets.store.svelte', () => ({
  datasetsStore: {
    addFile: mocks.addFile,
    applyPersistedViewState: vi.fn(),
    clear: vi.fn(),
    get datasets() {
      return mocks.datasets;
    },
    getAllDatasets: vi.fn(() => mocks.datasets),
    getDatasetBySourceFile: vi.fn(),
    removeDataset: vi.fn(),
    updateDataset: vi.fn(),
    updateDatasetRowCount: vi.fn(),
    updateDatasetTableName: vi.fn()
  }
}));

vi.mock('../stores/global.svelte', () => ({
  globalActions: {
    ensureTabSelected: vi.fn()
  },
  globalState: {
    selectedDataButtonId: undefined
  }
}));

vi.mock('../stores/project.store.svelte', () => ({
  projectStore: {
    get currentProject() {
      return mocks.currentProject;
    },
    waitForInit: vi.fn(async () => undefined)
  }
}));

vi.mock('$lib/features/data-tab/stores/data-tab.store.svelte', () => ({
  dataTabStore: {
    basemapStepIndex: -1,
    markStepComplete: vi.fn(),
    resetStepCompletion: vi.fn()
  }
}));

vi.mock('../stores/project/project-runtime.svelte', () => ({
  captureProjectRuntime: vi.fn(() => ({ projectId: 'project-1' })),
  isCurrentProjectRuntime: vi.fn(() => mocks.isCurrentProjectRuntime)
}));

vi.mock('../stores/visualization.store.svelte', () => ({
  ClassificationMethod: {
    EQUAL_INTERVAL: 'equal_interval',
    HEAD_TAIL: 'head_tail',
    KMEANS: 'kmeans',
    MANUAL: 'manual',
    NESTED_MEANS: 'nested_means',
    Q6: 'q6',
    QUANTILES: 'quantiles'
  },
  visualizationStore: {
    clear: vi.fn(() => {
      mocks.activeVisualizations = [];
    }),
    get activeVisualizations() {
      return mocks.activeVisualizations;
    },
    get visualizations() {
      return mocks.activeVisualizations;
    },
    getVisualizationsByDataset: vi.fn(() => []),
    removeVisualization: vi.fn(),
    restoreFromSerialized: vi.fn((settings: Array<Record<string, unknown>>) => {
      mocks.activeVisualizations = [...settings];
    }),
    updateClassification: mocks.updateClassification,
    updateVisualization: vi.fn()
  }
}));

vi.mock('../utils/logger', () => ({
  LogCategory: {
    DATA: 'DATA'
  },
  logger: {
    error: mocks.loggerError
  }
}));

vi.mock('../utils/notification.utils.svelte', () => ({
  notificationManager: {
    error: vi.fn()
  },
  showError: vi.fn(),
  showWarning: mocks.showWarning
}));

vi.mock('$lib/features/map/services/basemap-catalog.service.svelte', () => ({
  basemapCatalogService: {
    getBasemapById: vi.fn(),
    loadCatalog: vi.fn(async () => undefined)
  }
}));

vi.mock('$lib/features/map/services/dataset-geometry-basemap.service', () => ({
  ensureDatasetGeometryBasemap: vi.fn(async () => undefined),
  forgetDatasetGeometryBasemap: vi.fn()
}));

vi.mock('./import-rollback.service', () => ({
  importRollbackService: {
    createSnapshot: vi.fn(),
    rollback: vi.fn(),
    rollbackAll: vi.fn()
  }
}));

vi.mock('./classification.service', () => ({
  applyPaletteInversion: vi.fn((colors: string[]) => colors),
  calculateBreaks: mocks.calculateBreaks,
  calculateDivergingBreaks: vi.fn(),
  computeDivergingSplit: vi.fn(),
  generateColorsForBreaks: vi.fn((classCount: number) =>
    Array.from({ length: classCount }, (_, index) => `#00000${index}`)
  )
}));

vi.mock('$lib/features/step-toolbar/tools/color-blindness', () => ({
  getColorBlindnessState: vi.fn(() => undefined),
  isColorBlindnessActive: vi.fn(() => false)
}));

function makeClassedVisualization(id: string, datasetId: string) {
  return {
    id,
    name: id,
    type: 'choropleth',
    datasetId,
    enabled: true,
    modes: {
      fill: 'classes'
    },
    mapping: {
      valueColumn: 'value'
    },
    classification: {
      method: 'equal_interval',
      classes: 3
    },
    style: {}
  };
}

async function loadService() {
  vi.resetModules();
  return import('$lib/features/commons/services/data-orchestrator.service.svelte');
}

describe('dataOrchestratorService restore fallbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.duckClear.mockResolvedValue(undefined);
    mocks.duckWaitForInitialization.mockResolvedValue(undefined);
    mocks.isCurrentProjectRuntime = true;
    mocks.createFileFromUpload.mockResolvedValue(new File([], 'restored.csv'));
    mocks.activeVisualizations = [];
    mocks.datasets = [
      { id: 'dataset-failing', sourceFileId: 'source-failing' },
      { id: 'dataset-restored', sourceFileId: 'source-restored' }
    ];
    mocks.currentProject = {
      id: 'project-1',
      manifest: {
        name: 'Project'
      },
      data: {
        sourceFiles: [],
        visualizationSettings: [
          makeClassedVisualization('failing-viz', 'dataset-failing'),
          makeClassedVisualization('restored-viz', 'dataset-restored')
        ]
      }
    };
  });

  it('continues restoring visualizations when one classification recompute fails', async () => {
    mocks.calculateBreaks
      .mockRejectedValueOnce(new Error('breaks unavailable'))
      .mockResolvedValueOnce({
        breaks: [0, 10, 20],
        counts: [2, 3, 4]
      });
    const { dataOrchestratorService } = await loadService();

    await dataOrchestratorService.onProjectChanged();

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to recompute visualization breaks during project restore',
      'DATA',
      expect.any(Error),
      expect.objectContaining({
        flow: 'project_restore',
        extra: expect.objectContaining({
          visualizationId: 'failing-viz'
        })
      })
    );
    expect(mocks.showWarning).toHaveBeenCalledTimes(1);
    expect(mocks.updateClassification).toHaveBeenCalledWith(
      'restored-viz',
      expect.objectContaining({
        breaks: [0, 10, 20],
        counts: [2, 3, 4]
      })
    );
  });

  it('warns when a saved source file cannot be recreated during restore', async () => {
    mocks.currentProject = {
      id: 'project-1',
      manifest: {
        name: 'Project'
      },
      data: {
        sourceFiles: [
          {
            id: 'file-1',
            name: 'broken.csv',
            fileType: 'csv',
            content: new ArrayBuffer(1)
          }
        ]
      }
    };
    mocks.createFileFromUpload.mockRejectedValueOnce(
      new Error('decode failed')
    );
    const { dataOrchestratorService } = await loadService();

    await dataOrchestratorService.onProjectChanged();

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Failed to recreate source file during project restore',
      'DATA',
      expect.any(Error),
      expect.objectContaining({
        flow: 'project_restore',
        extra: expect.objectContaining({
          fileId: 'file-1',
          fileName: 'broken.csv'
        })
      })
    );
    expect(mocks.showWarning).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('broken.csv')
    );
  });

  it('should fail promptly when a joined source file cannot restore its dataset', async () => {
    mocks.currentProject = {
      id: 'project-1',
      manifest: {
        name: 'Project'
      },
      data: {
        sourceFiles: [
          {
            id: 'file-joined',
            name: 'broken-joined.csv',
            fileType: 'csv',
            content: new ArrayBuffer(1),
            geoColumn: 'country',
            joinedBasemap: 'world-countries'
          }
        ]
      }
    };
    mocks.createFileFromUpload.mockRejectedValueOnce(
      new Error('decode failed')
    );
    const { dataOrchestratorService } = await loadService();

    await expect(dataOrchestratorService.onProjectChanged()).rejects.toThrow(
      'Failed to restore dataset for source file file-joined'
    );
  });

  it('should ignore a stale project change after DuckDB becomes ready', async () => {
    let finishDuckDbInitialization: (() => void) | undefined;
    mocks.duckWaitForInitialization.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishDuckDbInitialization = resolve;
        })
    );
    const { dataOrchestratorService } = await loadService();

    const projectChange = dataOrchestratorService.onProjectChanged();
    await Promise.resolve();
    mocks.isCurrentProjectRuntime = false;
    finishDuckDbInitialization?.();
    await projectChange;

    expect(mocks.duckClear).not.toHaveBeenCalled();
  });

  it('restores saved basemap style settings during project restore', async () => {
    const basemapStyleSettings = {
      style: 'blank-white',
      referenceBasemapId: 'europe-nuts1-2024-medium'
    };
    mocks.currentProject = {
      id: 'project-1',
      manifest: {
        name: 'Project'
      },
      data: {
        sourceFiles: [],
        basemapSettings: {
          ...basemapStyleSettings,
          layers: [],
          mapProjection: 'mercator'
        }
      }
    };
    const { dataOrchestratorService } = await loadService();

    await dataOrchestratorService.onProjectChanged();

    expect(mocks.deserializeAll).toHaveBeenCalledWith({
      basemapStyle: basemapStyleSettings
    });
  });
});

describe('dataOrchestratorService creation fast-path', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.duckClear.mockResolvedValue(undefined);
    mocks.duckWaitForInitialization.mockResolvedValue(undefined);
    mocks.isCurrentProjectRuntime = true;
    mocks.activeVisualizations = [];
    mocks.datasets = [];
    mocks.createFileFromUpload.mockResolvedValue(new File([], 'data.csv'));
    mocks.addFile.mockResolvedValue({
      id: 'dataset-1',
      sourceFileId: 'file-1',
      tableName: 'data_file_1',
      columns: [],
      rowCount: 2,
      metadata: {}
    });
    mocks.duckRegisterExistingTable.mockResolvedValue({
      id: 'duck-1',
      tableName: 'data_file_1',
      sourceFileId: 'file-1'
    });
    mocks.currentProject = {
      id: 'project-1',
      manifest: {
        name: 'Project'
      },
      data: {
        sourceFiles: [
          {
            id: 'file-1',
            name: 'data.csv',
            fileType: 'csv',
            status: 'complete',
            content: 'a,b\n1,2',
            duckdbTableName: 'data_file_1'
          }
        ]
      }
    };
  });

  it('should preserve fresh tables and reuse them without re-import when created', async () => {
    const { dataOrchestratorService } = await loadService();
    const { duckDBOrchestrator } = await import('$lib/features/duckdb');

    await dataOrchestratorService.onProjectChanged({ isProjectCreation: true });

    expect(duckDBOrchestrator.clear).toHaveBeenCalledWith({
      preserveTableNames: ['data_file_1']
    });
    expect(mocks.duckRegisterExistingTable).toHaveBeenCalledWith(
      'data_file_1',
      'file-1',
      'data.csv',
      expect.objectContaining({ preferredDatasetId: 'dataset-1' })
    );
    expect(mocks.duckProcessFile).not.toHaveBeenCalled();
  });

  it('should keep the full clear when the project change is not a creation', async () => {
    const { dataOrchestratorService } = await loadService();
    const { duckDBOrchestrator } = await import('$lib/features/duckdb');

    await dataOrchestratorService.onProjectChanged();

    expect(duckDBOrchestrator.clear).toHaveBeenCalledWith(undefined);
  });
});
