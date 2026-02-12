import type {
  KhartisProject,
  LayoutConfig,
  ProjectData,
  ProjectHistoryEntry,
  SavedProjectMetadata,
  VisualizationConfig
} from '$lib/features/project-management';
import { AutoSaveController } from '$lib/features/project-management';
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

class ProjectStore implements ProjectStateContainer {
  _state = $state(createProjectState());

  autoSave: AutoSaveController;

  initPromise?: Promise<void>;

  constructor() {
    this.autoSave = new AutoSaveController(() => this.saveCurrentProject());

    if (typeof window !== 'undefined') {
      this.initPromise = this.initialize();
    }
  }

  private async initialize(): Promise<void> {
    this._state.isLoading = true;
    try {
      await loadLastProjectFn(this);
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

  get currentProject(): KhartisProject | undefined {
    return this._state.currentProject;
  }

  get projectName(): string {
    return this._state.currentProject?.manifest.name || '';
  }

  get isDirty(): boolean {
    return this._state.isDirty;
  }

  get canUndo(): boolean {
    return canUndoFn(this);
  }

  get canRedo(): boolean {
    return canRedoFn(this);
  }

  get history(): ProjectHistoryEntry[] {
    return this._state.history;
  }

  get isInitialized(): boolean {
    return this._state.isInitialized;
  }

  get isLoading(): boolean {
    return this._state.isLoading;
  }

  async addFilesToProject(newFiles: UploadedFile[]): Promise<void> {
    return addFilesToProjectFn(this, newFiles);
  }

  addVirtualSourceFile(file: UploadedFile): void {
    addVirtualSourceFileFn(this, file);
    this.markAsDirty();
  }

  async removeFileFromProject(fileId: string): Promise<void> {
    return removeFileFromProjectFn(this, fileId);
  }

  async renameFile(fileId: string, newName: string): Promise<void> {
    return renameFileFn(this, fileId, newName);
  }

  async addColumnTransformation(
    fileId: string,
    transformation: ColumnTransformation
  ): Promise<void> {
    return addColumnTransformationFn(this, fileId, transformation);
  }

  async clearColumnTransformations(fileId: string): Promise<void> {
    return clearColumnTransformationsFn(this, fileId);
  }

  async addDeletedRows(fileId: string, rowIds: number[]): Promise<void> {
    return addDeletedRowsFn(this, fileId, rowIds);
  }

  async createProject(name: string, files: UploadedFile[]): Promise<void> {
    return createProjectFn(this, name, files);
  }

  async loadProject(id: string): Promise<void> {
    return loadProjectFn(this, id);
  }

  async saveCurrentProject(): Promise<void> {
    return saveCurrentProjectFn(this);
  }

  async deleteProject(id: string): Promise<void> {
    return deleteProjectFn(this, id);
  }

  async duplicateProject(id: string, newName?: string): Promise<string> {
    return duplicateProjectFn(this, id, newName);
  }

  async listProjects(): Promise<SavedProjectMetadata[]> {
    return listProjectsFn();
  }

  async exportProject(customName?: string): Promise<void> {
    return exportProjectFn(this, customName);
  }

  async importProject(file: File): Promise<void> {
    return importProjectFn(this, file);
  }

  markAsDirty(): void {
    markDirtyFn(this);
  }

  updateProjectName(name: string): void {
    if (!this._state.currentProject) {
      return;
    }

    this._state.currentProject.manifest.name = name;
    this._state.currentProject.manifest.updatedAt = new Date();
    markDirtyFn(this);
    addToHistoryFn(this, 'Project name updated');
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
    markDirtyFn(this);
    addToHistoryFn(this, 'Project data updated');
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
    markDirtyFn(this);
    addToHistoryFn(this, 'Visualization updated');
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
    markDirtyFn(this);
    addToHistoryFn(this, 'Layout updated');
  }

  undo(): void {
    if (undoFn(this)) {
      markDirtyFn(this);
    }
  }

  redo(): void {
    if (redoFn(this)) {
      markDirtyFn(this);
    }
  }

  async clearProject(): Promise<void> {
    return clearProjectFn(this);
  }

  setAutoSave(enabled: boolean, interval?: number): void {
    setAutoSaveFn(this, enabled, interval);
  }
}

export const projectStore = new ProjectStore();
