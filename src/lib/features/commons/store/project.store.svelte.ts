import type {
  KhartisProject,
  ProjectState,
  ProjectHistoryEntry,
  VisualizationConfig,
  LayoutConfig,
  ProjectData,
  SavedProjectMetadata
} from './project.types';
import { ProjectStorageKey } from './project.types';
import { projectPersistence } from '../utils/project-persistence.utils';
import { showError } from '../utils/notification.utils.svelte';
import { generateProjectFilename, slugify } from '../utils/string.utils';
import type { UploadedFile } from './create-project.types';
import { globalActions } from './global.svelte';
import { dataOrchestrator } from '../services/data-orchestrator.service';

class ProjectStore {
  private _state = $state<ProjectState>({
    currentProject: undefined,
    isDirty: false,
    lastSaved: undefined,
    autoSaveEnabled: true,
    autoSaveInterval: 30000,
    history: [],
    historyIndex: -1,
    maxHistorySize: 50,
    isInitialized: false,
    isLoading: false
  });

  private autoSaveTimer?: number;
  private initPromise?: Promise<void>;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initPromise = this.initialize();
    }
  }

  private async initialize(): Promise<void> {
    this._state.isLoading = true;
    try {
      await this.loadLastProject();
    } finally {
      this._state.isLoading = false;
      this._state.isInitialized = true;
    }
  }

  async waitForInit(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  get currentProject() {
    return this._state.currentProject;
  }

  get projectName() {
    return this._state.currentProject?.manifest.name || '';
  }

  get isDirty() {
    return this._state.isDirty;
  }

  get canUndo() {
    return this._state.historyIndex > 0;
  }

  get canRedo() {
    return this._state.historyIndex < this._state.history.length - 1;
  }

  get history() {
    return this._state.history;
  }

  get isInitialized() {
    return this._state.isInitialized;
  }

  get isLoading() {
    return this._state.isLoading;
  }

  async addFilesToProject(newFiles: UploadedFile[]): Promise<void> {
    if (!this._state.currentProject) {
      throw new Error('No project loaded');
    }

    if (!this._state.currentProject.data) {
      this._state.currentProject.data = { sourceFiles: [] };
    }

    if (!this._state.currentProject.data.sourceFiles) {
      this._state.currentProject.data.sourceFiles = [];
    }

    for (const file of newFiles) {
      const exists = this._state.currentProject.data.sourceFiles.find(
        (f) => f.id === file.id || f.name === file.name
      );
      if (!exists) {
        // Create a deep copy of the file to preserve parsedData
        // Use JSON parse/stringify as structuredClone fails with proxy objects
        const fileCopy = {
          id: file.id,
          name: file.name,
          size: file.size,
          type: file.type,
          fileType: file.fileType,
          status: file.status,
          uploadProgress: file.uploadProgress,
          errorMessage: file.errorMessage,
          validation: file.validation,
          parsedData: file.parsedData ? JSON.parse(JSON.stringify(file.parsedData)) : null,
          content: file.content,
          duplicates: file.duplicates,
          statistics: file.statistics,
          sourceType: file.sourceType
        };

        console.log('[ProjectStore] Adding file to sourceFiles:', {
          name: fileCopy.name,
          parsedDataLength: Array.isArray(fileCopy.parsedData) ? fileCopy.parsedData.length : 0
        });

        this._state.currentProject.data.sourceFiles.push(fileCopy);
        globalActions.addDataButtonForFile(file.id, file.name, false);

        await dataOrchestrator.onFileAdded(fileCopy);
      }
    }

    this._state.isDirty = true;
    await this.saveCurrentProject();
  }

  async removeFileFromProject(fileId: string): Promise<void> {
    if (!this._state.currentProject?.data?.sourceFiles) {
      return;
    }

    const index = this._state.currentProject.data.sourceFiles.findIndex(
      (f) => f.id === fileId
    );
    if (index > -1) {
      const fileName = this._state.currentProject.data.sourceFiles[index].name;
      this._state.currentProject.data.sourceFiles.splice(index, 1);

      await dataOrchestrator.onFileRemoved(fileId);

      this._state.isDirty = true;
      await this.saveCurrentProject();
    }
  }

  async createProject(name: string, files: UploadedFile[]): Promise<void> {
    const project: KhartisProject = {
      id: crypto.randomUUID(),
      manifest: {
        version: '3.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        name,
        format: 'kh'
      },
      data: {
        sourceFiles: files
      }
    };

    this._state.currentProject = project;
    this._state.isDirty = false;
    this._state.lastSaved = new Date();

    globalActions.clearAllDataButtons();
    for (const file of files) {
      globalActions.addDataButtonForFile(file.id, file.name);
    }

    this.addToHistory('Project created', project);

    await this.saveCurrentProject();

    projectPersistence.saveToLocalStorage(
      ProjectStorageKey.CURRENT,
      project.id
    );

    await dataOrchestrator.onProjectChanged();
  }

  async loadProject(id: string): Promise<void> {
    try {
      const project = await projectPersistence.loadProject(id);

      if (project) {
        this._state.currentProject = project;
        this._state.isDirty = false;
        this._state.lastSaved = new Date();
        this._state.history = [];
        this._state.historyIndex = -1;

        globalActions.clearAllDataButtons();

        if (project.data?.sourceFiles) {
          for (const file of project.data.sourceFiles) {
            globalActions.addDataButtonForFile(file.id, file.name);
          }
        }

        projectPersistence.saveToLocalStorage(
          ProjectStorageKey.CURRENT,
          project.id
        );

        await dataOrchestrator.onProjectChanged();
      }
    } catch (error) {
      throw error;
    }
  }

  async saveCurrentProject(): Promise<void> {
    if (!this._state.currentProject) {
      return;
    }

    try {
      this._state.currentProject.manifest.updatedAt = new Date();

      await projectPersistence.saveProject(this._state.currentProject);

      this._state.isDirty = false;
      this._state.lastSaved = new Date();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save project';
      showError('Failed to save project', message, error);
      throw error;
    }
  }

  async deleteProject(id: string): Promise<void> {
    try {
      await projectPersistence.deleteProject(id);

      if (this._state.currentProject?.id === id) {
        this._state.currentProject = undefined;
        projectPersistence.clearLocalStorage(ProjectStorageKey.CURRENT);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete project';
      showError('Failed to delete project', message, error);
      throw error;
    }
  }

  async listProjects(): Promise<SavedProjectMetadata[]> {
    return projectPersistence.listProjects();
  }

  async exportProject(customName?: string): Promise<void> {
    if (!this._state.currentProject) {
      return;
    }

    try {
      const blob = await projectPersistence.createProjectArchive(
        this._state.currentProject
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const projectName =
        customName || this._state.currentProject.manifest.name;
      const filename = generateProjectFilename(projectName);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to export project';
      showError('Failed to export project', message, error);
      throw error;
    }
  }

  async importProject(file: File): Promise<void> {
    try {
      const project = await projectPersistence.importProject(file);

      this._state.currentProject = project;
      this._state.isDirty = false;
      this._state.lastSaved = new Date();
      this._state.history = [];
      this._state.historyIndex = -1;

      projectPersistence.saveToLocalStorage(
        ProjectStorageKey.CURRENT,
        project.id
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to import project';
      showError('Failed to import project', message, error);
      throw error;
    }
  }

  markAsDirty(): void {
    this.markDirty();
  }

  updateProjectName(name: string): void {
    if (!this._state.currentProject) {
      return;
    }

    this._state.currentProject.manifest.name = name;
    this._state.currentProject.manifest.updatedAt = new Date();
    this.markDirty();

    this.addToHistory('Project name updated');
  }

  updateProjectData(data: Partial<ProjectData>): void {
    if (!this._state.currentProject) {
      return;
    }

    this._state.currentProject.data = {
      ...this._state.currentProject.data,
      ...data
    };
    this._state.currentProject.manifest.updatedAt = new Date();
    this.markDirty();

    this.addToHistory('Project data updated');
  }

  updateVisualization(config: Partial<VisualizationConfig>): void {
    if (!this._state.currentProject) {
      return;
    }

    this._state.currentProject.visualization = {
      ...this._state.currentProject.visualization,
      ...config
    } as VisualizationConfig;

    this._state.currentProject.manifest.updatedAt = new Date();
    this.markDirty();

    this.addToHistory('Visualization updated');
  }

  updateLayout(config: Partial<LayoutConfig>): void {
    if (!this._state.currentProject) {
      return;
    }

    this._state.currentProject.layout = {
      ...this._state.currentProject.layout,
      ...config
    };

    this._state.currentProject.manifest.updatedAt = new Date();
    this.markDirty();

    this.addToHistory('Layout updated');
  }

  undo(): void {
    if (!this.canUndo) {
      return;
    }

    this._state.historyIndex--;
    const entry = this._state.history[this._state.historyIndex];

    if (entry.snapshot) {
      this._state.currentProject = {
        ...this._state.currentProject!,
        ...entry.snapshot
      };
      this.markDirty();
    }
  }

  redo(): void {
    if (!this.canRedo) {
      return;
    }

    this._state.historyIndex++;
    const entry = this._state.history[this._state.historyIndex];

    if (entry.snapshot) {
      this._state.currentProject = {
        ...this._state.currentProject!,
        ...entry.snapshot
      };
      this.markDirty();
    }
  }

  clearProject(): void {
    this._state.currentProject = undefined;
    this._state.isDirty = false;
    this._state.lastSaved = undefined;
    this._state.history = [];
    this._state.historyIndex = -1;

    projectPersistence.clearLocalStorage(ProjectStorageKey.CURRENT);
  }

  private addToHistory(action: string, snapshot?: KhartisProject): void {
    if (this._state.historyIndex < this._state.history.length - 1) {
      this._state.history = this._state.history.slice(
        0,
        this._state.historyIndex + 1
      );
    }

    const entry: ProjectHistoryEntry = {
      timestamp: new Date(),
      action,
      snapshot: snapshot || this._state.currentProject
    };

    this._state.history.push(entry);
    this._state.historyIndex++;

    if (this._state.history.length > this._state.maxHistorySize) {
      this._state.history.shift();
      this._state.historyIndex--;
    }
  }

  private markDirty(): void {
    this._state.isDirty = true;
    if (this._state.autoSaveEnabled) {
      this.scheduleAutoSave();
    }
  }

  private scheduleAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    if (this._state.autoSaveEnabled && this._state.isDirty) {
      this.autoSaveTimer = window.setTimeout(() => {
        this.saveCurrentProject();
      }, this._state.autoSaveInterval);
    }
  }

  private async loadLastProject(): Promise<void> {
    const lastProjectId = projectPersistence.loadFromLocalStorage<string>(
      ProjectStorageKey.CURRENT
    );

    if (lastProjectId) {
      try {
        await this.loadProject(lastProjectId);
      } catch (error) {
        console.error('Failed to load last project:', error);
        // Don't show toast here as it's during initialization
      }
    }
  }

  setAutoSave(enabled: boolean, interval?: number): void {
    this._state.autoSaveEnabled = enabled;

    if (interval) {
      this._state.autoSaveInterval = interval;
    }

    if (enabled && this._state.isDirty) {
      this.scheduleAutoSave();
    } else if (!enabled && this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
  }
}

export const projectStore = new ProjectStore();
