import type {
  CreateProjectState,
  ExampleCategory,
  ExampleProject,
  ProjectTab,
  SavedProject,
  UploadedFile
} from './create-project.types';

const DEFAULT_STATE: CreateProjectState = {
  isModalOpen: false,
  selectedTab: 1,

  newProject: {
    uploadedFiles: [],
    pastedData: '',
    onlineFileUrl: '',
    projectName: '',
    isLoading: false
  },

  openProject: {
    savedProjects: [],
    isLoading: false
  },

  tryExample: {
    examples: [],
    selectedCategory: 'all',
    isLoading: false
  }
};

export const createProjectState = $state<CreateProjectState>({
  ...DEFAULT_STATE
});

export const createProjectActions = {
  // Modal actions
  openModal(): void {
    createProjectState.isModalOpen = true;
    console.log('[CreateProject] 🔄 Modal opened');
  },

  closeModal(): void {
    createProjectState.isModalOpen = false;
    this.resetAllTabs();
    console.log('[CreateProject] 🔄 Modal closed');
  },

  // Tab actions
  selectTab(tab: ProjectTab): void {
    createProjectState.selectedTab = tab;
    console.log('[CreateProject] 🔄 Tab selected:', tab);
  },

  // New project actions
  addUploadedFile(file: UploadedFile): void {
    createProjectState.newProject.uploadedFiles.push(file);
    console.log('[CreateProject] 🔄 File uploaded:', file.name);
  },

  removeUploadedFile(fileId: string): void {
    const index = createProjectState.newProject.uploadedFiles.findIndex(
      (f) => f.id === fileId
    );
    if (index !== -1) {
      const fileName = createProjectState.newProject.uploadedFiles[index].name;
      createProjectState.newProject.uploadedFiles.splice(index, 1);
      console.log('[CreateProject] 🔄 File removed:', fileName);
    }
  },

  updateFileStatus(
    fileId: string,
    status: UploadedFile['status'],
    errorMessage?: string
  ): void {
    const file = createProjectState.newProject.uploadedFiles.find(
      (f) => f.id === fileId
    );
    if (file) {
      file.status = status;
      if (errorMessage) {
        file.errorMessage = errorMessage;
      }
      console.log('[CreateProject] 🔄 File status updated:', file.name, status);
    }
  },

  setPastedData(data: string): void {
    createProjectState.newProject.pastedData = data;
    console.log('[CreateProject] 🔄 Pasted data updated');
  },

  setOnlineFileUrl(url: string): void {
    createProjectState.newProject.onlineFileUrl = url;
    console.log('[CreateProject] 🔄 Online file URL updated:', url);
  },

  setProjectName(name: string): void {
    createProjectState.newProject.projectName = name;
    console.log('[CreateProject] 🔄 Project name updated:', name);
  },

  setNewProjectLoading(loading: boolean): void {
    createProjectState.newProject.isLoading = loading;
  },

  setNewProjectError(error?: string): void {
    createProjectState.newProject.error = error;
    if (error) {
      console.error('[CreateProject] ❌ New project error:', error);
    }
  },

  async loadOnlineFile(): Promise<void> {
    const url = createProjectState.newProject.onlineFileUrl;
    if (!url) return;

    this.setNewProjectLoading(true);
    this.setNewProjectError();

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const filename = url.split('/').pop() || 'online-file';
      const blob = await response.blob();

      const file: UploadedFile = {
        id: crypto.randomUUID(),
        name: filename,
        size: blob.size,
        type: blob.type,
        status: 'complete'
      };

      this.addUploadedFile(file);
      this.setOnlineFileUrl('');
      console.log('[CreateProject] ✅ Online file loaded:', filename);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load online file';
      this.setNewProjectError(message);
    } finally {
      this.setNewProjectLoading(false);
    }
  },

  // Open project actions
  setSavedProjects(projects: SavedProject[]): void {
    createProjectState.openProject.savedProjects = projects;
    console.log('[CreateProject] 🔄 Saved projects updated:', projects.length);
  },

  selectSavedProject(projectId?: string): void {
    createProjectState.openProject.selectedProjectId = projectId;
    console.log('[CreateProject] 🔄 Saved project selected:', projectId);
  },

  setImportedFile(file?: UploadedFile): void {
    createProjectState.openProject.importedFile = file;
    console.log('[CreateProject] 🔄 Project file imported:', file?.name);
  },

  setOpenProjectLoading(loading: boolean): void {
    createProjectState.openProject.isLoading = loading;
  },

  setOpenProjectError(error?: string): void {
    createProjectState.openProject.error = error;
    if (error) {
      console.error('[CreateProject] ❌ Open project error:', error);
    }
  },

  // Try example actions
  setExamples(examples: ExampleProject[]): void {
    createProjectState.tryExample.examples = examples;
    console.log('[CreateProject] 🔄 Examples updated:', examples.length);
  },

  selectExample(exampleId?: string): void {
    createProjectState.tryExample.selectedExampleId = exampleId;
    console.log('[CreateProject] 🔄 Example selected:', exampleId);
  },

  setExampleCategory(category: ExampleCategory): void {
    createProjectState.tryExample.selectedCategory = category;
    createProjectState.tryExample.selectedExampleId = undefined;
    console.log('[CreateProject] 🔄 Example category changed:', category);
  },

  setTryExampleLoading(loading: boolean): void {
    createProjectState.tryExample.isLoading = loading;
  },

  setTryExampleError(error?: string): void {
    createProjectState.tryExample.error = error;
    if (error) {
      console.error('[CreateProject] ❌ Try example error:', error);
    }
  },

  // Utility actions
  resetNewProject(): void {
    Object.assign(createProjectState.newProject, DEFAULT_STATE.newProject);
    console.log('[CreateProject] 🔄 New project state reset');
  },

  resetOpenProject(): void {
    Object.assign(createProjectState.openProject, {
      ...DEFAULT_STATE.openProject,
      savedProjects: createProjectState.openProject.savedProjects // Keep loaded projects
    });
    console.log('[CreateProject] 🔄 Open project state reset');
  },

  resetTryExample(): void {
    Object.assign(createProjectState.tryExample, {
      ...DEFAULT_STATE.tryExample,
      examples: createProjectState.tryExample.examples // Keep loaded examples
    });
    console.log('[CreateProject] 🔄 Try example state reset');
  },

  resetAllTabs(): void {
    this.resetNewProject();
    this.resetOpenProject();
    this.resetTryExample();
    createProjectState.selectedTab = 1;
    console.log('[CreateProject] 🔄 All tabs reset');
  },

  reset(): void {
    Object.assign(createProjectState, DEFAULT_STATE);
    console.log('[CreateProject] 🔄 Complete state reset');
  }
};
