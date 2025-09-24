import type {
  CreateProjectState,
  ExampleCategory,
  ExampleProject,
  ProjectTab,
  SavedProject,
  UploadedFile
} from './create-project.types';
import {
  createUploadedFile,
  readFileContent,
  validateFile,
  groupShapefiles,
  isShapefileComponent,
  extractDataFromPaste,
  FileType,
  isValidUrl,
  getFilenameFromUrl,
  validateCsvStructure,
  validateGeospatialFile,
  parseCsvWithPapa,
  parseShapefile,
  detectDuplicateRows,
  getDataStatistics,
  parseGeoPackage,
  DataSourceType
} from '../utils/file-import.utils';
import {
  showSuccess,
  showError,
  showWarning
} from '../utils/notification.utils.svelte';
import { globalActions, globalState } from './global.svelte';
import { projectStore } from './project.store.svelte';
import { logger, LogCategory } from '../utils/logger';
import { ProjectValidator, DataValidator } from '../utils/validation.utils';
import { FileValidator } from '../utils/file-validator.utils';
import { DeepDataValidator, type DataAnalysisResult } from '../utils/deep-validator.utils';
import { GeoMatcher } from '../utils/geo-matcher.utils';
import { DuckDBValidatorService, type ValidationResult } from '../services/duckdb-validator.service';

const DEFAULT_STATE: CreateProjectState = {
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
  selectTab(tab: ProjectTab): void {
    createProjectState.selectedTab = tab;
  },

  addUploadedFile(file: UploadedFile): void {
    createProjectState.newProject.uploadedFiles.push(file);

    const hasExistingSelection = globalState.dataButtons.some(
      (btn) => btn.isSelected
    );
    globalActions.addDataButtonForFile(
      file.id,
      file.name,
      !hasExistingSelection
    );
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
    const validationResult = FileValidator.validateMultiple(files);

    if (validationResult.globalErrors.length > 0) {
      this.setNewProjectError(validationResult.globalErrors.join(', '));
      showError('Erreur de validation', validationResult.globalErrors.join(', '));
      return;
    }

    for (const [filename, result] of validationResult.results) {
      if (!result.isValid) {
        this.setNewProjectError(result.errors.join(', '));
        showError(`Erreur avec ${filename}`, result.errors.join(', '));
        return;
      }

      if (result.warnings.length > 0) {
        result.warnings.forEach(warning => logger.warn(warning, LogCategory.FILE));
        showWarning('Avertissement', result.warnings.join(', '));
      }
    }

    const fileGroups = groupShapefiles(files);
    const duplicates: string[] = [];
    const toProcess: Map<string, File[]> = new Map();

    for (const [baseName, groupFiles] of fileGroups) {
      const mainFileName =
        groupFiles.length === 1 ? groupFiles[0].name : baseName + '.shp';

      if (this.isFileDuplicate(mainFileName)) {
        duplicates.push(mainFileName);
      } else {
        toProcess.set(baseName, groupFiles);
      }
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

    const validation = FileValidator.validate(file);
    const uploadedFile = createUploadedFile(file, sourceType);

    uploadedFile.validation = {
      isValid: validation.isValid,
      errors: validation.errors,
      warnings: validation.warnings
    };
    uploadedFile.status = validation.isValid ? 'uploading' : 'error';
    uploadedFile.errorMessage = validation.isValid ? undefined : validation.errors[0];

    this.addUploadedFile(uploadedFile);

    if (!validation.isValid) {
      return;
    }


    try {
      this.updateFileStatus(uploadedFile.id, 'processing');

      if (validation.requiresAsyncValidation) {
        const asyncValidation = await FileValidator.validateAsync(file, validation);
        if (!asyncValidation.isValid) {
          this.updateFileData(uploadedFile.id, {
            status: 'error',
            errorMessage: asyncValidation.errors.join(', '),
            validation: {
              isValid: asyncValidation.isValid,
              errors: asyncValidation.errors,
              warnings: asyncValidation.warnings
            }
          });
          return;
        }

        if (asyncValidation.warnings.length > 0) {
          asyncValidation.warnings.forEach(w => logger.warn(w, LogCategory.FILE));
        }
      }

      if (uploadedFile.fileType === FileType.CSV || uploadedFile.fileType === FileType.TSV) {
        const result = await parseCsvWithPapa(file, (progress) => {
          this.updateFileProgress(uploadedFile.id, progress);
        });


        const csvValidation = DataValidator.validateCSVData(result.data);
        if (!csvValidation.isValid) {
          this.updateFileData(uploadedFile.id, {
            status: 'error',
            errorMessage: csvValidation.errors.join(', ')
          });
          return;
        }
        if (csvValidation.warnings.length > 0) {
          csvValidation.warnings.forEach(warning => logger.warn(warning, LogCategory.FILE));
        }

        const duplicates = detectDuplicateRows(result.data);

        this.updateFileData(uploadedFile.id, {
          parsedData: result.data,
          content: JSON.stringify(result.data),
          duplicates: {
            hasDuplicates: duplicates.hasDuplicates,
            duplicateCount: duplicates.duplicateCount
          }
        });

        if (duplicates.hasDuplicates) {
          showWarning(
            'Duplicate rows detected',
            `Found ${duplicates.duplicateCount} duplicate rows`
          );
        }

        uploadedFile.statistics = getDataStatistics(
          result.data,
          result.headers
        );

        const headers = result.data[0] ? Object.keys(result.data[0]) : [];
        const dataRows = result.data.map(row => headers.map(h => row[h]));

        const deepAnalysis = await DeepDataValidator.analyzeDataContent(
          headers,
          dataRows,
          { sampleSize: Math.min(100, dataRows.length) }
        );

        if (!deepAnalysis.geoDetection.hasGeoColumns) {
          showError(
            'Aucune colonne géographique détectée',
            'Assurez-vous d\'avoir une colonne avec des noms de lieux, codes ISO ou coordonnées.'
          );
          this.updateFileData(uploadedFile.id, {
            status: 'error',
            errorMessage: 'Pas de données géographiques détectées'
          });
          return;
        }

        if (deepAnalysis.geoDetection.suggestedPrimaryGeoColumn) {
          logger.info('Colonne géographique détectée', LogCategory.FILE, {
            column: deepAnalysis.geoDetection.suggestedPrimaryGeoColumn.columnName,
            type: deepAnalysis.geoDetection.suggestedPrimaryGeoColumn.type,
            confidence: deepAnalysis.geoDetection.suggestedPrimaryGeoColumn.confidence
          });
        }

        if (deepAnalysis.performanceWarnings.length > 0) {
          deepAnalysis.performanceWarnings.forEach(warning =>
            showWarning('Performance', warning)
          );
        }

        if (deepAnalysis.suggestions.length > 0) {
          logger.info('Suggestions d\'analyse', LogCategory.FILE, deepAnalysis.suggestions);
        }

        this.updateFileData(uploadedFile.id, {
          parsedData: result.data,
          deepAnalysis: deepAnalysis
        });


        if (result.errors.length > 0) {
          this.updateFileData(uploadedFile.id, {
            validation: {
              isValid: false,
              errors: result.errors,
              warnings: []
            },
            status: 'error',
            errorMessage: result.errors[0]
          });
          return;
        }

        this.updateFileStatus(uploadedFile.id, 'complete');

        const updatedFile = createProjectState.newProject.uploadedFiles.find(f => f.id === uploadedFile.id);

        this.updateFileStatus(uploadedFile.id, 'complete');
      } else if (uploadedFile.fileType === FileType.GEOJSON) {
        const content = await readFileContent(file, (progress) => {
          this.updateFileProgress(uploadedFile.id, progress);
        });

        try {
          const parsedData = JSON.parse(content as string);

          const geoValidation = DataValidator.validateGeoData(parsedData);
          if (!geoValidation.isValid) {
            this.updateFileData(uploadedFile.id, {
              status: 'error',
              errorMessage: geoValidation.errors.join(', ')
            });
            return;
          }
          if (geoValidation.warnings.length > 0) {
            geoValidation.warnings.forEach(warning => logger.warn(warning, LogCategory.FILE));
          }
          this.updateFileData(uploadedFile.id, {
            content: content,
            parsedData: parsedData
          });
        } catch (e) {
          this.updateFileData(uploadedFile.id, {
            content: content,
            status: 'error',
            errorMessage: 'Invalid JSON format'
          });
          return;
        }

        const geoValidation = await validateGeospatialFile(content as string);
        this.updateFileData(uploadedFile.id, {
          validation: {
            ...uploadedFile.validation,
            ...geoValidation
          }
        });

        if (!geoValidation.isValid) {
          this.updateFileData(uploadedFile.id, {
            status: 'error',
            errorMessage: geoValidation.errors[0]
          });
          return;
        }

        this.updateFileStatus(uploadedFile.id, 'complete');
      } else if (uploadedFile.fileType === FileType.GEOPACKAGE) {
        const content = await readFileContent(file, (progress) => {
          this.updateFileProgress(uploadedFile.id, progress * 0.5);
        });

        const geojson = await parseGeoPackage(
          content as ArrayBuffer,
          (progress) => {
            this.updateFileProgress(uploadedFile.id, 50 + progress * 0.5);
          }
        );

        this.updateFileData(uploadedFile.id, {
          parsedData: geojson,
          content: JSON.stringify(geojson)
        });

        const geoValidation = await validateGeospatialFile(
          JSON.stringify(geojson)
        );
        this.updateFileData(uploadedFile.id, {
          validation: {
            ...uploadedFile.validation,
            ...geoValidation
          }
        });

        if (!geoValidation.isValid) {
          this.updateFileData(uploadedFile.id, {
            status: 'error',
            errorMessage: geoValidation.errors[0]
          });
          return;
        }

        this.updateFileStatus(uploadedFile.id, 'complete');
      } else {
        const content = await readFileContent(file, (progress) => {
          this.updateFileProgress(uploadedFile.id, progress);
        });
        this.updateFileData(uploadedFile.id, {
          content: content,
          status: 'complete'
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to process file';
      this.updateFileData(uploadedFile.id, {
        status: 'error',
        errorMessage: message
      });
      showError('File processing failed', message, error);
    }
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to process shapefile';
      this.updateFileData(uploadedFile.id, {
        status: 'error',
        errorMessage: message
      });
      showError('Shapefile processing failed', message, error);
    }
  },

  async processPastedData(pastedText: string): Promise<void> {
    const { fileType, validation } = extractDataFromPaste(pastedText);

    let baseName = 'pasted-data';
    let extension =
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
      const fileName = createProjectState.newProject.uploadedFiles[index].name;
      createProjectState.newProject.uploadedFiles.splice(index, 1);

      globalActions.removeDataButton(fileId);
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
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load online file';
      this.setNewProjectError(message);
      showError('Failed to load online file', message, error);
    } finally {
      this.setNewProjectLoading(false);
    }
  },

  clearAllFiles(): void {
    createProjectState.newProject.uploadedFiles = [];

    globalActions.clearAllDataButtons();
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
