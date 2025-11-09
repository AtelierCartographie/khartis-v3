import {
  FileProcessorService,
  type ProcessingCallbacks
} from '../../create-project/services/file-processor.service';
import { CreateProjectValidationService } from '../../create-project/services/validation.service';
import {
  createUploadedFile,
  extractDataFromPaste,
  FileType,
  getFilenameFromUrl,
  groupShapefiles,
  isShapefileComponent,
  isValidUrl,
  parseShapefile,
  readFileContent
} from '../utils/file-import.utils';
import { DataSourceType } from './create-project.types';
import { LogCategory, logger } from '../utils/logger';
import { showError, showWarning } from '../utils/notification.utils.svelte';
import type {
  CreateProjectState,
  ExampleCategory,
  ExampleProject,
  ProjectTab,
  SavedProject,
  UploadedFile
} from './create-project.types';
import { projectStore } from './project.store.svelte';
import { datasetsStore } from './datasets.store.svelte';
import { visualizationStore } from './visualization.store.svelte';
import { duckDBOrchestrator } from '../services/duckdb-orchestrator.service';
import { SvelteMap } from 'svelte/reactivity';

const DEFAULT_STATE: CreateProjectState = {
  selectedTab: 1,

  newProject: {
    uploadedFiles: [],
    pastedData: '',
    onlineFileUrl: '',
    projectName: '',
    isLoading: false,
    validationErrors: []
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
  selectTab(tab: ProjectTab): void {
    createProjectState.selectedTab = tab;
  },

  addUploadedFile(file: UploadedFile): void {
    createProjectState.newProject.uploadedFiles.push(file);
  },

  isFileDuplicate(fileName: string): boolean {
    const uploadingFiles = createProjectState.newProject.uploadedFiles;

    const isInUploadingFiles = uploadingFiles.some(
      (f) => f.name === fileName && f.status !== 'error'
    );

    if (isInUploadingFiles) {
      return true;
    }

    const currentProject = projectStore.currentProject;
    if (currentProject?.data?.sourceFiles) {
      return currentProject.data.sourceFiles.some((f) => f.name === fileName);
    }

    return false;
  },

  async processFiles(files: File[]): Promise<void> {
    const validationResult =
      CreateProjectValidationService.validateFiles(files);

    createProjectState.newProject.validationErrors =
      validationResult.globalErrors;

    const fileGroups = groupShapefiles(files);
    const duplicates: string[] = [];
    const toProcess: SvelteMap<string, File[]> = new SvelteMap();

    for (const [baseName, groupFiles] of fileGroups) {
      const mainFileName =
        groupFiles.length === 1 ? groupFiles[0].name : baseName + '.shp';

      if (this.isFileDuplicate(mainFileName)) {
        duplicates.push(mainFileName);
      } else {
        toProcess.set(baseName, groupFiles);
      }
    }

    if (!validationResult.isValid) {
      for (const [baseName, groupFiles] of toProcess) {
        const mainFile =
          groupFiles.find((f) => f.name.endsWith('.shp')) || groupFiles[0];
        const mainFileName = mainFile.name;
        const fileValidation = validationResult.results.get(mainFileName);

        const shapefileGlobalError = validationResult.globalErrors.find((err) =>
          err.includes(`Shapefile "${baseName}"`)
        );

        const errors: string[] = [];
        const warnings: string[] = [];

        if (fileValidation) {
          errors.push(...fileValidation.errors);
          warnings.push(...fileValidation.warnings);
        }

        if (shapefileGlobalError) {
          errors.push(
            shapefileGlobalError.replace(
              `Shapefile "${baseName}" incomplet. `,
              ''
            )
          );
        }

        if (errors.length > 0 || warnings.length > 0) {
          const errorFile: UploadedFile = {
            id: crypto.randomUUID(),
            name: mainFileName,
            size: mainFile.size,
            status: 'error',
            uploadProgress: 100,
            type: mainFile.type,
            fileType: mainFile.name.endsWith('.shp')
              ? FileType.SHAPEFILE
              : FileType.UNKNOWN,
            sourceType: DataSourceType.FILE_UPLOAD,
            relatedFiles: groupFiles
              .filter((f) => f !== mainFile)
              .map((f) => f.name),
            validation: {
              isValid: errors.length === 0,
              errors,
              warnings
            }
          };
          this.addUploadedFile(errorFile);
        }
      }
      return;
    }

    if (duplicates.length > 0) {
      showWarning(
        'Fichiers déjà importés',
        `Les fichiers suivants existent déjà : ${duplicates.join(', ')}`
      );
    }

    for (const [baseName, groupFiles] of toProcess) {
      if (
        groupFiles.length === 1 &&
        !isShapefileComponent(groupFiles[0].name)
      ) {
        await this.processSingleFile(groupFiles[0]);
      } else {
        await this.processShapefileGroup(baseName, groupFiles);
      }
    }
  },

  async processSingleFile(
    file: File,
    sourceType: DataSourceType = DataSourceType.FILE_UPLOAD
  ): Promise<void> {
    if (this.isFileDuplicate(file.name)) {
      showWarning(
        'Fichier déjà importé',
        `Le fichier "${file.name}" existe déjà dans le projet`
      );
      return;
    }

    const uploadedFile = createUploadedFile(file, sourceType);
    this.addUploadedFile(uploadedFile);

    const callbacks: ProcessingCallbacks = {
      onProgress: (fileId: string, progress: number) =>
        this.updateFileProgress(fileId, progress),
      onStatusChange: (
        fileId: string,
        status: UploadedFile['status'],
        _errorMessage?: string
      ) => this.updateFileStatus(fileId, status, _errorMessage),
      onDataUpdate: (fileId: string, data: Partial<UploadedFile>) =>
        this.updateFileData(fileId, data)
    };

    const processor = new FileProcessorService(callbacks);
    await processor.processFile(uploadedFile, file);
  },

  async processShapefileGroup(baseName: string, files: File[]): Promise<void> {
    const mainFile = files.find((f) => f.name.endsWith('.shp'));
    if (!mainFile) {
      const errorFile: UploadedFile = {
        id: crypto.randomUUID(),
        name: baseName,
        size: files.reduce((sum, f) => sum + f.size, 0),
        type: 'application/x-shapefile',
        fileType: FileType.SHAPEFILE,
        status: 'error',
        errorMessage: 'Missing .shp file in shapefile set',
        sourceType: DataSourceType.FILE_UPLOAD
      };
      this.addUploadedFile(errorFile);
      showError('Invalid shapefile', 'Missing .shp file in shapefile set');
      return;
    }

    const requiredExtensions = ['.shp', '.shx', '.dbf'];
    const fileExtensions = files.map(
      (f) => '.' + f.name.split('.').pop()?.toLowerCase()
    );
    const missingExtensions = requiredExtensions.filter(
      (ext) => !fileExtensions.includes(ext)
    );

    if (missingExtensions.length > 0) {
      const errorFile: UploadedFile = {
        id: crypto.randomUUID(),
        name: baseName,
        size: files.reduce((sum, f) => sum + f.size, 0),
        type: 'application/x-shapefile',
        fileType: FileType.SHAPEFILE,
        status: 'error',
        errorMessage: `Missing required shapefile components: ${missingExtensions.join(', ')}`,
        sourceType: DataSourceType.FILE_UPLOAD
      };
      this.addUploadedFile(errorFile);
      showError(
        'Incomplete shapefile',
        `Missing required components: ${missingExtensions.join(', ')}`
      );
      return;
    }

    const uploadedFile: UploadedFile = {
      id: crypto.randomUUID(),
      name: baseName + '.shp',
      size: files.reduce((sum, f) => sum + f.size, 0),
      type: 'application/x-shapefile',
      fileType: FileType.SHAPEFILE,
      status: 'processing',
      sourceType: DataSourceType.FILE_UPLOAD,
      relatedFiles: files.map((f) => f.name)
    };

    this.addUploadedFile(uploadedFile);

    try {
      const fileContents: Record<string, ArrayBuffer> = {};
      for (const file of files) {
        const content = await readFileContent(file);
        if (content instanceof ArrayBuffer) {
          const extension = file.name.split('.').pop()?.toLowerCase() || '';
          fileContents[extension] = content;
        }
      }

      const geojson = await parseShapefile(fileContents, (progress) => {
        this.updateFileProgress(uploadedFile.id, progress);
      });

      this.updateFileData(uploadedFile.id, {
        parsedData: geojson,
        content: JSON.stringify(geojson),
        status: 'complete'
      });
    } catch (_error) {
      const message =
        _error instanceof Error
          ? _error.message
          : 'Failed to process shapefile';
      this.updateFileData(uploadedFile.id, {
        status: 'error',
        errorMessage: message
      });
      showError('Shapefile processing failed', message, _error);
    }
  },

  async processPastedData(pastedText: string): Promise<void> {
    const { fileType, validation } = extractDataFromPaste(pastedText);

    const baseName = 'pasted-data';
    const extension =
      fileType === FileType.CSV
        ? 'csv'
        : fileType === FileType.GEOJSON
          ? 'geojson'
          : 'txt';
    let fileName = `${baseName}.${extension}`;

    let counter = 1;
    while (this.isFileDuplicate(fileName)) {
      fileName = `${baseName}-${counter}.${extension}`;
      counter++;
    }

    const uploadedFile: UploadedFile = {
      id: crypto.randomUUID(),
      name: fileName,
      size: new Blob([pastedText]).size,
      type: fileType === FileType.CSV ? 'text/csv' : 'application/json',
      fileType,
      status: validation.isValid ? 'complete' : 'error',
      content: pastedText,
      validation,
      sourceType: DataSourceType.PASTE,
      errorMessage: validation.isValid ? undefined : validation.errors[0]
    };

    this.addUploadedFile(uploadedFile);
    this.setPastedData('');

    if (!validation.isValid) {
      showError('Invalid pasted data', validation.errors[0]);
    }
  },

  removeUploadedFile(fileId: string): void {
    const index = createProjectState.newProject.uploadedFiles.findIndex(
      (f) => f.id === fileId
    );
    if (index !== -1) {
      createProjectState.newProject.uploadedFiles.splice(index, 1);
    }
  },

  updateFileData(fileId: string, data: Partial<UploadedFile>): void {
    const file = createProjectState.newProject.uploadedFiles.find(
      (f) => f.id === fileId
    );
    if (file) {
      Object.assign(file, data);
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
    }
  },

  updateFileProgress(fileId: string, progress: number): void {
    const file = createProjectState.newProject.uploadedFiles.find(
      (f) => f.id === fileId
    );
    if (file) {
      file.uploadProgress = Math.round(progress);
    }
  },

  setPastedData(data: string): void {
    createProjectState.newProject.pastedData = data;
  },

  setOnlineFileUrl(url: string): void {
    createProjectState.newProject.onlineFileUrl = url;
  },

  setProjectName(name: string): void {
    createProjectState.newProject.projectName = name;
  },

  setNewProjectLoading(loading: boolean): void {
    createProjectState.newProject.isLoading = loading;
  },

  setNewProjectError(error?: string): void {
    createProjectState.newProject.error = error;
    if (error) {
      logger.error('New project error', LogCategory.PROJECT, error);
    }
  },

  async loadOnlineFile(): Promise<void> {
    const url = createProjectState.newProject.onlineFileUrl;
    if (!url || !isValidUrl(url)) {
      this.setNewProjectError('Please enter a valid HTTP or HTTPS URL');
      return;
    }

    this.setNewProjectLoading(true);
    this.setNewProjectError();

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const filename = getFilenameFromUrl(url);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: blob.type });

      await this.processSingleFile(file, DataSourceType.URL);
      this.setOnlineFileUrl('');
    } catch (_error) {
      const message =
        _error instanceof Error ? _error.message : 'Failed to load online file';
      this.setNewProjectError(message);
      showError('Failed to load online file', message, _error);
    } finally {
      this.setNewProjectLoading(false);
    }
  },

  async clearAllFiles(saveProject: boolean = false): Promise<void> {
    logger.info('clearAllFiles called', LogCategory.FILE, {
      uploadedFilesCount: createProjectState.newProject.uploadedFiles.length,
      hasCurrentProject: !!projectStore.currentProject,
      projectId: projectStore.currentProject?.id,
      saveProject
    });

    createProjectState.newProject.uploadedFiles = [];
    createProjectState.newProject.validationErrors = [];

    datasetsStore.clear();
    visualizationStore.clear();
    await duckDBOrchestrator.clear();

    if (
      saveProject &&
      projectStore.currentProject?.id &&
      projectStore.currentProject.data
    ) {
      logger.info('Clearing and saving project sourceFiles', LogCategory.FILE, {
        projectId: projectStore.currentProject.id
      });

      projectStore.currentProject.data.sourceFiles = [];
      projectStore.markAsDirty();
      await projectStore.saveCurrentProject();
    }
  },

  getFilesByStatus(status: UploadedFile['status']): UploadedFile[] {
    return createProjectState.newProject.uploadedFiles.filter(
      (f) => f.status === status
    );
  },

  hasValidFiles(): boolean {
    return createProjectState.newProject.uploadedFiles.some(
      (f) => f.status === 'complete'
    );
  },

  getTotalFileSize(): number {
    return createProjectState.newProject.uploadedFiles.reduce(
      (sum, file) => sum + file.size,
      0
    );
  },

  setSavedProjects(projects: SavedProject[]): void {
    createProjectState.openProject.savedProjects = projects;
  },

  selectSavedProject(projectId?: string): void {
    createProjectState.openProject.selectedProjectId = projectId;
  },

  setImportedFile(file?: UploadedFile): void {
    createProjectState.openProject.importedFile = file;
  },

  setOpenProjectLoading(loading: boolean): void {
    createProjectState.openProject.isLoading = loading;
  },

  setOpenProjectError(error?: string): void {
    createProjectState.openProject.error = error;
    if (error) {
      logger.error('Open project error', LogCategory.PROJECT, error);
    }
  },

  setExamples(examples: ExampleProject[]): void {
    createProjectState.tryExample.examples = examples;
  },

  selectExample(exampleId?: string): void {
    createProjectState.tryExample.selectedExampleId = exampleId;
  },

  setExampleCategory(category: ExampleCategory): void {
    createProjectState.tryExample.selectedCategory = category;
    createProjectState.tryExample.selectedExampleId = undefined;
  },

  setTryExampleLoading(loading: boolean): void {
    createProjectState.tryExample.isLoading = loading;
  },

  setTryExampleError(error?: string): void {
    createProjectState.tryExample.error = error;
    if (error) {
      logger.error('Try example error', LogCategory.PROJECT, error);
    }
  },

  resetNewProject(): void {
    createProjectState.newProject.uploadedFiles = [];
    createProjectState.newProject.pastedData = '';
    createProjectState.newProject.onlineFileUrl = '';
    createProjectState.newProject.projectName = '';
    createProjectState.newProject.isLoading = false;
    createProjectState.newProject.error = undefined;
  },

  resetOpenProject(): void {
    Object.assign(createProjectState.openProject, {
      ...DEFAULT_STATE.openProject,
      savedProjects: createProjectState.openProject.savedProjects
    });
  },

  resetTryExample(): void {
    Object.assign(createProjectState.tryExample, {
      ...DEFAULT_STATE.tryExample,
      examples: createProjectState.tryExample.examples
    });
  },

  resetAllTabs(): void {
    this.resetNewProject();
    this.resetOpenProject();
    this.resetTryExample();
    createProjectState.selectedTab = 1;
  },

  reset(): void {
    Object.assign(createProjectState, DEFAULT_STATE);
  }
};
