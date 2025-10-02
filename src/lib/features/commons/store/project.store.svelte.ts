import { m } from '$lib/paraglide/messages';
import { dataOrchestrator } from '../services/data-orchestrator.service.svelte';
import { downloadFile } from '../utils/file-export.utils';
import { logger, LogCategory } from '../utils/logger';
import { showError } from '../utils/notification.utils.svelte';
import { projectPersistence } from '../utils/project-persistence.utils';
import { generateProjectFilename } from '../utils/string.utils';
import { ProjectValidator } from '../utils/validation.utils';
import type { UploadedFile } from './create-project.types';
import type {
  KhartisProject,
  LayoutConfig,
  ProjectData,
  ProjectHistoryEntry,
  ProjectState,
  SavedProjectMetadata,
  VisualizationConfig
} from './project.types';
import { ProjectStorageKey } from './project.types';

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

    const isFirstFile =
      this._state.currentProject.data.sourceFiles.length === 0;
    let addedFiles = 0;

    for (const file of newFiles) {
      const exists = this._state.currentProject.data.sourceFiles.find(
        (f) => f.id === file.id || f.name === file.name
      );
      if (!exists) {
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
          parsedData: file.parsedData
            ? JSON.parse(JSON.stringify(file.parsedData))
            : null,
          content: file.content,
          duplicates: file.duplicates,
          statistics: file.statistics,
          sourceType: file.sourceType
        };

        logger.debug('Adding file to sourceFiles', LogCategory.PROJECT, {
          name: fileCopy.name,
          parsedDataLength: Array.isArray(fileCopy.parsedData)
            ? fileCopy.parsedData.length
            : 0
        });

        this._state.currentProject.data.sourceFiles = [
          ...this._state.currentProject.data.sourceFiles,
          fileCopy
        ];

        addedFiles++;

        try {
          await dataOrchestrator.onFileAdded(fileCopy);
        } catch (error) {
          logger.error('Failed to process file', LogCategory.PROJECT, error);

          this._state.currentProject.data.sourceFiles =
            this._state.currentProject.data.sourceFiles.filter(
              (f) => f.id !== fileCopy.id
            );

          throw error;
        }
      }
    }

    this._state.isDirty = true;
    await this.saveCurrentProject();
  }

  async removeFileFromProject(fileId: string): Promise<void> {
    if (!this._state.currentProject?.data?.sourceFiles) {
      return;
    }

    this._state.currentProject.data.sourceFiles =
      this._state.currentProject.data.sourceFiles.filter(
        (f) => f.id !== fileId
      );

    await dataOrchestrator.onFileRemoved(fileId);

    this._state.isDirty = true;
    await this.saveCurrentProject();
  }

  async createProject(name: string, files: UploadedFile[]): Promise<void> {
    const nameValidation = ProjectValidator.validateProjectName(name);
    if (!nameValidation.isValid) {
      throw new Error(nameValidation.errors.join(', '));
    }

    const sanitizedName = ProjectValidator.sanitizeProjectName(name);

    const project: KhartisProject = {
      id: crypto.randomUUID(),
      manifest: {
        version: '3.0.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        name: sanitizedName,
        format: 'kh'
      },
      data: {
        sourceFiles: files
      }
    };

    this._state.currentProject = project;
    this._state.isDirty = false;
    this._state.lastSaved = new Date();

    this.addToHistory('Project created', project);

    await this.saveCurrentProject();

    await projectPersistence.saveToStorage(
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

        await projectPersistence.saveToStorage(
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
      const projectValidation = ProjectValidator.validateProjectSize(
        this._state.currentProject
      );
      if (!projectValidation.isValid) {
        throw new Error(projectValidation.errors.join(', '));
      }

      if (projectValidation.warnings.length > 0) {
        projectValidation.warnings.forEach((warning) =>
          logger.warn(warning, LogCategory.PROJECT)
        );
      }
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
        await projectPersistence.clearStorage(ProjectStorageKey.CURRENT);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete project';
      showError('Failed to delete project', message, error);
      throw error;
    }
  }

  async duplicateProject(id: string, newName?: string): Promise<string> {
    try {
      const originalProject = await projectPersistence.loadProject(id);

      if (!originalProject) {
        throw new Error('Project not found');
      }

      const projects = await this.listProjects();
      const capacityCheck = ProjectValidator.validateStorageCapacity(
        projects.length
      );
      if (!capacityCheck.isValid) {
        throw new Error(capacityCheck.errors.join(', '));
      }

      const duplicationSuffix = (m as any).project_duplicate_suffix
        ? (m as any).project_duplicate_suffix()
        : '(copy)';
      const duplicatedName =
        newName || `${originalProject.manifest.name} ${duplicationSuffix}`;
      const nameValidation =
        ProjectValidator.validateProjectName(duplicatedName);
      if (!nameValidation.isValid) {
        throw new Error(nameValidation.errors.join(', '));
      }

      const duplicatedProject: KhartisProject = {
        ...JSON.parse(JSON.stringify(originalProject)),
        id: crypto.randomUUID(),
        manifest: {
          ...originalProject.manifest,
          name: ProjectValidator.sanitizeProjectName(duplicatedName),
          createdAt: new Date(),
          updatedAt: new Date()
        }
      };

      await projectPersistence.saveProject(duplicatedProject);

      return duplicatedProject.id;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to duplicate project';
      showError('Failed to duplicate project', message, error);
      throw error;
    }
  }

  async listProjects(): Promise<SavedProjectMetadata[]> {
    const projects = await projectPersistence.listProjects();

    const storageCheck = ProjectValidator.validateStorageCapacity(
      projects.length
    );
    if (storageCheck.warnings.length > 0) {
      storageCheck.warnings.forEach((warning) =>
        logger.warn(warning, LogCategory.PERSISTENCE)
      );
    }

    return projects;
  }

  async exportProject(customName?: string): Promise<void> {
    if (!this._state.currentProject) {
      return;
    }

    try {
      const blob = await projectPersistence.createProjectArchive(
        this._state.currentProject
      );

      const projectName =
        customName || this._state.currentProject.manifest.name;
      const filename = generateProjectFilename(projectName);

      downloadFile(blob, filename);
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

      await projectPersistence.saveToStorage(
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

  async clearProject(): Promise<void> {
    this._state.currentProject = undefined;
    this._state.isDirty = false;
    this._state.lastSaved = undefined;
    this._state.history = [];
    this._state.historyIndex = -1;

    await projectPersistence.clearStorage(ProjectStorageKey.CURRENT);
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
    const lastProjectId = await projectPersistence.loadFromStorage<string>(
      ProjectStorageKey.CURRENT
    );

    if (lastProjectId) {
      try {
        await this.loadProject(lastProjectId);
      } catch (error) {
        logger.error('Failed to load last project', LogCategory.PROJECT, error);
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
