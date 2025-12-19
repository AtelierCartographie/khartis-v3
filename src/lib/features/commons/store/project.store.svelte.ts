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
  AutoSaveController,
  ProjectStorageKey,
  duplicateProject as duplicateProjectEntity,
  projectFiles,
  projectRepository,
  projectStorage
} from '$lib/features/project-management';
import { m } from '$lib/paraglide/messages';
import { dataOrchestratorService } from '../services/data-orchestrator.service.svelte';
import { downloadFile } from '../utils/file-export.utils';
import { LogCategory, logger } from '../utils/logger';
import { showError } from '../utils/notification.utils.svelte';
import { sanitizeProjectName } from '../utils/sanitize.utils';
import { generateProjectFilename } from '../utils/string.utils';
import { ProjectValidator } from '../utils/validation.utils';
import type {
  ColumnTransformation,
  UploadedFile
} from './create-project.types';
import { bigIntReplacer } from '$lib/features/project-management/utils/json-helpers';

function cleanFileForStorage(file: UploadedFile): UploadedFile {
  return {
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
    relatedFiles: file.relatedFiles,
    relatedFilesData: file.relatedFilesData,
    columnTransformations: file.columnTransformations,
    duckdbTableName: file.duckdbTableName,
    sourceArchive: file.sourceArchive
  };
}

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
        const fileCopy = cleanFileForStorage(file);

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
          await dataOrchestratorService.onFileAdded(fileCopy);
        } catch (error) {
          logger.error('Failed to process file', LogCategory.PROJECT, error);

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

    this._state.currentProject = {
      ...this._state.currentProject,
      data: {
        ...this._state.currentProject.data,
        sourceFiles: this._state.currentProject.data.sourceFiles.filter(
          (f) => f.id !== fileId
        )
      }
    };

    await dataOrchestratorService.onFileRemoved(fileId);

    this._state.isDirty = true;
    await this.saveCurrentProject();
  }

  async renameFile(fileId: string, newName: string): Promise<void> {
    if (!this._state.currentProject?.data?.sourceFiles) {
      return;
    }

    const fileIndex = this._state.currentProject.data.sourceFiles.findIndex(
      (f) => f.id === fileId
    );

    if (fileIndex === -1) {
      return;
    }

    const currentFile = this._state.currentProject.data.sourceFiles[fileIndex];
    const oldName = currentFile.name;

    const getBaseName = (fileName: string) => {
      const lastDot = fileName.lastIndexOf('.');
      return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
    };

    const oldBaseName = getBaseName(oldName);
    const newBaseName = getBaseName(newName);

    const updatedFiles = [...this._state.currentProject.data.sourceFiles];
    const updatedFile = { ...updatedFiles[fileIndex], name: newName };

    if (updatedFile.relatedFilesData && oldBaseName !== newBaseName) {
      const renamedData: Record<string, ArrayBuffer> = {};
      for (const [fileName, buffer] of Object.entries(
        updatedFile.relatedFilesData
      )) {
        const fileBaseName = getBaseName(fileName);
        const fileExt = fileName.slice(fileBaseName.length);
        if (fileBaseName.toLowerCase() === oldBaseName.toLowerCase()) {
          renamedData[newBaseName + fileExt] = buffer;
        } else {
          renamedData[fileName] = buffer;
        }
      }
      updatedFile.relatedFilesData = renamedData;
    }

    if (updatedFile.relatedFiles && oldBaseName !== newBaseName) {
      updatedFile.relatedFiles = updatedFile.relatedFiles.map((fileName) => {
        const fileBaseName = getBaseName(fileName);
        const fileExt = fileName.slice(fileBaseName.length);
        if (fileBaseName.toLowerCase() === oldBaseName.toLowerCase()) {
          return newBaseName + fileExt;
        }
        return fileName;
      });
    }

    updatedFiles[fileIndex] = updatedFile;

    this._state.currentProject = {
      ...this._state.currentProject,
      data: {
        ...this._state.currentProject.data,
        sourceFiles: updatedFiles
      }
    };

    this._state.isDirty = true;
    await this.saveCurrentProject();
  }

  async addColumnTransformation(
    fileId: string,
    transformation: ColumnTransformation
  ): Promise<void> {
    if (!this._state.currentProject?.data?.sourceFiles) {
      return;
    }

    const fileIndex = this._state.currentProject.data.sourceFiles.findIndex(
      (f) => f.id === fileId
    );

    if (fileIndex === -1) {
      return;
    }

    const file = this._state.currentProject.data.sourceFiles[fileIndex];
    const updatedTransformations = [
      ...(file.columnTransformations ?? []),
      transformation
    ];

    const updatedFiles = [...this._state.currentProject.data.sourceFiles];
    updatedFiles[fileIndex] = {
      ...file,
      columnTransformations: updatedTransformations
    };

    this._state.currentProject = {
      ...this._state.currentProject,
      data: {
        ...this._state.currentProject.data,
        sourceFiles: updatedFiles
      }
    };

    this._state.isDirty = true;
    await this.saveCurrentProject();
  }

  async clearColumnTransformations(fileId: string): Promise<void> {
    if (!this._state.currentProject?.data?.sourceFiles) {
      return;
    }

    const fileIndex = this._state.currentProject.data.sourceFiles.findIndex(
      (f) => f.id === fileId
    );

    if (fileIndex === -1) {
      return;
    }

    const updatedFiles = [...this._state.currentProject.data.sourceFiles];
    updatedFiles[fileIndex] = {
      ...updatedFiles[fileIndex],
      columnTransformations: [],
      deletedRowIds: []
    };

    this._state.currentProject = {
      ...this._state.currentProject,
      data: {
        ...this._state.currentProject.data,
        sourceFiles: updatedFiles
      }
    };

    this._state.isDirty = true;
    await this.saveCurrentProject();
  }

  async addDeletedRows(fileId: string, rowIds: number[]): Promise<void> {
    if (!this._state.currentProject?.data?.sourceFiles) {
      logger.warn(
        'No project or source files to add deleted rows',
        LogCategory.PROJECT
      );
      return;
    }

    const fileIndex = this._state.currentProject.data.sourceFiles.findIndex(
      (f) => f.id === fileId
    );

    if (fileIndex === -1) {
      logger.warn(
        'File not found for adding deleted rows',
        LogCategory.PROJECT,
        {
          fileId,
          availableFileIds: this._state.currentProject.data.sourceFiles.map(
            (f) => f.id
          )
        }
      );
      return;
    }

    const file = this._state.currentProject.data.sourceFiles[fileIndex];
    const existingDeleted = file.deletedRowIds ?? [];
    const newDeletedIds = [...new Set([...existingDeleted, ...rowIds])];

    logger.info('Adding deleted rows to file', LogCategory.PROJECT, {
      fileId,
      newRowIds: rowIds.length,
      totalDeleted: newDeletedIds.length
    });

    const updatedFiles = [...this._state.currentProject.data.sourceFiles];
    updatedFiles[fileIndex] = {
      ...file,
      deletedRowIds: newDeletedIds
    };

    this._state.currentProject = {
      ...this._state.currentProject,
      data: {
        ...this._state.currentProject.data,
        sourceFiles: updatedFiles
      }
    };

    this._state.isDirty = true;
    await this.saveCurrentProject();
  }

  async createProject(name: string, files: UploadedFile[]): Promise<void> {
    if (this._state.currentProject) {
      await this.saveCurrentProject();
    }

    const nameValidation = ProjectValidator.validateProjectName(name);
    if (!nameValidation.isValid) {
      throw new Error(nameValidation.errors.join(', '));
    }

    const sanitizedName = sanitizeProjectName(name);

    const cleanedFiles = files.map(cleanFileForStorage);

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
        sourceFiles: cleanedFiles
      }
    };

    this._state.currentProject = project;
    this._state.isDirty = false;
    this._state.lastSaved = new Date();

    this.addToHistory('Project created', project);

    await this.saveCurrentProject();

    await projectStorage.save(ProjectStorageKey.CURRENT, project.id);

    await dataOrchestratorService.onProjectChanged();
  }

  async loadProject(id: string): Promise<void> {
    if (this._state.currentProject && this._state.isDirty) {
      await this.saveCurrentProject();
    }

    const project = await projectRepository.load(id);

    if (project) {
      this._state.currentProject = project;
      this._state.isDirty = false;
      this._state.lastSaved = new Date();
      this._state.history = [];
      this._state.historyIndex = -1;

      this.addToHistory('Project loaded', project);

      await projectStorage.save(ProjectStorageKey.CURRENT, project.id);

      await dataOrchestratorService.onProjectChanged();
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
        error instanceof Error ? error.message : m.error_save_project_title();
      logger.error(
        'Failed to save project to IndexedDB',
        LogCategory.PROJECT,
        error
      );
      showError(m.error_save_project_title(), message, error);
      throw error;
    }
  }

  async deleteProject(id: string): Promise<void> {
    try {
      await projectRepository.remove(id);

      if (this._state.currentProject?.id === id) {
        this._state.currentProject = undefined;
        await projectStorage.remove(ProjectStorageKey.CURRENT);
        await dataOrchestratorService.onProjectChanged();
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : m.error_delete_project_title();
      showError(m.error_delete_project_title(), message, error);
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
        sanitizeProjectName(duplicatedName)
      );

      await projectRepository.save(duplicatedProject);

      return duplicatedProject.id;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : m.error_duplicate_project_title();
      showError(m.error_duplicate_project_title(), message, error);
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
        error instanceof Error ? error.message : m.error_export_project_title();
      showError(m.error_export_project_title(), message, error);
      throw error;
    }
  }

  async importProject(file: File): Promise<void> {
    if (this._state.currentProject && this._state.isDirty) {
      await this.saveCurrentProject();
    }

    try {
      const project = await projectFiles.importProject(file);

      this._state.currentProject = project;
      this._state.isDirty = false;
      this._state.lastSaved = new Date();
      this._state.history = [];
      this._state.historyIndex = -1;

      this.addToHistory('Project imported', project);

      await projectStorage.save(ProjectStorageKey.CURRENT, project.id);

      await dataOrchestratorService.onProjectChanged();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : m.error_import_project_title();
      showError(m.error_import_project_title(), message, error);
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
      this._state.currentProject = JSON.parse(
        JSON.stringify(entry.snapshot, bigIntReplacer)
      ) as KhartisProject;
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
      this._state.currentProject = JSON.parse(
        JSON.stringify(entry.snapshot, bigIntReplacer)
      ) as KhartisProject;
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

    const projectToSnapshot = snapshot || this._state.currentProject;
    const clonedSnapshot = projectToSnapshot
      ? (JSON.parse(
          JSON.stringify(projectToSnapshot, bigIntReplacer)
        ) as KhartisProject)
      : undefined;

    const entry: ProjectHistoryEntry = {
      timestamp: new Date(),
      action,
      snapshot: clonedSnapshot
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
