import { duckDBOrchestrator } from '$lib/features/duckdb';
import * as m from '$lib/paraglide/messages';
import { SvelteMap } from 'svelte/reactivity';
import {
  FileProcessorService,
  type ProcessingCallbacks
} from '../../create-project/services/file-processor.service';
import { CreateProjectValidationService } from '../../create-project/services/validation.service';
import { STORAGE_LIMITS } from '../configs/validation.config';
import {
  createUploadedFile,
  extractDataFromPaste,
  extractUrlsFromInput,
  FileType,
  getFilenameFromUrl,
  groupShapefiles,
  isShapefileComponent,
  isValidUrl
} from '../utils/file-import.utils';
import { formatFileSize } from '../utils/format.utils';
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
import { DataSourceType } from './create-project.types';
import { datasetsStore } from './datasets.store.svelte';
import { projectStore } from './project.store.svelte';
import { visualizationStore } from './visualization.store.svelte';

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
    const existsInSession = uploadingFiles.some(
      (f) => f.name === fileName && f.status !== 'error'
    );

    if (existsInSession) return true;

    const projectFiles = projectStore.currentProject?.data?.sourceFiles ?? [];
    return projectFiles.some((f) => f.name === fileName);
  },

  async processFiles(
    files: File[],
    sourceType: DataSourceType = DataSourceType.FILE_UPLOAD
  ): Promise<void> {
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
            sourceType,
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
        m.warning_files_duplicate_title(),
        m.warning_files_duplicate_message({ files: duplicates.join(', ') })
      );
    }

    for (const [baseName, groupFiles] of toProcess) {
      if (
        groupFiles.length === 1 &&
        !isShapefileComponent(groupFiles[0].name)
      ) {
        await this.processSingleFile(groupFiles[0], sourceType);
      } else {
        await this.processShapefileGroup(baseName, groupFiles, sourceType);
      }
    }
  },

  async processSingleFile(
    file: File,
    sourceType: DataSourceType = DataSourceType.FILE_UPLOAD
  ): Promise<void> {
    if (this.isFileDuplicate(file.name)) {
      showWarning(
        m.warning_files_duplicate_title(),
        m.warning_files_duplicate_message({ files: file.name })
      );
      return;
    }

    const uploadedFile = createUploadedFile(file, sourceType);
    // IMPORTANT: Store the original File object to avoid re-parsing
    uploadedFile.originalFile = file;
    this.addUploadedFile(uploadedFile);

    const callbacks: ProcessingCallbacks = {
      onProgress: (fileId: string, progress: number) =>
        this.updateFileProgress(fileId, progress),
      onStatusChange: (
        fileId: string,
        status: UploadedFile['status'],
        errorMessage?: string
      ) => this.updateFileStatus(fileId, status, errorMessage),
      onDataUpdate: (fileId: string, data: Partial<UploadedFile>) =>
        this.updateFileData(fileId, data)
    };

    const processor = new FileProcessorService(callbacks);
    await processor.processFile(uploadedFile, file);
  },

  async processShapefileGroup(
    baseName: string,
    files: File[],
    sourceType: DataSourceType = DataSourceType.FILE_UPLOAD
  ): Promise<void> {
    // Validate total shapefile group size
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > STORAGE_LIMITS.maxFileSize) {
      showError(
        m.error_shapefile_too_large_title(),
        m.error_shapefile_too_large_message({
          size: formatFileSize(totalSize),
          max: formatFileSize(STORAGE_LIMITS.maxFileSize)
        })
      );
      return;
    }

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
        sourceType
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
        sourceType
      };
      this.addUploadedFile(errorFile);
      showError(
        'Incomplete shapefile',
        `Missing required components: ${missingExtensions.join(', ')}`
      );
      return;
    }

    const shpFile = files.find((f) => f.name.toLowerCase().endsWith('.shp'));

    if (!shpFile) {
      const errorFile: UploadedFile = {
        id: crypto.randomUUID(),
        name: baseName,
        size: files.reduce((sum, f) => sum + f.size, 0),
        type: 'application/x-shapefile',
        fileType: FileType.SHAPEFILE,
        status: 'error',
        errorMessage: 'Missing .shp file in shapefile set',
        sourceType
      };
      this.addUploadedFile(errorFile);
      showError('Shapefile processing failed', 'No .shp file found');
      return;
    }

    // Read content of all files for persistence
    const relatedFilesData: Record<string, ArrayBuffer> = {};
    let shpContent: ArrayBuffer = new ArrayBuffer(0);

    try {
      for (const f of files) {
        const buffer = await f.arrayBuffer();
        relatedFilesData[f.name] = buffer;
        if (f.name === shpFile.name) {
          shpContent = buffer;
        }
      }
    } catch (error) {
      logger.error('Failed to read shapefile content', LogCategory.DATA, error);
      showError('Shapefile read failed', 'Could not read file content');
      return;
    }

    const uploadedFile: UploadedFile = {
      id: crypto.randomUUID(),
      name: baseName + '.shp',
      size: files.reduce((sum, f) => sum + f.size, 0),
      type: 'application/x-shapefile',
      fileType: FileType.SHAPEFILE,
      status: 'complete',
      sourceType,
      relatedFiles: files.map((f) => f.name),
      relatedFileObjects: files,
      originalFile: shpFile,
      content: shpContent,
      relatedFilesData
    };

    this.addUploadedFile(uploadedFile);
  },

  async processPastedData(pastedText: string): Promise<void> {
    const result = extractDataFromPaste(pastedText);

    // If paste doesn't look like tabular data, show error
    if (!result) {
      showError(
        'Invalid pasted data',
        'Unable to detect tabular data. Please paste CSV or TSV content with delimiters.'
      );
      this.setPastedData('');
      return;
    }

    const { fileType, content } = result;
    const baseName = m.dataset_pasted_name();
    const extension = fileType === FileType.TSV ? 'tsv' : 'csv';
    let fileName = `${baseName}.${extension}`;

    let counter = 1;
    while (this.isFileDuplicate(fileName)) {
      fileName = `${baseName}-${counter}.${extension}`;
      counter++;
    }

    const mimeType =
      fileType === FileType.TSV ? 'text/tab-separated-values' : 'text/csv';
    const file = new File([content], fileName, { type: mimeType });

    // DuckDB will handle validation during processing
    await this.processSingleFile(file, DataSourceType.PASTE);
    this.setPastedData('');
  },

  removeUploadedFile(fileId: string): void {
    const index = createProjectState.newProject.uploadedFiles.findIndex(
      (f) => f.id === fileId
    );
    if (index !== -1) {
      // Clean up File object references to prevent memory leaks
      const fileToRemove = createProjectState.newProject.uploadedFiles[index];
      if (fileToRemove) {
        fileToRemove.originalFile = undefined;
        fileToRemove.relatedFileObjects = undefined;
        fileToRemove.content = undefined;
        fileToRemove.relatedFilesData = undefined;
      }
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
    const inputValue = createProjectState.newProject.onlineFileUrl;
    const urls = extractUrlsFromInput(inputValue);

    if (urls.length === 0) {
      this.setNewProjectError('Please enter at least one HTTP or HTTPS URL');
      return;
    }

    const invalidUrls = urls.filter((entry) => !isValidUrl(entry));
    if (invalidUrls.length > 0) {
      this.setNewProjectError(`Invalid URL(s): ${invalidUrls.join(', ')}`);
      return;
    }

    this.setNewProjectLoading(true);
    this.setNewProjectError();

    try {
      const downloadedFiles: File[] = [];
      for (let index = 0; index < urls.length; index++) {
        const remoteUrl = urls[index];
        const remoteFile = await this.downloadRemoteFile(remoteUrl, index);
        downloadedFiles.push(remoteFile);
      }

      if (downloadedFiles.length === 1) {
        await this.processSingleFile(downloadedFiles[0], DataSourceType.URL);
      } else {
        await this.processFiles(downloadedFiles, DataSourceType.URL);
      }

      this.setOnlineFileUrl('');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to load online file(s)';
      this.setNewProjectError(message);
      showError('Failed to load online file(s)', message, error);
    } finally {
      this.setNewProjectLoading(false);
    }
  },

  async downloadRemoteFile(url: string, index: number): Promise<File> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} (${response.statusText}) for ${url}`
        );
      }

      // Validate Content-Type
      const contentType = response.headers.get('content-type') || '';
      const allowedTypes = [
        'text/csv',
        'text/plain',
        'text/tab-separated-values',
        'application/json',
        'application/geo+json',
        'application/vnd.geo+json',
        'application/octet-stream',
        'application/x-shapefile',
        'application/geopackage+sqlite3',
        'application/x-sqlite3',
        'application/zip',
        'application/x-zip-compressed',
        'application/geoparquet',
        'application/parquet'
      ];

      const isAllowed =
        allowedTypes.some((t) => contentType.includes(t)) ||
        contentType.includes('octet-stream') ||
        contentType === '';
      if (!isAllowed) {
        throw new Error(m.error_invalid_content_type({ type: contentType }));
      }

      const blob = await response.blob();
      const headerFilename = getFilenameFromContentDisposition(
        response.headers
      );
      const urlFilename = getFilenameFromUrl(url);
      const safeName = ensureFilenameHasExtension(
        headerFilename || urlFilename,
        blob.type,
        index
      );

      return new File([blob], safeName, {
        type: blob.type || 'application/octet-stream'
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(m.error_download_timeout());
      }
      throw error;
    }
  },

  async clearAllFiles(saveProject: boolean = false): Promise<void> {
    // Clean up File object references to prevent memory leaks
    for (const file of createProjectState.newProject.uploadedFiles) {
      file.originalFile = undefined;
      file.relatedFileObjects = undefined;
      file.content = undefined;
      file.relatedFilesData = undefined;
    }
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
      projectStore.currentProject.data.sourceFiles = [];
      projectStore.markAsDirty();
      await projectStore.saveCurrentProject();
    }
  },

  /**
   * Clear only the upload UI state without touching DuckDB tables or project data.
   * Used when closing the add-data modal after successful import.
   */
  clearUploadState(): void {
    createProjectState.newProject.uploadedFiles = [];
    createProjectState.newProject.validationErrors = [];

    // Do NOT call datasetsStore.clear(), visualizationStore.clear(), or duckDBOrchestrator.clear()
    // The data has been successfully added to the project and should remain
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

const MIME_EXTENSION_MAP: Record<string, string> = {
  'text/csv': '.csv',
  'application/csv': '.csv',
  'text/tab-separated-values': '.tsv',
  'application/json': '.json',
  'application/geo+json': '.geojson',
  'application/vnd.geo+json': '.geojson',
  'application/geopackage+sqlite3': '.gpkg',
  'application/x-sqlite3': '.gpkg',
  'application/geoparquet': '.geoparquet',
  'application/x-parquet': '.parquet',
  'application/parquet': '.parquet',
  'application/vnd.google-earth.kml+xml': '.kml',
  'application/vnd.google-earth.kmz': '.kmz',
  'application/x-shapefile': '.shp',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip'
};

function getFilenameFromContentDisposition(
  headers: Headers
): string | undefined {
  const disposition = headers.get('content-disposition');
  if (!disposition) {
    return undefined;
  }

  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);

  if (!match || !match[1]) {
    return undefined;
  }

  const value = match[1].replace(/(^"|"$)/g, '').trim();
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function ensureFilenameHasExtension(
  rawName: string,
  mimeType: string,
  index: number
): string {
  const baseName =
    rawName && rawName.length > 0 ? rawName : `remote-file-${index + 1}`;

  if (baseName.includes('.')) {
    return baseName;
  }

  const normalizedMime = (mimeType || '').split(';')[0].toLowerCase();
  const extension = MIME_EXTENSION_MAP[normalizedMime];

  if (extension) {
    return `${baseName}${extension}`;
  }

  return `${baseName}.dat`;
}
