import { m } from '$lib/paraglide/messages';
import { dataOrchestrator } from '../services/data-orchestrator.service.svelte';
import { downloadFile } from '../utils/file-export.utils';
import { logger, LogCategory } from '../utils/logger';
import { showError } from '../utils/notification.utils.svelte';
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
} from '$lib/features/project-management';
import {
  ProjectStorageKey,
  projectRepository,
  projectFiles,
  projectStorage,
  duplicateProject as duplicateProjectEntity,
  AutoSaveController
} from '$lib/features/project-management';

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

  private autoSave = new AutoSaveController(() => this.saveCurrentProject());

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
          parsedData: file.parsedData,
          content: file.content,
          preparedGeoJSON: file.preparedGeoJSON,
          duplicates: file.duplicates,
          statistics: file.statistics,
          sourceType: file.sourceType,
          deepAnalysis: file.deepAnalysis,
          geoMatchResult: file.geoMatchResult,
          relatedFileObjects: file.relatedFileObjects,
          originalFile: file.originalFile,
          relatedFiles: file.relatedFiles
        };

        // Force reactivity by reassigning currentProject with deep copy of data
        // Do everything in one assignment to avoid intermediate states

        this._state.currentProject = {
          ...this._state.currentProject,
          data: {
            ...this._state.currentProject.data,
            sourceFiles: [
              ...this._state.currentProject.data.sourceFiles,
              fileCopy
            ]
          }
        };

        try {
          await dataOrchestrator.onFileAdded(fileCopy);
        } catch (error) {
          logger.error('Failed to process file', LogCategory.PROJECT, error);

          // Force reactivity by reassigning currentProject with deep copy of data
          // Remove the failed file in one assignment
          this._state.currentProject = {
            ...this._state.currentProject,
            data: {
              ...this._state.currentProject.data,
              sourceFiles: this._state.currentProject.data.sourceFiles.filter(
                (f) => f.id !== fileCopy.id
              )
            }
          };

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

    // Force reactivity by reassigning currentProject with deep copy of data
    // Remove the file in one assignment to avoid intermediate states
    this._state.currentProject = {
      ...this._state.currentProject,
      data: {
        ...this._state.currentProject.data,
        sourceFiles: this._state.currentProject.data.sourceFiles.filter(
          (f) => f.id !== fileId
        )
      }
    };

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

    await projectStorage.save(ProjectStorageKey.CURRENT, project.id);

    await dataOrchestrator.onProjectChanged();
  }

  async loadProject(id: string): Promise<void> {
    const project = await projectRepository.load(id);

    if (project) {
      this._state.currentProject = project;
      this._state.isDirty = false;
      this._state.lastSaved = new Date();
      this._state.history = [];
      this._state.historyIndex = -1;

      await projectStorage.save(ProjectStorageKey.CURRENT, project.id);

      await dataOrchestrator.onProjectChanged();
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
        projectValidation.warnings.forEach((warning) => {
          logger.warn(
            `[ProjectStore:saveCurrentProject] ${warning}`,
            LogCategory.PROJECT,
            {
              projectId: this._state.currentProject?.id
            }
          );
        });
      }
      this._state.currentProject.manifest.updatedAt = new Date();

      await projectRepository.save(this._state.currentProject);
      this._state.isDirty = false;
      this._state.lastSaved = new Date();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save project';
      logger.error(
        'Failed to save project to IndexedDB',
        LogCategory.PROJECT,
        error
      );
      showError('Failed to save project', message, error);
      throw error;
    }
  }

  async deleteProject(id: string): Promise<void> {
    try {
      await projectRepository.remove(id);

      if (this._state.currentProject?.id === id) {
        this._state.currentProject = undefined;
        await projectStorage.remove(ProjectStorageKey.CURRENT);
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
      const originalProject = await projectRepository.load(id);

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

      const duplicationSuffix =
        typeof m.project_duplicate_suffix === 'function'
          ? m.project_duplicate_suffix()
          : '(copy)';
      const duplicatedName =
        newName || `${originalProject.manifest.name} ${duplicationSuffix}`;
      const nameValidation =
        ProjectValidator.validateProjectName(duplicatedName);
      if (!nameValidation.isValid) {
        throw new Error(nameValidation.errors.join(', '));
      }

      const duplicatedProject = duplicateProjectEntity(
        originalProject,
        ProjectValidator.sanitizeProjectName(duplicatedName)
      );

      await projectRepository.save(duplicatedProject);

      return duplicatedProject.id;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to duplicate project';
      showError('Failed to duplicate project', message, error);
      throw error;
    }
  }

  async listProjects(): Promise<SavedProjectMetadata[]> {
    const projects = await projectRepository.listMetadata();

    const storageCheck = ProjectValidator.validateStorageCapacity(
      projects.length
    );
    if (storageCheck.warnings.length > 0) {
      storageCheck.warnings.forEach((warning) => {
        logger.warn(
          `[ProjectStore:listProjects] ${warning}`,
          LogCategory.PROJECT,
          {
            projectCount: projects.length
          }
        );
      });
    }

    return projects;
  }

  async exportProject(customName?: string): Promise<void> {
    if (!this._state.currentProject) {
      return;
    }

    try {
      const blob = await projectFiles.createArchive(this._state.currentProject);

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
      const project = await projectFiles.importProject(file);

      this._state.currentProject = project;
      this._state.isDirty = false;
      this._state.lastSaved = new Date();
      this._state.history = [];
      this._state.historyIndex = -1;

      await projectStorage.save(ProjectStorageKey.CURRENT, project.id);
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

    await projectStorage.remove(ProjectStorageKey.CURRENT);
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
    this.scheduleAutoSave();
  }

  private scheduleAutoSave(): void {
    this.autoSave.updateConfig({
      enabled: this._state.autoSaveEnabled,
      interval: this._state.autoSaveInterval
    });
    this.autoSave.schedule(this._state.isDirty);
  }

  private async loadLastProject(): Promise<void> {
    const lastProjectId = await projectStorage.load<string>(
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

    this.autoSave.updateConfig({
      enabled: this._state.autoSaveEnabled,
      interval: this._state.autoSaveInterval
    });

    if (enabled && this._state.isDirty) {
      this.scheduleAutoSave();
    } else if (!enabled) {
      this.autoSave.cancel();
    }
  }
}

export const projectStore = new ProjectStore();
