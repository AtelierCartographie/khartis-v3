import { beforeEach, describe, expect, it, vi } from 'vitest';

const operationLog = vi.hoisted((): string[] => []);
const currentProjectState = vi.hoisted(() => ({
  value: undefined as unknown
}));

const waitForInitializationMock = vi.hoisted(() =>
  vi.fn(async () => {
    operationLog.push('waitForInitialization');
  })
);
const beginBatchMock = vi.hoisted(() =>
  vi.fn(() => {
    operationLog.push('beginBatch');
  })
);
const clearDuckDbMock = vi.hoisted(() =>
  vi.fn(async () => {
    operationLog.push('clearDuckDb');
  })
);
const endBatchMock = vi.hoisted(() =>
  vi.fn(() => {
    operationLog.push('endBatch');
  })
);
const clearVisualizationMock = vi.hoisted(() =>
  vi.fn(() => {
    operationLog.push('clearVisualizations');
  })
);
const restoreVisualizationMock = vi.hoisted(() =>
  vi.fn(() => {
    operationLog.push('restoreVisualizations');
  })
);
const datasetsClearMock = vi.hoisted(() =>
  vi.fn(() => {
    operationLog.push('clearDatasets');
  })
);
const applyPersistedViewStateMock = vi.hoisted(() =>
  vi.fn(() => {
    operationLog.push('applyPersistedViewState');
  })
);
const addFileMock = vi.hoisted(() =>
  vi.fn(async () => {
    operationLog.push('addFile');
    return {
      id: 'dataset-1',
      sourceFileId: 'file-1',
      name: 'demo',
      columns: [],
      metadata: {}
    };
  })
);
const layersResetMock = vi.hoisted(() =>
  vi.fn(() => {
    operationLog.push('layersReset');
  })
);
const layersSyncMock = vi.hoisted(() =>
  vi.fn(() => {
    operationLog.push('layersSync');
  })
);
const projectionResetMock = vi.hoisted(() =>
  vi.fn(() => {
    operationLog.push('projectionReset');
  })
);
const projectionSetStateMock = vi.hoisted(() =>
  vi.fn(() => {
    operationLog.push('projectionSetState');
  })
);
const suggestProjectionForCurrentDataMock = vi.hoisted(() => vi.fn());
const legendSyncMock = vi.hoisted(() =>
  vi.fn(() => {
    operationLog.push('legendSync');
  })
);
const ensureTabSelectedMock = vi.hoisted(() =>
  vi.fn(() => {
    operationLog.push('ensureTabSelected');
  })
);
const applyPersistedTableFiltersMock = vi.hoisted(() =>
  vi.fn(() => {
    operationLog.push('applyPersistedTableFilters');
  })
);

vi.mock('$lib/features/data-pipeline', () => ({
  createFileFromUpload: vi.fn(async (file: { name: string }) => {
    return new File(['demo'], file.name, { type: 'text/csv' });
  })
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: undefined,
  GEO_CONSTANTS: {
    WGS84_CRS: 'EPSG:4326'
  },
  RefineOperation: {
    UPPERCASE: 'uppercase',
    LOWERCASE: 'lowercase',
    TITLECASE: 'titlecase',
    TRIM: 'trim',
    TRIM_ALL: 'trim_all'
  }
}));

vi.mock('$lib/types/data', () => ({
  isGeoJSONFeatureCollection: vi.fn(() => false)
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    waitForInitialization: waitForInitializationMock,
    beginBatch: beginBatchMock,
    endBatch: endBatchMock,
    clear: clearDuckDbMock,
    processFile: vi.fn(),
    registerExistingTable: vi.fn(),
    updateDatasetJoinInfo: vi.fn(),
    invalidateAndReanalyse: vi.fn(),
    dropRows: vi.fn(),
    renameColumn: vi.fn(),
    dropColumn: vi.fn(),
    changeColumnType: vi.fn(),
    refineColumn: vi.fn(),
    replaceInColumn: vi.fn(),
    getAllDatasets: vi.fn(() => []),
    applyPersistedTableFilters: applyPersistedTableFiltersMock
  }
}));

vi.mock('$lib/features/step-toolbar/tools/layers/layers.store.svelte', () => ({
  layersActions: {
    reset: layersResetMock,
    syncWithVisualizations: layersSyncMock
  }
}));

vi.mock('$lib/features/step-toolbar/tools/legend/legend.store.svelte', () => ({
  legendActions: {
    syncWithVisualizations: legendSyncMock
  }
}));

vi.mock(
  '$lib/features/step-toolbar/tools/projections/projection.store.svelte',
  () => ({
    projectionActions: {
      reset: projectionResetMock,
      setState: projectionSetStateMock,
      suggestProjectionForCurrentData: suggestProjectionForCurrentDataMock
    }
  })
);

vi.mock('$lib/features/commons/errors/pipeline.errors', () => ({
  formatError: vi.fn((error: unknown) => error),
  isFatalError: vi.fn(() => false),
  ParseError: class ParseError extends Error {}
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    clear: datasetsClearMock,
    addFile: addFileMock,
    applyPersistedViewState: applyPersistedViewStateMock,
    getDatasetBySourceFile: vi.fn(() => undefined),
    removeDataset: vi.fn(),
    updateDatasetTableName: vi.fn(),
    updateDatasetRowCount: vi.fn(),
    renameDatasetColumn: vi.fn(),
    getAllDatasets: vi.fn(() => []),
    datasets: []
  }
}));

vi.mock('$lib/features/commons/store/global.svelte', () => ({
  globalActions: {
    ensureTabSelected: ensureTabSelectedMock
  },
  globalState: {
    selectedDataButtonId: undefined
  }
}));

vi.mock('$lib/features/commons/store/project.store.svelte', () => ({
  projectStore: {
    waitForInit: vi.fn(),
    get currentProject() {
      return currentProjectState.value;
    }
  }
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: {
    clear: clearVisualizationMock,
    restoreFromSerialized: restoreVisualizationMock,
    removeVisualization: vi.fn(),
    getVisualizationsByDataset: vi.fn(() => []),
    get visualizations() {
      return [];
    }
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    DATA: 'DATA',
    PROJECT: 'PROJECT',
    DUCKDB: 'DUCKDB'
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  }
}));

vi.mock('$lib/features/commons/utils/notification.utils.svelte', () => ({
  showError: vi.fn(),
  showWarning: vi.fn()
}));

vi.mock('$lib/features/commons/services/import-rollback.service', () => ({
  importRollbackService: {
    createSnapshot: vi.fn(() => ({})),
    rollback: vi.fn()
  }
}));

describe('dataOrchestratorService.onProjectChanged', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    operationLog.length = 0;
    currentProjectState.value = {
      data: {
        sourceFiles: [
          {
            id: 'file-1',
            name: 'demo.csv',
            fileType: 'csv',
            originalFile: new File(['demo'], 'demo.csv', { type: 'text/csv' })
          }
        ],
        visualizationSettings: {
          visualizations: [
            {
              id: 'viz-1',
              datasetId: 'dataset-1',
              name: 'Visualisation'
            }
          ],
          selectedVisualizationId: 'viz-1',
          activeVisualizationIds: ['viz-1']
        }
      }
    };
  });

  it('restores persisted visualizations before and after reloading project files', async () => {
    const { dataOrchestratorService } =
      await import('$lib/features/commons/services/data-orchestrator.service.svelte');

    await dataOrchestratorService.onProjectChanged();

    const restoreIndexes = operationLog.reduce<number[]>(
      (indexes, entry, i) => {
        if (entry === 'restoreVisualizations') {
          indexes.push(i);
        }
        return indexes;
      },
      []
    );
    const clearDuckDbIndex = operationLog.indexOf('clearDuckDb');
    const addFileIndex = operationLog.indexOf('addFile');
    const legendSyncIndex = operationLog.lastIndexOf('legendSync');
    const finalEnsureIndex = operationLog.lastIndexOf('ensureTabSelected');
    const applyViewStateIndex = operationLog.lastIndexOf(
      'applyPersistedViewState'
    );
    const applyFiltersIndex = operationLog.lastIndexOf(
      'applyPersistedTableFilters'
    );

    expect(restoreIndexes).toHaveLength(2);
    expect(clearDuckDbIndex).toBeGreaterThan(-1);
    expect(clearDuckDbIndex).toBeLessThan(addFileIndex);
    expect(addFileIndex).toBeGreaterThan(-1);
    expect(restoreIndexes[0]).toBeLessThan(addFileIndex);
    expect(restoreIndexes[1]).toBeGreaterThan(addFileIndex);
    expect(finalEnsureIndex).toBeLessThan(applyViewStateIndex);
    expect(applyViewStateIndex).toBeLessThan(applyFiltersIndex);
    expect(legendSyncIndex).toBeGreaterThan(restoreIndexes[1]);
    expect(legendSyncIndex).toBeGreaterThan(applyFiltersIndex);
  });

  it('does not auto-suggest a projection while restoring a persisted override', async () => {
    addFileMock.mockResolvedValueOnce({
      id: 'dataset-1',
      sourceFileId: 'file-1',
      name: 'demo',
      columns: [],
      metadata: {},
      geometry: {
        bounds: [-180, -90, 180, 90],
        crs: 'EPSG:4326'
      }
    });

    currentProjectState.value = {
      data: {
        sourceFiles: [
          {
            id: 'file-1',
            name: 'demo.geojson',
            fileType: 'geojson',
            originalFile: new File(['demo'], 'demo.geojson', {
              type: 'application/geo+json'
            })
          }
        ],
        layoutSettings: {
          projection: {
            selected: 'mercator',
            overrideActive: true,
            overrideSource: 'manual',
            viewMode: 'list',
            longitude: 0,
            latitude: 0,
            rotation: 0,
            autoFit: true,
            simplifiedPreview: true
          }
        }
      }
    };

    const { dataOrchestratorService } =
      await import('$lib/features/commons/services/data-orchestrator.service.svelte');

    await dataOrchestratorService.onProjectChanged();

    expect(suggestProjectionForCurrentDataMock).not.toHaveBeenCalled();
    expect(projectionSetStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        selected: 'mercator',
        overrideActive: true,
        overrideSource: 'manual'
      })
    );
  });
});
