import { MIME } from '$lib/features/commons/constants';
import {
  ExampleCategory,
  FileStatus
} from '$lib/features/commons/constants/ui.constants';

import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import * as m from '$lib/paraglide/messages';
import { SvelteMap } from 'svelte/reactivity';
import {
  createFileProcessorService,
  type ProcessingCallbacks
} from '../../create-project/services/file-processor.service';
import { CreateProjectValidationService } from '../../create-project/services/validation.service';
import {
  getMaxFileSizeForType,
  STORAGE_LIMITS
} from '../constants/validation.config';
import { DataValidationError, PipelineError } from '../pipeline.errors';
import {
  createUploadedFile,
  extractDataFromPaste,
  extractUrlsFromInput,
  FileType,
  getFilenameFromUrl,
  getShapefileBaseName,
  groupShapefiles,
  isShapefileComponent,
  isValidUrl
} from '../utils/file-import.utils';
import { formatFileSize } from '../utils/format.utils';
import { LogCategory, logger } from '../utils/logger';
import { showError } from '../utils/notification.utils.svelte';
import { createReadonlyStateFacade } from '../utils/store.utils.svelte';
import type {
  CreateProjectState,
  ExampleProject,
  ProjectTab,
  UploadedFile
} from '../types/create-project.types';
import { DataSourceType } from '../types/create-project.types';
import { datasetsStore } from './datasets.store.svelte';
import { projectStore } from './project.store.svelte';
import { visualizationStore } from './visualization.store.svelte';

const FILE_FETCH_TIMEOUT_MS = 30_000;
const REMOTE_FILE_OFFLINE_ERROR_CODE = 'REMOTE_FILE_OFFLINE';
const REMOTE_FILE_FETCH_FAILED_ERROR_CODE = 'REMOTE_FILE_FETCH_FAILED';
const REMOTE_FILE_DOWNLOAD_TIMEOUT_ERROR_CODE = 'REMOTE_FILE_DOWNLOAD_TIMEOUT';

const REQUIRED_SHAPEFILE_EXTENSIONS = ['.shp', '.shx', '.dbf'];

const DEFAULT_STATE: CreateProjectState = {
  selectedTab: 1,

  newProject: {
    uploadedFiles: [],
    pastedData: '',
    onlineFileUrl: '',
    projectName: '',
    isLoading: false,
    isProcessingFiles: false,
    processingFileCount: 0,
    validationErrors: []
  },

  tryExample: {
    examples: [],
    selectedCategory: ExampleCategory.ALL,
    isLoading: false
  }
};

const createProjectInternalState = $state<CreateProjectState>(
  structuredClone(DEFAULT_STATE)
);

export const createProjectState = createReadonlyStateFacade(
  createProjectInternalState
);

function hasDuplicateFileName(fileName: string): boolean {
  return createProjectInternalState.newProject.uploadedFiles.some(
    (file) => file.name === fileName && file.status !== FileStatus.ERROR
  );
}

export const createProjectActions = {
  selectTab(tab: ProjectTab): void {
    createProjectInternalState.selectedTab = tab;
  },

  addUploadedFile(file: UploadedFile): void {
    createProjectInternalState.newProject.uploadedFiles.push(file);
  },

  isFileDuplicate(fileName: string): boolean {
    return hasDuplicateFileName(fileName);
  },

  findIncompleteShapefile(baseName: string): UploadedFile | undefined {
    return createProjectInternalState.newProject.uploadedFiles.find(
      (f) =>
        f.status === FileStatus.INCOMPLETE &&
        f.shapefileBaseName?.toLowerCase() === baseName.toLowerCase()
    );
  },

  findCompleteShapefile(baseName: string): UploadedFile | undefined {
    const normalizedBaseName = baseName.toLowerCase();
    return createProjectInternalState.newProject.uploadedFiles.find((file) => {
      if (
        file.status !== FileStatus.COMPLETE ||
        file.fileType !== FileType.SHAPEFILE
      ) {
        return false;
      }

      const fileBaseName =
        file.shapefileBaseName?.toLowerCase() ??
        file.name.toLowerCase().replace(/\.shp$/i, '');
      return fileBaseName === normalizedBaseName;
    });
  },

  async mergeIntoIncompleteShapefile(
    incompleteFile: UploadedFile,
    newFiles: File[],
    sourceType: DataSourceType
  ): Promise<void> {
    const existingFileObjects = incompleteFile.relatedFileObjects ?? [];
    const allFiles = [...existingFileObjects, ...newFiles];

    const baseName = incompleteFile.shapefileBaseName!;
    const presentExtensions = allFiles.map((f) => {
      const ext = f.name.toLowerCase().split('.').pop();
      return ext ? `.${ext}` : '';
    });

    const stillMissing = REQUIRED_SHAPEFILE_EXTENSIONS.filter(
      (ext) => !presentExtensions.includes(ext)
    );

    if (stillMissing.length === 0) {
      const fileIndex =
        createProjectInternalState.newProject.uploadedFiles.indexOf(
          incompleteFile
        );
      if (fileIndex !== -1) {
        createProjectInternalState.newProject.uploadedFiles.splice(
          fileIndex,
          1
        );
      }

      await this.processShapefileGroup(baseName, allFiles, sourceType);
    } else {
      incompleteFile.relatedFileObjects = allFiles;
      incompleteFile.relatedFiles = allFiles.map((f) => f.name);
      incompleteFile.missingShapefileComponents = stillMissing;
      incompleteFile.size = allFiles.reduce((sum, f) => sum + f.size, 0);
      incompleteFile.validation = {
        isValid: false,
        errors: [],
        warnings: [
          m.shapefile_incomplete_message({ missing: stillMissing.join(', ') })
        ]
      };
    }
  },

  mergeIntoCompleteShapefile(
    completeFile: UploadedFile,
    newFiles: File[]
  ): void {
    const existingFiles = completeFile.relatedFileObjects ?? [];
    const existingNames = new Set(
      existingFiles.map((file) => file.name.toLowerCase())
    );
    const filesToAdd = newFiles.filter(
      (file) => !existingNames.has(file.name.toLowerCase())
    );

    if (filesToAdd.length === 0) return;

    const mergedFiles = [...existingFiles, ...filesToAdd];
    completeFile.relatedFileObjects = mergedFiles;
    completeFile.relatedFiles = mergedFiles.map((file) => file.name);
    completeFile.size = mergedFiles.reduce((sum, file) => sum + file.size, 0);

    if (!completeFile.originalFile) {
      const shpFile = mergedFiles.find((file) =>
        file.name.toLowerCase().endsWith('.shp')
      );
      if (shpFile) {
        completeFile.originalFile = shpFile;
      }
    }
  },

  async processFiles(
    files: File[],
    sourceType: DataSourceType = DataSourceType.FILE_UPLOAD
  ): Promise<void> {
    this.setProcessingFiles(true, files.length);

    try {
      const fileGroups = groupShapefiles(files);

      for (const [baseName, groupFiles] of fileGroups) {
        const incompleteShapefile = this.findIncompleteShapefile(baseName);
        if (incompleteShapefile) {
          await this.mergeIntoIncompleteShapefile(
            incompleteShapefile,
            groupFiles,
            sourceType
          );
          fileGroups.delete(baseName);
          continue;
        }

        const hasShpComponent = groupFiles.some((file) =>
          file.name.toLowerCase().endsWith('.shp')
        );

        if (!hasShpComponent) {
          const completeShapefile = this.findCompleteShapefile(baseName);
          if (completeShapefile) {
            this.mergeIntoCompleteShapefile(completeShapefile, groupFiles);
            fileGroups.delete(baseName);
          }
        }
      }

      if (fileGroups.size === 0) {
        return;
      }

      const remainingFiles = Array.from(fileGroups.values()).flat();
      const validationResult =
        CreateProjectValidationService.validateFiles(remainingFiles);

      const nonShapefileErrors = validationResult.globalErrors.filter(
        (err) => !err.includes('Incomplete shapefile')
      );
      createProjectInternalState.newProject.validationErrors =
        nonShapefileErrors;

      const duplicates: string[] = [];
      const toProcess: SvelteMap<string, File[]> = new SvelteMap();

      for (const [baseName, groupFiles] of fileGroups) {
        const mainFileName =
          groupFiles.length === 1 ? groupFiles[0].name : baseName + '.shp';

        if (hasDuplicateFileName(mainFileName)) {
          duplicates.push(mainFileName);
        } else {
          toProcess.set(baseName, groupFiles);
        }
      }

      for (const [baseName, groupFiles] of toProcess) {
        const mainFile =
          groupFiles.find((f) => f.name.endsWith('.shp')) || groupFiles[0];
        const mainFileName = mainFile.name;
        const fileValidation = validationResult.results.get(mainFileName);

        const shapefileGlobalError = validationResult.globalErrors.find((err) =>
          err.includes(`Incomplete shapefile "${baseName}"`)
        );

        const hasShapefileError = !!shapefileGlobalError;
        const hasOtherErrors =
          fileValidation && fileValidation.errors.length > 0;

        if (hasShapefileError && !hasOtherErrors) {
          const missingMatch =
            shapefileGlobalError.match(/Missing files: (.*)/);
          const missingComponents = missingMatch
            ? missingMatch[1].split(', ').map((s) => s.trim())
            : [];

          const incompleteFile: UploadedFile = {
            id: crypto.randomUUID(),
            name: mainFileName,
            size: mainFile.size,
            status: FileStatus.INCOMPLETE,
            uploadProgress: 100,
            type: mainFile.type,
            fileType: FileType.SHAPEFILE,
            sourceType,
            relatedFiles: groupFiles
              .filter((f) => f !== mainFile)
              .map((f) => f.name),
            relatedFileObjects: groupFiles,
            shapefileBaseName: baseName,
            missingShapefileComponents: missingComponents,
            validation: {
              isValid: false,
              errors: [],
              warnings: [
                m.shapefile_incomplete_message({
                  missing: missingComponents.join(', ')
                })
              ]
            }
          };
          this.addUploadedFile(incompleteFile);
          toProcess.delete(baseName);
        } else if (hasOtherErrors) {
          const validationErrors = fileValidation?.errors ?? [];
          const validationWarnings = fileValidation?.warnings ?? [];
          const errorFile: UploadedFile = {
            id: crypto.randomUUID(),
            name: mainFileName,
            size: mainFile.size,
            status: FileStatus.ERROR,
            uploadProgress: 100,
            type: mainFile.type,
            fileType: mainFile.name.endsWith('.shp')
              ? FileType.SHAPEFILE
              : FileType.UNKNOWN,
            sourceType,
            errorMessage: validationErrors[0] ?? m.create_project_error_label(),
            relatedFiles: groupFiles
              .filter((f) => f !== mainFile)
              .map((f) => f.name),
            validation: {
              isValid: false,
              errors: validationErrors,
              warnings: validationWarnings
            }
          };
          this.addUploadedFile(errorFile);
          toProcess.delete(baseName);
        }
      }

      if (duplicates.length > 0) {
        this.setNewProjectWarning(
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
    } finally {
      this.setProcessingFiles(false, 0);
    }
  },

  async processSingleFile(
    file: File,
    sourceType: DataSourceType = DataSourceType.FILE_UPLOAD
  ): Promise<void> {
    if (hasDuplicateFileName(file.name)) {
      this.setNewProjectWarning(
        m.warning_files_duplicate_message({ files: file.name })
      );
      return;
    }

    const uploadedFile = createUploadedFile(file, sourceType);
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
        this.updateFileData(fileId, data),
      onAdditionalFile: (file: UploadedFile) => this.addUploadedFile(file)
    };

    const processor = createFileProcessorService(callbacks);
    await processor.processFile(uploadedFile, file);
  },

  async processShapefileGroup(
    baseName: string,
    files: File[],
    sourceType: DataSourceType = DataSourceType.FILE_UPLOAD
  ): Promise<void> {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const maxShapefileSize = getMaxFileSizeForType(FileType.SHAPEFILE);

    if (totalSize > maxShapefileSize) {
      this.setNewProjectError(
        m.error_shapefile_too_large_message({
          size: formatFileSize(totalSize),
          max: formatFileSize(maxShapefileSize)
        })
      );
      return;
    }

    const fileExtensions = files.map(
      (f) => '.' + f.name.split('.').pop()?.toLowerCase()
    );
    const missingExtensions = REQUIRED_SHAPEFILE_EXTENSIONS.filter(
      (ext) => !fileExtensions.includes(ext)
    );

    if (missingExtensions.length > 0) {
      const incompleteFile: UploadedFile = {
        id: crypto.randomUUID(),
        name: baseName,
        size: files.reduce((sum, f) => sum + f.size, 0),
        type: 'application/x-shapefile',
        fileType: FileType.SHAPEFILE,
        status: FileStatus.INCOMPLETE,
        sourceType,
        shapefileBaseName: baseName,
        missingShapefileComponents: missingExtensions,
        relatedFileObjects: files,
        relatedFiles: files.map((f) => f.name),
        validation: {
          isValid: false,
          errors: [],
          warnings: [
            m.shapefile_incomplete_message({
              missing: missingExtensions.join(', ')
            })
          ]
        }
      };
      this.addUploadedFile(incompleteFile);

      return;
    }

    const shpFile = files.find((f) => f.name.toLowerCase().endsWith('.shp'))!;

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
      this.setNewProjectError(m.error_shapefile_read_failed_message());
      return;
    }

    const uploadedFile: UploadedFile = {
      id: crypto.randomUUID(),
      name: baseName + '.shp',
      size: files.reduce((sum, f) => sum + f.size, 0),
      type: 'application/x-shapefile',
      fileType: FileType.SHAPEFILE,
      status: FileStatus.COMPLETE,
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

    if (!result) {
      this.setNewProjectError(m.error_pasted_data_invalid_message());
      this.setPastedData('');
      return;
    }

    const { fileType, content } = result;
    const baseName = m.dataset_pasted_name();
    const extension = fileType === FileType.TSV ? 'tsv' : 'csv';
    const timestamp = Date.now();
    let fileName = `${baseName}-${timestamp}.${extension}`;

    let counter = 1;
    while (hasDuplicateFileName(fileName)) {
      fileName = `${baseName}-${timestamp}-${counter}.${extension}`;
      counter++;
    }

    const mimeType =
      fileType === FileType.TSV ? 'text/tab-separated-values' : 'text/csv';
    const file = new File([content], fileName, { type: mimeType });

    await this.processSingleFile(file, DataSourceType.PASTE);
    this.setPastedData('');
  },

  removeUploadedFile(fileId: string): void {
    const index = createProjectInternalState.newProject.uploadedFiles.findIndex(
      (f) => f.id === fileId
    );
    if (index !== -1) {
      const fileToRemove =
        createProjectInternalState.newProject.uploadedFiles[index];
      if (fileToRemove) {
        fileToRemove.originalFile = undefined;
        fileToRemove.relatedFileObjects = undefined;
        fileToRemove.content = undefined;
        fileToRemove.relatedFilesData = undefined;
      }
      createProjectInternalState.newProject.uploadedFiles.splice(index, 1);
      this.recomputeGlobalValidationErrors();
    }
  },

  updateFileData(fileId: string, data: Partial<UploadedFile>): void {
    const file = createProjectInternalState.newProject.uploadedFiles.find(
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
    const file = createProjectInternalState.newProject.uploadedFiles.find(
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
    const file = createProjectInternalState.newProject.uploadedFiles.find(
      (f) => f.id === fileId
    );
    if (file) {
      file.uploadProgress = Math.round(progress);
    }
  },

  setPastedData(data: string): void {
    createProjectInternalState.newProject.pastedData = data;
  },

  setOnlineFileUrl(url: string): void {
    createProjectInternalState.newProject.onlineFileUrl = url;
  },

  setProjectName(name: string): void {
    createProjectInternalState.newProject.projectName = name;
  },

  setNewProjectLoading(loading: boolean): void {
    createProjectInternalState.newProject.isLoading = loading;
  },

  setProcessingFiles(isProcessing: boolean, count: number = 0): void {
    createProjectInternalState.newProject.isProcessingFiles = isProcessing;
    createProjectInternalState.newProject.processingFileCount = count;
  },

  setNewProjectError(error?: string): void {
    createProjectInternalState.newProject.error = error;
  },

  setNewProjectWarning(warning?: string): void {
    createProjectInternalState.newProject.warning = warning;
  },

  async loadOnlineFile(): Promise<void> {
    const inputValue = createProjectInternalState.newProject.onlineFileUrl;
    const urls = extractUrlsFromInput(inputValue);

    if (urls.length === 0) {
      this.setNewProjectError(m.error_url_required());
      return;
    }

    const invalidUrls = urls.filter((entry) => !isValidUrl(entry));
    if (invalidUrls.length > 0) {
      this.setNewProjectError(
        m.error_url_invalid({ urls: invalidUrls.join(', ') })
      );
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
        const [downloadedFile] = downloadedFiles;

        if (isShapefileComponent(downloadedFile.name)) {
          await this.processShapefileGroup(
            getShapefileBaseName(downloadedFile.name),
            [downloadedFile],
            DataSourceType.URL
          );
        } else {
          await this.processSingleFile(downloadedFile, DataSourceType.URL);
        }
      } else {
        await this.processFiles(downloadedFiles, DataSourceType.URL);
      }

      this.setOnlineFileUrl('');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : m.error_load_online_file_title();
      this.setNewProjectError(message);
      showError(m.error_load_online_file_title(), message, error);
    } finally {
      this.setNewProjectLoading(false);
    }
  },

  async downloadRemoteFile(url: string, index: number): Promise<File> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new PipelineError(
        m.error_offline_url_import(),
        REMOTE_FILE_OFFLINE_ERROR_CODE,
        { url }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      FILE_FETCH_TIMEOUT_MS
    );

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new PipelineError(
          m.error_http_fetch({
            status: String(response.status),
            statusText: response.statusText,
            url
          }),
          REMOTE_FILE_FETCH_FAILED_ERROR_CODE,
          {
            status: response.status,
            statusText: response.statusText,
            url
          }
        );
      }

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
        'application/parquet',
        'application/gpx+xml',
        'application/vnd.google-earth.kml+xml',
        'application/vnd.google-earth.kmz',
        'text/xml',
        'application/xml'
      ];

      const isAllowed =
        allowedTypes.some((t) => contentType.includes(t)) ||
        contentType.includes('octet-stream') ||
        contentType === '';
      if (!isAllowed) {
        throw new DataValidationError(
          m.error_invalid_content_type({ type: contentType }),
          'contentType',
          { contentType, url }
        );
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
        throw new PipelineError(
          m.error_download_timeout(),
          REMOTE_FILE_DOWNLOAD_TIMEOUT_ERROR_CODE,
          {
            timeoutMs: FILE_FETCH_TIMEOUT_MS,
            url,
            originalError: error.message
          }
        );
      }
      throw error;
    }
  },

  async clearAllFiles(saveProject: boolean = false): Promise<void> {
    for (const file of createProjectInternalState.newProject.uploadedFiles) {
      file.originalFile = undefined;
      file.relatedFileObjects = undefined;
      file.content = undefined;
      file.relatedFilesData = undefined;
    }
    createProjectInternalState.newProject.uploadedFiles = [];
    createProjectInternalState.newProject.validationErrors = [];

    datasetsStore.clear();
    visualizationStore.clear();
    await duckDBOrchestrator.clear();

    if (
      saveProject &&
      projectStore.currentProject?.id &&
      projectStore.currentProject.data
    ) {
      await projectStore.clearSourceFiles();
    }
  },

  clearUploadState(): void {
    createProjectInternalState.newProject.uploadedFiles = [];
    createProjectInternalState.newProject.validationErrors = [];
  },

  recomputeGlobalValidationErrors(): void {
    const uploadedFiles = createProjectInternalState.newProject.uploadedFiles;
    const totalSize = uploadedFiles.reduce((sum, file) => sum + file.size, 0);
    const validationErrors: string[] = [];

    if (uploadedFiles.length > STORAGE_LIMITS.maxFileCount) {
      validationErrors.push(
        m.validation_file_count_exceeded({
          max: String(STORAGE_LIMITS.maxFileCount)
        })
      );
    }

    if (totalSize > STORAGE_LIMITS.maxTotalFileSize) {
      validationErrors.push(
        m.validation_total_size_exceeded({
          size: String(STORAGE_LIMITS.maxTotalFileSize / (1024 * 1024))
        })
      );
    }

    createProjectInternalState.newProject.validationErrors = validationErrors;
  },

  getFilesByStatus(status: UploadedFile['status']): UploadedFile[] {
    return createProjectInternalState.newProject.uploadedFiles.filter(
      (f) => f.status === status
    );
  },

  hasValidFiles(): boolean {
    return createProjectInternalState.newProject.uploadedFiles.some(
      (f) => f.status === FileStatus.COMPLETE
    );
  },

  getTotalFileSize(): number {
    return createProjectInternalState.newProject.uploadedFiles.reduce(
      (sum, file) => sum + file.size,
      0
    );
  },

  setExamples(examples: ExampleProject[]): void {
    createProjectInternalState.tryExample.examples = examples;
  },

  selectExample(exampleId?: string): void {
    createProjectInternalState.tryExample.selectedExampleId = exampleId;
  },

  setExampleCategory(category: ExampleCategory): void {
    createProjectInternalState.tryExample.selectedCategory = category;
    createProjectInternalState.tryExample.selectedExampleId = undefined;
  },

  setTryExampleLoading(loading: boolean): void {
    createProjectInternalState.tryExample.isLoading = loading;
  },

  setTryExampleError(error?: string): void {
    createProjectInternalState.tryExample.error = error;
  },

  resetNewProject(): void {
    createProjectInternalState.newProject.uploadedFiles = [];
    createProjectInternalState.newProject.pastedData = '';
    createProjectInternalState.newProject.onlineFileUrl = '';
    createProjectInternalState.newProject.projectName = '';
    createProjectInternalState.newProject.isLoading = false;
    createProjectInternalState.newProject.isProcessingFiles = false;
    createProjectInternalState.newProject.processingFileCount = 0;
    createProjectInternalState.newProject.error = undefined;
    createProjectInternalState.newProject.warning = undefined;
    createProjectInternalState.newProject.validationErrors = [];
  },

  resetTryExample(): void {
    const examples = createProjectInternalState.tryExample.examples;
    createProjectInternalState.tryExample = {
      ...DEFAULT_STATE.tryExample,
      examples,
      selectedExampleId: undefined,
      error: undefined
    };
  },

  resetAllTabs(): void {
    this.resetNewProject();
    this.resetTryExample();
    createProjectInternalState.selectedTab = 1;
  },

  reset(): void {
    Object.assign(createProjectInternalState, structuredClone(DEFAULT_STATE));
  }
};

const MIME_EXTENSION_MAP: Record<string, string> = {
  [MIME.CSV]: '.csv',
  'application/csv': '.csv',
  [MIME.TSV]: '.tsv',
  [MIME.JSON]: '.json',
  [MIME.GEOJSON]: '.geojson',
  'application/vnd.geo+json': '.geojson',
  [MIME.GEOPACKAGE]: '.gpkg',
  'application/x-sqlite3': '.gpkg',
  'application/geoparquet': '.geoparquet',
  'application/x-parquet': '.parquet',
  [MIME.PARQUET]: '.parquet',
  [MIME.KML]: '.kml',
  [MIME.KMZ]: '.kmz',
  [MIME.SHAPEFILE_SHP]: '.shp',
  [MIME.ZIP]: '.zip',
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
