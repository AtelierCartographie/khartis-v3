import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CreateNewProject from './create-new-project.svelte';

const mocks = vi.hoisted(() => {
  const createProjectState = {
    newProject: {
      error: undefined as string | undefined,
      warning: undefined as string | undefined,
      validationErrors: [] as string[],
      uploadedFiles: [] as Array<Record<string, unknown>>,
      isLoading: false,
      isProcessingFiles: false,
      processingFileCount: 0,
      projectName: '',
      onlineFileUrl: ''
    }
  };

  return {
    createProjectState,
    processFilesMock: vi.fn(),
    processPastedDataMock: vi.fn(),
    setNewProjectErrorMock: vi.fn(),
    setNewProjectWarningMock: vi.fn(),
    setOnlineFileUrlMock: vi.fn(),
    loadOnlineFileMock: vi.fn(),
    removeUploadedFileMock: vi.fn(),
    clearAllFilesMock: vi.fn(),
    getTotalFileSizeMock: vi.fn(() => 0),
    setProjectNameMock: vi.fn(),
    createProjectMock: vi.fn(),
    refreshProjectsMock: vi.fn(),
    navigateAfterActionMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    showErrorMock: vi.fn()
  };
});

vi.mock('@duckdb/duckdb-wasm', () => ({
  default: {},
  createWorker: vi.fn(),
  selectBundle: vi.fn()
}));

vi.mock('$lib/features/duckdb', () => ({
  Duck: {},
  duckDBOrchestrator: {
    initialize: vi.fn(),
    executeQuery: vi.fn(),
    getConnection: vi.fn()
  },
  validateGPSColumns: vi.fn(),
  GEO_CONSTANTS: { WGS84_CRS: 'EPSG:4326' }
}));

vi.mock('$lib/features/commons/stores/create-project.store.svelte', () => ({
  createProjectState: mocks.createProjectState,
  createProjectActions: {
    processFiles: mocks.processFilesMock,
    processPastedData: mocks.processPastedDataMock,
    setNewProjectError(message?: string) {
      mocks.createProjectState.newProject.error = message;
      mocks.setNewProjectErrorMock(message);
    },
    setNewProjectWarning(message?: string) {
      mocks.createProjectState.newProject.warning = message;
      mocks.setNewProjectWarningMock(message);
    },
    setOnlineFileUrl(url: string) {
      mocks.createProjectState.newProject.onlineFileUrl = url;
      mocks.setOnlineFileUrlMock(url);
    },
    loadOnlineFile: mocks.loadOnlineFileMock,
    removeUploadedFile: mocks.removeUploadedFileMock,
    clearAllFiles: mocks.clearAllFilesMock,
    getTotalFileSize: mocks.getTotalFileSizeMock,
    setProjectName(name: string) {
      mocks.createProjectState.newProject.projectName = name;
      mocks.setProjectNameMock(name);
    }
  }
}));

vi.mock('$lib/features/commons/stores/project.store.svelte', () => ({
  projectStore: {
    createProject: mocks.createProjectMock
  }
}));

vi.mock('$lib/features/commons/stores/projects.store.svelte', () => ({
  projectsStore: {
    projects: [],
    refresh: mocks.refreshProjectsMock
  }
}));

vi.mock('$lib/features/commons/utils/logger', () => ({
  LogCategory: {
    FILE: 'FILE',
    PROJECT: 'PROJECT'
  },
  logger: {
    warn: mocks.loggerWarnMock,
    error: mocks.loggerErrorMock
  }
}));

vi.mock('$lib/features/commons/utils/notification.utils.svelte', () => ({
  showError: mocks.showErrorMock
}));

vi.mock('$lib/features/commons/utils/sanitize.utils', () => ({
  sanitizeProjectName(value: string) {
    return value.trim();
  }
}));

vi.mock(
  '$lib/features/create-project/services/import-readiness.service',
  () => ({
    canSubmitImport: vi.fn(() => false),
    getValidImportFiles: vi.fn(() => []),
    hasBlockingImportFiles: vi.fn(() => false),
    hasImportValidationErrors: vi.fn(() => false),
    hasPendingImportFiles: vi.fn(() => false)
  })
);

vi.mock('./hooks', () => ({
  useProjectNavigation: vi.fn(() => ({
    navigateAfterAction: mocks.navigateAfterActionMock
  }))
}));

describe('CreateNewProject', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    mocks.createProjectState.newProject.error = undefined;
    mocks.createProjectState.newProject.warning = undefined;
    mocks.createProjectState.newProject.validationErrors = [];
    mocks.createProjectState.newProject.uploadedFiles = [];
    mocks.createProjectState.newProject.isLoading = false;
    mocks.createProjectState.newProject.isProcessingFiles = false;
    mocks.createProjectState.newProject.processingFileCount = 0;
    mocks.createProjectState.newProject.projectName = '';
    mocks.createProjectState.newProject.onlineFileUrl = '';

    mocks.loadOnlineFileMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('loads an online file even when the user clicks before debounced URL validation finishes', async () => {
    render(CreateNewProject, {
      props: {
        isModal: true
      }
    });

    const urlInput = screen.getByLabelText(
      /lien vers un fichier stocké en ligne/i
    );
    const loadButton = screen.getByRole('button', { name: /charger/i });
    const url =
      'http://localhost:5176/cartographie/khartisnewpprd/tests-datasets/visualization-toolbox-cases.csv';

    await fireEvent.input(urlInput, { target: { value: url } });

    expect(loadButton).toBeEnabled();

    await fireEvent.click(loadButton);

    expect(mocks.setNewProjectErrorMock).toHaveBeenCalledWith(undefined);
    expect(mocks.setOnlineFileUrlMock).toHaveBeenCalledWith(url);
    expect(mocks.loadOnlineFileMock).toHaveBeenCalledTimes(1);
  });

  it('rejects project archives from the data import URL field', async () => {
    render(CreateNewProject, {
      props: {
        isModal: true
      }
    });

    const urlInput = screen.getByLabelText(
      /lien vers un fichier stocké en ligne/i
    );
    const loadButton = screen.getByRole('button', { name: /charger/i });

    await fireEvent.input(urlInput, {
      target: {
        value: 'http://localhost:5176/tests-datasets/projects/test-project.kh'
      }
    });

    expect(loadButton).toBeEnabled();

    await fireEvent.click(loadButton);

    expect(mocks.setOnlineFileUrlMock).not.toHaveBeenCalled();
    expect(mocks.loadOnlineFileMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        /doivent être ouverts depuis l'onglet « Ouvrir un projet ou une sauvegarde »/i
      )
    ).toBeInTheDocument();
  });

  it('clears local URL and pasted data state when resetToken changes', async () => {
    const { rerender } = render(CreateNewProject, {
      props: {
        isModal: true,
        resetToken: 0
      }
    });

    const urlInput = screen.getByLabelText(
      /lien vers un fichier stocké en ligne/i
    );
    const pastedDataInput = screen.getByPlaceholderText(
      /coller un tableau de données/i
    );

    await fireEvent.input(urlInput, {
      target: { value: 'http://localhost/stale.csv' }
    });
    await fireEvent.input(pastedDataInput, {
      target: { value: 'country,value\nFrance,1' }
    });

    expect(urlInput).toHaveValue('http://localhost/stale.csv');
    expect(pastedDataInput).toHaveValue('country,value\nFrance,1');

    await rerender({
      isModal: true,
      resetToken: 1
    });

    expect(urlInput).toHaveValue('');
    expect(pastedDataInput).toHaveValue('');
  });

  it('disables an individual remove button while the file is being removed', async () => {
    let resolveRemove: (() => void) | undefined;
    mocks.removeUploadedFileMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRemove = resolve;
        })
    );
    mocks.createProjectState.newProject.uploadedFiles = [
      {
        id: 'file-1',
        name: 'data.csv',
        size: 12,
        fileType: 'csv',
        status: 'complete',
        sourceType: 'file_upload'
      }
    ];

    render(CreateNewProject, {
      props: {
        isModal: true
      }
    });

    const removeButton = screen.getByRole('button', {
      name: /supprimer le fichier/i
    });

    await fireEvent.click(removeButton);

    await waitFor(() => expect(removeButton).toBeDisabled());

    resolveRemove?.();

    await waitFor(() => expect(removeButton).toBeEnabled());
  });

  it('shows shapefile component tags for incomplete shapefiles', () => {
    mocks.createProjectState.newProject.uploadedFiles = [
      {
        id: 'file-1',
        name: 'roads.shp',
        size: 12,
        fileType: 'shapefile',
        status: 'incomplete',
        relatedFiles: ['roads.shp', 'roads.dbf', 'roads.cpg'],
        sourceType: 'file_upload'
      }
    ];

    render(CreateNewProject, {
      props: {
        isModal: true
      }
    });

    expect(screen.getByText('.shp ✓')).toBeInTheDocument();
    expect(screen.getByText('.shx')).toBeInTheDocument();
    expect(screen.getByText('.dbf ✓')).toBeInTheDocument();
    expect(screen.getByText('.prj')).toBeInTheDocument();
    expect(screen.getByText('.cpg ✓')).toBeInTheDocument();
  });
});
