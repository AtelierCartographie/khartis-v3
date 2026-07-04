import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileStatus } from '../types/create-project.types';
import type { UploadedFile } from '../types/create-project.types';

const mocks = vi.hoisted(() => ({
  cleanupDuckDBResources: vi.fn(async () => undefined),
  currentProject: undefined as
    { data?: { sourceFiles?: Array<{ id: string }> } } | undefined,
  datasets: new Map<string, { id: string; sourceFileId: string }>(),
  dropTable: vi.fn(async () => undefined),
  duckDatasets: [] as Array<{ sourceFileId: string; tableName: string }>,
  loggerError: vi.fn(),
  removeDataset: vi.fn(),
  removeFileFromProject: vi.fn(async () => undefined),
  removeVisualization: vi.fn(),
  visualizations: new Map<string, Array<{ id: string }>>()
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    dropTable: mocks.dropTable,
    getAllDatasets: vi.fn(() => mocks.duckDatasets)
  }
}));

vi.mock('../stores/datasets.store.svelte', () => ({
  datasetsStore: {
    getDatasetBySourceFile: vi.fn((fileId: string) =>
      mocks.datasets.get(fileId)
    ),
    removeDataset: mocks.removeDataset
  }
}));

vi.mock('../stores/project.store.svelte', () => ({
  projectStore: {
    get currentProject() {
      return mocks.currentProject;
    },
    removeFileFromProject: mocks.removeFileFromProject
  }
}));

vi.mock('../stores/visualization.store.svelte', () => ({
  visualizationStore: {
    getVisualizationsByDataset: vi.fn(
      (datasetId: string) => mocks.visualizations.get(datasetId) ?? []
    ),
    removeVisualization: mocks.removeVisualization
  }
}));

vi.mock('../utils/duckdb-cleanup.utils', () => ({
  cleanupDuckDBResources: mocks.cleanupDuckDBResources
}));

vi.mock('../utils/logger', () => ({
  LogCategory: {
    DATA: 'data'
  },
  logger: {
    error: mocks.loggerError
  }
}));

function makeUploadedFile(id: string): UploadedFile {
  return {
    id,
    name: `${id}.csv`,
    size: 10,
    type: 'text/csv',
    status: FileStatus.COMPLETE,
    uploadProgress: 100
  } as UploadedFile;
}

describe('importRollbackService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentProject = undefined;
    mocks.datasets.clear();
    mocks.duckDatasets = [];
    mocks.visualizations.clear();
  });

  it('removes added source files through the project store notification path', async () => {
    const { importRollbackService } = await import('./import-rollback.service');

    mocks.currentProject = { data: { sourceFiles: [] } };
    const snapshot = importRollbackService.createSnapshot(
      makeUploadedFile('file-1')
    );

    mocks.currentProject = {
      data: { sourceFiles: [{ id: 'file-1' }] }
    };
    mocks.datasets.set('file-1', { id: 'dataset-1', sourceFileId: 'file-1' });
    mocks.visualizations.set('dataset-1', [{ id: 'viz-1' }]);
    mocks.duckDatasets = [{ sourceFileId: 'file-1', tableName: 'table_1' }];

    await importRollbackService.rollback(snapshot);

    expect(snapshot).not.toHaveProperty('timestamp');
    expect(mocks.removeFileFromProject).toHaveBeenCalledWith('file-1');
    expect(mocks.removeDataset).not.toHaveBeenCalled();
    expect(mocks.removeVisualization).not.toHaveBeenCalled();
    expect(mocks.dropTable).not.toHaveBeenCalled();
    expect(mocks.cleanupDuckDBResources).not.toHaveBeenCalled();
  });

  it('keeps cleaning orphaned import artifacts when the source file is already absent', async () => {
    const { importRollbackService } = await import('./import-rollback.service');

    mocks.currentProject = { data: { sourceFiles: [] } };
    const snapshot = importRollbackService.createSnapshot(
      makeUploadedFile('file-2')
    );

    mocks.datasets.set('file-2', { id: 'dataset-2', sourceFileId: 'file-2' });
    mocks.visualizations.set('dataset-2', [{ id: 'viz-2' }]);
    mocks.duckDatasets = [{ sourceFileId: 'file-2', tableName: 'table_2' }];

    await importRollbackService.rollback(snapshot);

    expect(mocks.removeFileFromProject).not.toHaveBeenCalled();
    expect(mocks.removeVisualization).toHaveBeenCalledWith('viz-2');
    expect(mocks.removeDataset).toHaveBeenCalledWith('dataset-2');
    expect(mocks.dropTable).toHaveBeenCalledWith('table_2');
    expect(mocks.cleanupDuckDBResources).toHaveBeenCalledWith('table_2');
  });
});
