import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  beginProjectRuntime: vi.fn(),
  dataOnProjectChanged:
    vi.fn<(options?: { signal?: AbortSignal }) => Promise<void>>(),
  duplicateProjectEntity: vi.fn(),
  loggerError: vi.fn(),
  projectRepositoryListMetadata: vi.fn(),
  projectRepositoryLoad: vi.fn(),
  projectRepositoryLoadSerialized: vi.fn(),
  projectRepositorySaveSerialized: vi.fn(),
  projectRepositoryRemove: vi.fn(),
  projectStorageLoad: vi.fn(),
  projectStorageRemove: vi.fn(),
  projectStorageSave: vi.fn(),
  resetHistory: vi.fn(),
  resetProjectRuntimeState: vi.fn(),
  saveCurrentProject: vi.fn(),
  trackProjectOpened: vi.fn()
}));

vi.mock('$lib/features/project-management', () => ({
  ProjectStorageKey: {
    CURRENT: 'khartis_current_project'
  },
  PROJECT_CONST: {
    SCHEMA_VERSION: '3.9.0'
  },
  duplicateProject: mocks.duplicateProjectEntity,
  projectRepository: {
    listMetadata: mocks.projectRepositoryListMetadata,
    load: mocks.projectRepositoryLoad,
    loadSerialized: mocks.projectRepositoryLoadSerialized,
    remove: mocks.projectRepositoryRemove,
    save: vi.fn(),
    saveSerialized: mocks.projectRepositorySaveSerialized
  },
  projectStorage: {
    load: mocks.projectStorageLoad,
    remove: mocks.projectStorageRemove,
    save: mocks.projectStorageSave
  }
}));

vi.mock('$lib/paraglide/messages', () => ({
  m: {
    error_duplicate_project_title: () => 'Duplicate failed',
    history_project_loaded: () => 'Project loaded',
    project_duplicate_suffix: () => '(copy)'
  }
}));

vi.mock('../../services/data-orchestrator.service.svelte', () => ({
  dataOrchestratorService: {
    onProjectChanged: mocks.dataOnProjectChanged
  }
}));

vi.mock('../../services/analytics.service', () => ({
  analyticsService: {
    trackProjectOpened: mocks.trackProjectOpened
  }
}));

vi.mock('../../utils/logger', () => ({
  LogCategory: {
    PROJECT: 'PROJECT'
  },
  logger: {
    error: mocks.loggerError
  }
}));

vi.mock('../../utils/notification.utils.svelte', () => ({
  showError: vi.fn()
}));

vi.mock('./project-files', () => ({
  cleanFileForStorage: vi.fn((file) => file)
}));

vi.mock('./project-history', () => ({
  addToHistory: vi.fn(),
  resetHistory: mocks.resetHistory
}));

vi.mock('./project-persistence', () => ({
  saveCurrentProject: mocks.saveCurrentProject
}));

vi.mock('./project-runtime.svelte', () => ({
  beginProjectRuntime: mocks.beginProjectRuntime,
  resetProjectRuntimeState: mocks.resetProjectRuntimeState
}));

function createContainer() {
  return {
    _state: {
      autoSaveEnabled: true,
      autoSaveInterval: 1_000,
      currentProject: undefined,
      history: [],
      historyIndex: -1,
      isDirty: false,
      isInitialized: false,
      isLoading: false,
      lastSaved: undefined,
      maxHistorySize: 50
    }
  };
}

function createProject() {
  return {
    id: 'project-1',
    manifest: {
      version: '3.9.0',
      createdAt: new Date('2026-07-16T00:00:00.000Z'),
      updatedAt: new Date('2026-07-16T00:00:00.000Z'),
      name: 'Saved project',
      format: 'kh'
    },
    data: {
      sourceFiles: []
    }
  };
}

describe('project lifecycle startup restore', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    sessionStorage.clear();
    window.history.pushState({}, '', '/cartographie/khartis/');
    mocks.projectRepositoryLoad.mockResolvedValue(createProject());
    mocks.projectRepositoryRemove.mockResolvedValue(undefined);
    mocks.projectStorageLoad.mockResolvedValue('project-1');
    mocks.projectStorageRemove.mockResolvedValue(undefined);
    mocks.projectStorageSave.mockResolvedValue(undefined);
    mocks.resetHistory.mockImplementation((container) => {
      container._state.history = [];
      container._state.historyIndex = -1;
    });
    mocks.saveCurrentProject.mockResolvedValue(undefined);
  });

  it('should start fresh without deleting persisted data when restore fails', async () => {
    mocks.dataOnProjectChanged.mockRejectedValueOnce(
      new Error('DuckDB initialization failed')
    );
    const { loadLastProject } = await import('./project-lifecycle');
    const container = createContainer();
    const reloadPage = vi.fn();

    await loadLastProject(container as never, 100, reloadPage);

    expect(container._state.currentProject).toBeUndefined();
    expect(mocks.beginProjectRuntime).toHaveBeenLastCalledWith(null);
    expect(mocks.resetProjectRuntimeState).toHaveBeenNthCalledWith(1, {
      resetPersistence: false
    });
    expect(mocks.resetProjectRuntimeState).toHaveBeenNthCalledWith(2);
    expect(mocks.projectStorageRemove).not.toHaveBeenCalled();
    expect(mocks.projectRepositoryRemove).not.toHaveBeenCalled();
    expect(mocks.projectStorageSave).toHaveBeenCalledWith(
      'khartis_current_project',
      'project-1'
    );
    expect(reloadPage).toHaveBeenCalledOnce();
    expect(reloadPage).toHaveBeenCalledWith(
      '/cartographie/khartis/?restoreFallback=project-1'
    );
  });

  it('should quarantine a timed-out startup restore and allow a later manual reopen', async () => {
    vi.useFakeTimers();
    let finishInitialRestore: (() => void) | undefined;
    let initialRestoreSignal: AbortSignal | undefined;
    mocks.dataOnProjectChanged
      .mockImplementationOnce(
        (options) =>
          new Promise<void>((resolve) => {
            initialRestoreSignal = options?.signal;
            finishInitialRestore = resolve;
          })
      )
      .mockResolvedValue(undefined);
    const { loadLastProject, loadProject } =
      await import('./project-lifecycle');
    const container = createContainer();
    const reloadPage = vi.fn();

    const startupRestore = loadLastProject(container as never, 20, reloadPage);
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.dataOnProjectChanged).toHaveBeenCalledTimes(1);
    expect(initialRestoreSignal).toBeDefined();

    await vi.advanceTimersByTimeAsync(20);
    await startupRestore;

    expect(container._state.currentProject).toBeUndefined();
    expect(initialRestoreSignal?.aborted).toBe(true);
    expect(reloadPage).toHaveBeenCalledOnce();
    expect(reloadPage).toHaveBeenCalledWith(
      '/cartographie/khartis/?restoreFallback=project-1'
    );
    expect(mocks.projectStorageRemove).not.toHaveBeenCalled();
    expect(mocks.projectRepositoryRemove).not.toHaveBeenCalled();

    finishInitialRestore?.();
    await vi.advanceTimersByTimeAsync(0);
    await loadProject(container as never, 'project-1');

    expect(container._state.currentProject).toEqual(createProject());
    expect(mocks.dataOnProjectChanged).toHaveBeenCalledTimes(2);
    expect(mocks.trackProjectOpened).toHaveBeenCalledTimes(1);
  });

  it('should skip an already quarantined project on the next startup load', async () => {
    mocks.dataOnProjectChanged.mockRejectedValueOnce(
      new Error('Restore failed')
    );
    const { loadLastProject } = await import('./project-lifecycle');
    const firstContainer = createContainer();
    const reloadPage = vi.fn();

    await loadLastProject(firstContainer as never, 100, reloadPage);
    mocks.dataOnProjectChanged.mockClear();
    mocks.projectRepositoryLoad.mockClear();

    await loadLastProject(createContainer() as never, 100, reloadPage);

    expect(mocks.projectRepositoryLoad).not.toHaveBeenCalled();
    expect(mocks.dataOnProjectChanged).not.toHaveBeenCalled();
    expect(reloadPage).toHaveBeenCalledOnce();
  });

  it('should use a URL fallback when session storage rejects the quarantine', async () => {
    const originalSessionStorage = Object.getOwnPropertyDescriptor(
      window,
      'sessionStorage'
    );
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        removeItem: () => {},
        setItem: () => {
          throw new DOMException('Storage disabled', 'SecurityError');
        }
      }
    });
    mocks.dataOnProjectChanged.mockRejectedValueOnce(
      new Error('Restore failed')
    );
    const { loadLastProject } = await import('./project-lifecycle');
    const reloadPage = vi.fn();

    try {
      await loadLastProject(createContainer() as never, 100, reloadPage);

      expect(reloadPage).toHaveBeenCalledWith(
        '/cartographie/khartis/?restoreFallback=project-1'
      );
      expect(mocks.projectStorageRemove).not.toHaveBeenCalled();
      expect(mocks.projectRepositoryRemove).not.toHaveBeenCalled();
    } finally {
      if (originalSessionStorage) {
        Object.defineProperty(window, 'sessionStorage', originalSessionStorage);
      }
    }
  });
});

describe('project lifecycle duplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('duplicates another project from its stored snapshot without touching the open project', async () => {
    const { duplicateProject } = await import('./project-lifecycle');
    const openProject = createProject();
    const container = createContainer();
    const state: { currentProject: unknown; isDirty: boolean } =
      container._state;
    state.currentProject = openProject;
    state.isDirty = true;
    const storedProjectB = {
      id: 'project-b',
      manifest: {
        version: '3.9.0',
        createdAt: '2026-07-16T00:00:00.000Z',
        updatedAt: '2026-07-16T00:00:00.000Z',
        name: 'Project B'
      },
      data: { sourceFiles: [] }
    };
    const duplicatedSnapshot = {
      ...storedProjectB,
      id: 'project-b-copy',
      manifest: { ...storedProjectB.manifest, name: 'Project B copy' }
    };
    mocks.projectRepositoryLoadSerialized.mockResolvedValue(storedProjectB);
    mocks.projectRepositoryListMetadata.mockResolvedValue([]);
    mocks.duplicateProjectEntity.mockReturnValue(duplicatedSnapshot);
    mocks.projectRepositorySaveSerialized.mockResolvedValue(undefined);

    const newId = await duplicateProject(
      container as never,
      'project-b',
      'Project B copy'
    );

    expect(newId).toBe('project-b-copy');
    expect(mocks.projectRepositoryLoad).not.toHaveBeenCalled();
    expect(mocks.duplicateProjectEntity).toHaveBeenCalledWith(
      storedProjectB,
      'Project B copy'
    );
    expect(mocks.projectRepositorySaveSerialized).toHaveBeenCalledWith(
      duplicatedSnapshot
    );
    expect(state.currentProject).toBe(openProject);
    expect(state.isDirty).toBe(true);
    expect(mocks.beginProjectRuntime).not.toHaveBeenCalled();
    expect(mocks.resetProjectRuntimeState).not.toHaveBeenCalled();
  });
});
