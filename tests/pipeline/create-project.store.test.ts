import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/duckdb', () => ({
  Duck: {},
  initDuckDB: vi.fn()
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    clear: vi.fn()
  }
}));

vi.mock('$lib/features/commons/store/datasets.store.svelte', () => ({
  datasetsStore: {
    clear: vi.fn()
  }
}));

vi.mock('$lib/features/commons/store/project.store.svelte', () => ({
  projectStore: {
    currentProject: undefined,
    markAsDirty: vi.fn(),
    saveCurrentProject: vi.fn()
  }
}));

vi.mock('$lib/features/commons/store/visualization.store.svelte', () => ({
  visualizationStore: {
    clear: vi.fn()
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    DATA: 'DATA',
    PROJECT: 'PROJECT',
    FILE: 'FILE'
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

import { FileStatus } from '$lib/features/commons/constants/ui.constants';
import {
  DataSourceType,
  FileType
} from '$lib/features/commons/store/create-project.types';
import {
  createProjectActions,
  createProjectState
} from '$lib/features/commons/store/create-project.store.svelte';

describe('create-project.store remote shapefile routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProjectState.newProject.uploadedFiles = [];
    createProjectState.newProject.validationErrors = [];
    createProjectState.newProject.onlineFileUrl = '';
    createProjectState.newProject.projectName = '';
    createProjectState.newProject.error = undefined;
    createProjectState.newProject.warning = undefined;
    createProjectState.newProject.isLoading = false;
    createProjectState.newProject.isProcessingFiles = false;
    createProjectState.newProject.processingFileCount = 0;
  });

  it('marks a standalone remote .shp as incomplete before project creation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Blob(['shp'], { type: 'application/x-shapefile' }), {
        status: 200,
        headers: {
          'content-type': 'application/x-shapefile'
        }
      })
    );
    const processSingleFileSpy = vi.spyOn(
      createProjectActions,
      'processSingleFile'
    );
    const processShapefileGroupSpy = vi.spyOn(
      createProjectActions,
      'processShapefileGroup'
    );

    createProjectActions.setOnlineFileUrl(
      'https://example.com/ne_50m_admin_0_countries_lakes.shp'
    );

    await createProjectActions.loadOnlineFile();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(processSingleFileSpy).not.toHaveBeenCalled();
    expect(processShapefileGroupSpy).toHaveBeenCalledTimes(1);
    expect(processShapefileGroupSpy).toHaveBeenCalledWith(
      'ne_50m_admin_0_countries_lakes',
      [expect.any(File)],
      DataSourceType.URL
    );

    expect(createProjectState.newProject.uploadedFiles).toHaveLength(1);
    expect(createProjectState.newProject.uploadedFiles[0]).toMatchObject({
      status: FileStatus.INCOMPLETE,
      fileType: FileType.SHAPEFILE,
      sourceType: DataSourceType.URL
    });
    expect(
      createProjectState.newProject.uploadedFiles[0]?.missingShapefileComponents
    ).toEqual(expect.arrayContaining(['.dbf', '.shx']));
    expect(createProjectState.newProject.error).toBeUndefined();
  });
});
