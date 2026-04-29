import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ExampleCategory,
  FileStatus
} from '$lib/features/commons/constants/ui.constants';
import {
  DataSourceType,
  FileType
} from '$lib/features/commons/store/create-project.types';

const mocks = vi.hoisted(() => ({
  clearDuckMock: vi.fn(),
  clearDatasetsMock: vi.fn(),
  clearVisualizationsMock: vi.fn(),
  processFileMock: vi.fn(),
  showErrorMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerInfoMock: vi.fn()
}));

vi.mock('$lib/features/duckdb/orchestrator/orchestrator.svelte', () => ({
  duckDBOrchestrator: {
    clear: mocks.clearDuckMock
  }
}));

vi.mock('../../create-project/services/file-processor.service', () => ({
  createFileProcessorService: () => ({
    processFile: mocks.processFileMock
  })
}));

vi.mock('../../create-project/services/validation.service', () => ({
  CreateProjectValidationService: {
    validateFiles: vi.fn(() => ({
      isValid: true,
      globalErrors: [],
      results: new Map()
    })),
    validateURL: vi.fn(() => ({
      isValid: true,
      errors: [],
      warnings: []
    })),
    validatePastedData: vi.fn(() => ({
      isValid: true,
      errors: [],
      warnings: []
    }))
  }
}));

vi.mock('../utils/file-import.utils', () => ({
  createUploadedFile: vi.fn(),
  extractDataFromPaste: vi.fn(),
  extractUrlsFromInput: vi.fn(() => []),
  getFilenameFromUrl: vi.fn(),
  getShapefileBaseName: vi.fn(),
  groupShapefiles: vi.fn(() => new Map()),
  isShapefileComponent: vi.fn(() => false),
  isValidUrl: vi.fn(() => true)
}));

vi.mock('../utils/format.utils', () => ({
  formatFileSize: vi.fn((value: number) => `${value} B`)
}));

vi.mock('../utils/logger', () => ({
  logger: {
    error: mocks.loggerErrorMock,
    warn: mocks.loggerWarnMock,
    info: mocks.loggerInfoMock
  },
  LogCategory: {
    PROJECT: 'PROJECT',
    FILE: 'FILE',
    DATA: 'DATA'
  }
}));

vi.mock('../utils/notification.utils.svelte', () => ({
  showError: mocks.showErrorMock
}));

vi.mock('./datasets.store.svelte', () => ({
  datasetsStore: {
    clear: mocks.clearDatasetsMock
  }
}));

vi.mock('./project.store.svelte', () => ({
  projectStore: {
    currentProject: undefined,
    markAsDirty: vi.fn(),
    saveCurrentProject: vi.fn()
  }
}));

vi.mock('./visualization.store.svelte', () => ({
  visualizationStore: {
    clear: mocks.clearVisualizationsMock
  }
}));

vi.mock('$lib/paraglide/messages', () => ({
  validation_file_count_exceeded: ({ max }: { max: string }) =>
    `too-many-files:${max}`,
  validation_total_size_exceeded: ({ size }: { size: string }) =>
    `total-size:${size}`,
  shapefile_incomplete_message: ({ missing }: { missing: string }) =>
    `missing:${missing}`,
  create_project_error_label: () => 'Erreur',
  warning_files_duplicate_message: ({ files }: { files: string }) =>
    `duplicate:${files}`,
  error_shapefile_too_large_message: ({
    size,
    max
  }: {
    size: string;
    max: string;
  }) => `too-large:${size}:${max}`,
  error_shapefile_read_failed_message: () => 'shapefile-read-failed',
  error_pasted_data_invalid_message: () => 'pasted-invalid',
  dataset_pasted_name: () => 'pasted',
  error_url_required: () => 'url-required',
  error_url_invalid: ({ urls }: { urls: string }) => `url-invalid:${urls}`,
  error_load_online_file_title: () => 'load-online-error',
  error_invalid_content_type: ({ type }: { type: string }) =>
    `invalid-content-type:${type}`,
  error_download_timeout: () => 'download-timeout'
}));

import {
  createProjectActions,
  createProjectState
} from './create-project.store.svelte';
import { projectStore } from './project.store.svelte';

function makeUploadedFile(
  id: string,
  size: number
): (typeof createProjectState.newProject.uploadedFiles)[number] {
  return {
    id,
    name: `${id}.csv`,
    size,
    type: 'text/csv',
    fileType: FileType.CSV,
    status: FileStatus.ERROR,
    uploadProgress: 100,
    sourceType: DataSourceType.FILE_UPLOAD,
    validation: {
      isValid: false,
      errors: ['Le fichier est vide'],
      warnings: []
    }
  };
}

describe('createProjectActions.removeUploadedFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProjectActions.reset();
    (
      projectStore as unknown as {
        currentProject:
          | { data?: { sourceFiles?: Array<{ name: string }> } }
          | undefined;
      }
    ).currentProject = undefined;
    createProjectState.tryExample.selectedCategory = ExampleCategory.ALL;
  });

  it('recomputes global validation errors after a file is removed', () => {
    createProjectState.newProject.uploadedFiles = Array.from(
      { length: 21 },
      (_, index) => makeUploadedFile(`file-${index + 1}`, 1)
    );
    createProjectState.newProject.validationErrors = ['too-many-files:20'];

    createProjectActions.removeUploadedFile('file-1');

    expect(createProjectState.newProject.uploadedFiles).toHaveLength(20);
    expect(createProjectState.newProject.validationErrors).toEqual([]);
  });

  it('keeps the total-size error while the remaining files still exceed the limit', () => {
    createProjectState.newProject.uploadedFiles = [
      makeUploadedFile('file-a', 150 * 1024 * 1024),
      makeUploadedFile('file-b', 100 * 1024 * 1024),
      makeUploadedFile('file-c', 60 * 1024 * 1024)
    ];
    createProjectState.newProject.validationErrors = ['total-size:200'];

    createProjectActions.removeUploadedFile('file-c');

    expect(createProjectState.newProject.uploadedFiles).toHaveLength(2);
    expect(createProjectState.newProject.validationErrors).toEqual([
      'total-size:200'
    ]);
  });

  it('resetAllTabs clears stale modal state across create/example tabs', () => {
    createProjectState.selectedTab = 3;
    createProjectState.newProject.uploadedFiles = [
      makeUploadedFile('stale', 1)
    ];
    createProjectState.newProject.pastedData = 'hello';
    createProjectState.newProject.onlineFileUrl = 'http://localhost/stale.csv';
    createProjectState.newProject.projectName = 'Stale project';
    createProjectState.newProject.isLoading = true;
    createProjectState.newProject.isProcessingFiles = true;
    createProjectState.newProject.processingFileCount = 2;
    createProjectState.newProject.error = 'stale-error';
    createProjectState.newProject.warning = 'stale-warning';
    createProjectState.newProject.validationErrors = ['stale-validation'];
    createProjectState.tryExample.selectedExampleId = 'example-1';
    createProjectState.tryExample.error = 'example-error';

    createProjectActions.resetAllTabs();

    expect(createProjectState.selectedTab).toBe(1);
    expect(createProjectState.newProject.uploadedFiles).toEqual([]);
    expect(createProjectState.newProject.pastedData).toBe('');
    expect(createProjectState.newProject.onlineFileUrl).toBe('');
    expect(createProjectState.newProject.projectName).toBe('');
    expect(createProjectState.newProject.isLoading).toBe(false);
    expect(createProjectState.newProject.isProcessingFiles).toBe(false);
    expect(createProjectState.newProject.processingFileCount).toBe(0);
    expect(createProjectState.newProject.error).toBeUndefined();
    expect(createProjectState.newProject.warning).toBeUndefined();
    expect(createProjectState.newProject.validationErrors).toEqual([]);
    expect(createProjectState.tryExample.selectedExampleId).toBeUndefined();
    expect(createProjectState.tryExample.error).toBeUndefined();
  });

  it('checks duplicates only inside the pending new-project import session', () => {
    (
      projectStore as unknown as {
        currentProject: { data: { sourceFiles: Array<{ name: string }> } };
      }
    ).currentProject = {
      data: {
        sourceFiles: [{ name: 'existing.csv' }]
      }
    };

    expect(createProjectActions.isFileDuplicate('existing.csv')).toBe(false);

    createProjectState.newProject.uploadedFiles = [
      {
        ...makeUploadedFile('pending', 1),
        name: 'existing.csv',
        status: FileStatus.COMPLETE
      }
    ];

    expect(createProjectActions.isFileDuplicate('existing.csv')).toBe(true);
  });
});
