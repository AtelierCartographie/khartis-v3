import type {
  KhartisProject,
  LayoutConfig,
  ProjectData,
  ProjectHistoryEntry,
  SavedProjectMetadata,
  VisualizationConfig
} from '$lib/features/project-management';
import {
  createAutoSaveController,
  persistenceRegistry,
  type AutoSaveController
} from '$lib/features/project-management';
import { EVENT } from '$lib/features/commons/constants/dom.constants';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type {
  ColumnTransformation,
  UploadedFile
} from './create-project.types';
import {
  createProjectState,
  type ProjectStateContainer,
  createProject as createProjectFn,
  loadProject as loadProjectFn,
  deleteProject as deleteProjectFn,
  duplicateProject as duplicateProjectFn,
  listProjects as listProjectsFn,
  clearProject as clearProjectFn,
  loadLastProject as loadLastProjectFn,
  addFilesToProject as addFilesToProjectFn,
  addVirtualSourceFile as addVirtualSourceFileFn,
  removeFileFromProject as removeFileFromProjectFn,
  renameFile as renameFileFn,
  addToHistory as addToHistoryFn,
  undo as undoFn,
  redo as redoFn,
  canUndo as canUndoFn,
  canRedo as canRedoFn,
  saveCurrentProject as saveCurrentProjectFn,
  exportProject as exportProjectFn,
  importProject as importProjectFn,
  markDirty as markDirtyFn,
  setAutoSave as setAutoSaveFn,
  addColumnTransformation as addColumnTransformationFn,
  clearColumnTransformations as clearColumnTransformationsFn,
  addDeletedRows as addDeletedRowsFn
} from './project';

const EXIT_FLUSH_DEDUP_MS = 1000;

let flushPendingPersistenceRef: (() => void) | null = null;
let areExitListenersRegistered = false;
let lastExitFlushAt = 0;

function createProjectStore() {
  const state = $state(createProjectState());
  let initPromise: Promise<void> | undefined;

  const container: ProjectStateContainer = {
    _state: state,
    autoSave: createAutoSaveController(() => saveCurrentProject()),
    get initPromise() {
      return initPromise;
    },
    set initPromise(value: Promise<void> | undefined) {
      initPromise = value;
    }
  };

  // Wire the persistence registry to auto-save via the project store
  persistenceRegistry.setSaveCallback(() => saveCurrentProject());

  async function initialize(): Promise<void> {
    state.isLoading = true;
    try {
      await loadLastProjectFn(container);
    } finally {
      state.isLoading = false;
      state.isInitialized = true;
    }
  }

  async function waitForInit(): Promise<void> {
    if (initPromise) {
      await initPromise;
    }
  }

  async function addFilesToProject(newFiles: UploadedFile[]): Promise<void> {
    return addFilesToProjectFn(container, newFiles);
  }

  function addVirtualSourceFile(file: UploadedFile): void {
    addVirtualSourceFileFn(container, file);
    markAsDirty();
  }

  async function removeFileFromProject(fileId: string): Promise<void> {
    return removeFileFromProjectFn(container, fileId);
  }

  async function renameFile(fileId: string, newName: string): Promise<void> {
    return renameFileFn(container, fileId, newName);
  }

  async function addColumnTransformation(
    fileId: string,
    transformation: ColumnTransformation
  ): Promise<void> {
    return addColumnTransformationFn(container, fileId, transformation);
  }

  async function clearColumnTransformations(
    fileId: string,
    options?: Pick<
      UploadedFile,
      | 'duckdbTableName'
      | 'joinedBasemap'
      | 'geoColumn'
      | 'gpsMode'
      | 'gpsColumns'
    >
  ): Promise<void> {
    return clearColumnTransformationsFn(container, fileId, options);
  }

  async function addDeletedRows(
    fileId: string,
    rowIds: number[]
  ): Promise<void> {
    return addDeletedRowsFn(container, fileId, rowIds);
  }

  async function createProject(
    name: string,
    files: UploadedFile[]
  ): Promise<void> {
    return createProjectFn(container, name, files);
  }

  async function loadProject(id: string): Promise<void> {
    return loadProjectFn(container, id);
  }

  async function saveCurrentProject(): Promise<void> {
    return saveCurrentProjectFn(container);
  }

  async function deleteProject(id: string): Promise<void> {
    return deleteProjectFn(container, id);
  }

  async function duplicateProject(
    id: string,
    newName?: string
  ): Promise<string> {
    return duplicateProjectFn(container, id, newName);
  }

  async function listProjects(): Promise<SavedProjectMetadata[]> {
    return listProjectsFn();
  }

  async function exportProject(customName?: string): Promise<void> {
    return exportProjectFn(container, customName);
  }

  async function importProject(file: File): Promise<void> {
    return importProjectFn(container, file);
  }

  function markAsDirty(): void {
    markDirtyFn(container);
    container.autoSave.schedule(true);
  }

  function updateProjectName(name: string): void {
    if (!state.currentProject) {
      return;
    }

    state.currentProject.manifest.name = name;
    state.currentProject.manifest.updatedAt = new Date();
    markAsDirty();
    addToHistoryFn(container, 'Project name updated');
  }

  function updateProjectData(data: Partial<ProjectData>): void {
    if (!state.currentProject) {
      return;
    }

    state.currentProject.data = {
      ...state.currentProject.data,
      ...data
    };
    state.currentProject.manifest.updatedAt = new Date();
    markAsDirty();
    addToHistoryFn(container, 'Project data updated');
  }

  function updateVisualization(config: Partial<VisualizationConfig>): void {
    if (!state.currentProject) {
      return;
    }

    state.currentProject.visualization = {
      ...state.currentProject.visualization,
      ...config
    } as VisualizationConfig;

    state.currentProject.manifest.updatedAt = new Date();
    markAsDirty();
    addToHistoryFn(container, 'Visualization updated');
  }

  function updateLayout(config: Partial<LayoutConfig>): void {
    if (!state.currentProject) {
      return;
    }

    state.currentProject.layout = {
      ...state.currentProject.layout,
      ...config
    };

    state.currentProject.manifest.updatedAt = new Date();
    markAsDirty();
    addToHistoryFn(container, 'Layout updated');
  }

  function undo(): void {
    if (undoFn(container)) {
      markAsDirty();
    }
  }

  function redo(): void {
    if (redoFn(container)) {
      markAsDirty();
    }
  }

  async function clearProject(): Promise<void> {
    return clearProjectFn(container);
  }

  function setAutoSave(enabled: boolean, interval?: number): void {
    setAutoSaveFn(container, enabled, interval);
  }

  function flushPendingPersistence(): void {
    if (!state.currentProject) {
      return;
    }

    const now = Date.now();
    if (now - lastExitFlushAt < EXIT_FLUSH_DEDUP_MS) {
      return;
    }
    lastExitFlushAt = now;

    container.autoSave.cancel();

    if (persistenceRegistry.isDirty) {
      persistenceRegistry.flush();
      return;
    }

    if (!state.isDirty) {
      return;
    }

    void saveCurrentProject().catch((error) => {
      logger.error(
        'Failed to save project during page lifecycle flush',
        LogCategory.PERSISTENCE,
        error
      );
    });
  }

  if (typeof window !== 'undefined') {
    flushPendingPersistenceRef = flushPendingPersistence;

    if (!areExitListenersRegistered) {
      const flushOnExit = () => flushPendingPersistenceRef?.();

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          flushOnExit();
        }
      });
      window.addEventListener('pagehide', flushOnExit);
      window.addEventListener(EVENT.BEFOREUNLOAD, flushOnExit);

      areExitListenersRegistered = true;
    }

    initPromise = initialize();
  }

  return {
    _state: state,
    autoSave: container.autoSave as AutoSaveController,
    get initPromise(): Promise<void> | undefined {
      return initPromise;
    },
    set initPromise(value: Promise<void> | undefined) {
      initPromise = value;
      container.initPromise = value;
    },
    waitForInit,
    get currentProject(): KhartisProject | undefined {
      return state.currentProject;
    },
    get projectName(): string {
      return state.currentProject?.manifest.name || '';
    },
    get isDirty(): boolean {
      return state.isDirty;
    },
    get canUndo(): boolean {
      return canUndoFn(container);
    },
    get canRedo(): boolean {
      return canRedoFn(container);
    },
    get history(): ProjectHistoryEntry[] {
      return state.history;
    },
    get isInitialized(): boolean {
      return state.isInitialized;
    },
    get isLoading(): boolean {
      return state.isLoading;
    },
    addFilesToProject,
    addVirtualSourceFile,
    removeFileFromProject,
    renameFile,
    addColumnTransformation,
    clearColumnTransformations,
    addDeletedRows,
    createProject,
    loadProject,
    saveCurrentProject,
    deleteProject,
    duplicateProject,
    listProjects,
    exportProject,
    importProject,
    markAsDirty,
    updateProjectName,
    updateProjectData,
    updateVisualization,
    updateLayout,
    undo,
    redo,
    clearProject,
    setAutoSave
  };
}

export const projectStore = createProjectStore();
