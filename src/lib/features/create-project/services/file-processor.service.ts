import { FileStatus } from '$lib/features/commons/constants/ui.constants';
import { FILE_EXTENSIONS, MIME } from '$lib/features/commons/constants';
import { INTERNAL_COLUMN } from '$lib/features/commons/constants/data.constants';
import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import { FileType } from '$lib/features/commons/store/create-project.types';
import type { DatasetResult } from '$lib/features/data-pipeline';
import { DeepDataValidator } from '$lib/features/commons/utils/deep-validator.utils';
import { getFileExtension } from '$lib/features/commons/utils/file.utils';
import {
  readFileContent,
  validateGeospatialFile
} from '$lib/features/commons/utils/file-import.utils';
import { FileValidator } from '$lib/features/commons/utils/file-validator.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
import { DataValidator } from '$lib/features/commons/utils/validation.utils';
import { Duck } from '$lib/features/duckdb';
import * as m from '$lib/paraglide/messages';

const TABULAR_TEXT_EXTENSION = 'txt';

function detectFileTypeFromName(filename: string): FileType {
  const ext = getFileExtension(filename);
  const matches = <T extends readonly string[]>(values: T): boolean =>
    values.includes(ext as T[number]);

  if (matches(FILE_EXTENSIONS.CSV)) {
    return FileType.CSV;
  }
  if (matches(FILE_EXTENSIONS.TSV) || ext === TABULAR_TEXT_EXTENSION) {
    return FileType.TSV;
  }
  if (matches(FILE_EXTENSIONS.GEOJSON)) {
    return FileType.GEOJSON;
  }
  if (matches(FILE_EXTENSIONS.SHAPEFILE)) {
    return FileType.SHAPEFILE;
  }
  if (matches(FILE_EXTENSIONS.GEOPACKAGE)) {
    return FileType.GEOPACKAGE;
  }
  if (matches(FILE_EXTENSIONS.GEOPARQUET)) {
    return FileType.GEOPARQUET;
  }
  if (matches(FILE_EXTENSIONS.ARROW)) {
    return FileType.ARROW;
  }
  if (matches(FILE_EXTENSIONS.KML)) {
    return FileType.KML;
  }
  if (matches(FILE_EXTENSIONS.KMZ)) {
    return FileType.KMZ;
  }
  if (matches(FILE_EXTENSIONS.GPX)) {
    return FileType.GPX;
  }
  if (matches(FILE_EXTENSIONS.ZIP)) {
    return FileType.ZIP;
  }

  return FileType.UNKNOWN;
}

function getMimeTypeFromFileType(fileType: FileType): string {
  switch (fileType) {
    case FileType.CSV:
      return MIME.CSV;
    case FileType.TSV:
      return MIME.TSV;
    case FileType.GEOJSON:
      return MIME.GEOJSON;
    case FileType.GEOPACKAGE:
      return MIME.GEOPACKAGE;
    case FileType.GEOPARQUET:
    case FileType.ARROW:
      return MIME.BINARY;
    case FileType.KML:
      return MIME.KML;
    case FileType.KMZ:
      return MIME.KMZ;
    case FileType.GPX:
      return MIME.GPX;
    default:
      return MIME.BINARY;
  }
}

const ERROR_INVALID_JSON_FORMAT = () => m.error_invalid_json_format();
const WARNING_NO_GEO_COLUMN_TITLE = () => m.warning_no_geo_column_title();
const WARNING_NO_GEO_COLUMN_MESSAGE = () => m.warning_no_geo_column_message();
const WARNING_DUPLICATE_ROWS_TITLE = () => m.warning_duplicate_rows_title();
const WARNING_PERFORMANCE_TITLE = () => m.warning_performance_title();

function getReadableErrorMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (
    errorMessage.includes('Multiple layers') ||
    errorMessage.includes('more than one layer')
  ) {
    return m.pipeline_error_geopackage_multiple_layers();
  }

  if (
    errorMessage.includes('Could not open file') ||
    errorMessage.includes('Invalid file') ||
    errorMessage.includes('not a valid')
  ) {
    return m.pipeline_error_file_unreadable();
  }

  if (
    errorMessage.includes('read_csv') ||
    errorMessage.includes('CSV') ||
    errorMessage.includes('delimiter') ||
    errorMessage.includes('column count')
  ) {
    return m.pipeline_error_csv_read_failed({
      detail: errorMessage.slice(0, 200)
    });
  }

  return m.pipeline_error_generic();
}

import {
  buildColumnStatistics,
  convertRowsToTabular,
  createDataMatrix,
  type ColumnInfo
} from './file-processor.utils';

export interface ProcessingCallbacks {
  onProgress: (fileId: string, progress: number) => void;
  onStatusChange: (
    fileId: string,
    status: UploadedFile['status'],
    errorMessage?: string
  ) => void;
  onDataUpdate: (fileId: string, data: Partial<UploadedFile>) => void;
  onAdditionalFile?: (file: UploadedFile) => void;
}

interface FileProcessor {
  process: (uploadedFile: UploadedFile, file: File) => Promise<void>;
}

async function validateAsync(
  callbacks: ProcessingCallbacks,
  uploadedFile: UploadedFile,
  file: File
): Promise<boolean> {
  const validation = FileValidator.validate(file);

  if (validation.requiresAsyncValidation) {
    const asyncValidation = await FileValidator.validateAsync(file, validation);
    if (!asyncValidation.isValid) {
      callbacks.onDataUpdate(uploadedFile.id, {
        status: FileStatus.ERROR,
        errorMessage: asyncValidation.errors.join(', '),
        validation: asyncValidation
      });
      return false;
    }

    if (asyncValidation.warnings.length > 0) {
      asyncValidation.warnings.forEach((warning) => {
        logger.warn(
          `[FileProcessor:validateAsync] ${warning}`,
          LogCategory.FILE,
          {
            fileId: uploadedFile.id,
            fileName: file.name
          }
        );
      });
    }
  }

  return true;
}

function createCsvProcessor(callbacks: ProcessingCallbacks): FileProcessor {
  async function computeDuplicatesAsync(
    fileId: string,
    tableName: string,
    duck: typeof Duck
  ): Promise<void> {
    try {
      const duplicateResult = (await duck.query(
        `SELECT (SELECT COUNT(*) FROM "${tableName}") - (SELECT COUNT(*) FROM (SELECT DISTINCT * FROM "${tableName}")) as duplicate_count`,
        { format: 'array' }
      )) as Array<{ duplicate_count: bigint | number }>;
      const duplicateCount = Number(duplicateResult[0]?.duplicate_count ?? 0);

      callbacks.onDataUpdate(fileId, {
        duplicates: {
          hasDuplicates: duplicateCount > 0,
          duplicateCount
        }
      });

      if (duplicateCount > 0) {
        showWarning(
          WARNING_DUPLICATE_ROWS_TITLE(),
          m.warning_duplicate_rows_message({ count: String(duplicateCount) })
        );
      }
    } catch (error) {
      logger.warn(
        '[CsvProcessor:computeDuplicatesAsync] Failed to compute duplicates',
        LogCategory.FILE,
        { fileId, error }
      );
    }
  }

  async function performDeepAnalysis(
    uploadedFile: UploadedFile,
    sampleData: Array<Record<string, unknown>>,
    headers: string[]
  ): Promise<boolean> {
    const dataMatrix = createDataMatrix(sampleData, headers);

    const deepAnalysis = await DeepDataValidator.analyzeDataContent(
      headers,
      dataMatrix,
      { sampleSize: Math.min(100, dataMatrix.length) }
    );

    if (!deepAnalysis.geoDetection.hasGeoColumns) {
      showWarning(
        WARNING_NO_GEO_COLUMN_TITLE(),
        WARNING_NO_GEO_COLUMN_MESSAGE()
      );
    }

    if (deepAnalysis.performanceWarnings.length > 0) {
      deepAnalysis.performanceWarnings.forEach((warning) =>
        showWarning(WARNING_PERFORMANCE_TITLE(), warning)
      );
    }

    callbacks.onDataUpdate(uploadedFile.id, { deepAnalysis });
    return true;
  }

  async function process(
    uploadedFile: UploadedFile,
    file: File
  ): Promise<void> {
    if (!(await validateAsync(callbacks, uploadedFile, file))) return;

    const originalContent = await readFileContent(file, (progress) => {
      callbacks.onProgress(uploadedFile.id, progress);
    });

    const { dataPipeline } = await import('$lib/features/data-pipeline');

    const dataset = (await dataPipeline.processFile(file)) as DatasetResult;
    const { tableName, columns, rowCount } = dataset;
    const headers = columns.map((col) => col.name);

    if (rowCount === 0) {
      callbacks.onStatusChange(
        uploadedFile.id,
        FileStatus.ERROR,
        m.pipeline_error_header_only()
      );
      return;
    }

    const statistics = buildColumnStatistics(columns as ColumnInfo[], rowCount);

    const sampleData = (await Duck.query(
      `SELECT * FROM "${tableName}" LIMIT 100`,
      { format: 'array' }
    )) as Array<Record<string, unknown>>;

    const tabularData = convertRowsToTabular(sampleData);

    callbacks.onDataUpdate(uploadedFile.id, {
      parsedData: tabularData,
      content: originalContent,
      statistics
    });

    const deepAnalysisCompleted = await performDeepAnalysis(
      uploadedFile,
      sampleData,
      headers
    );

    if (!deepAnalysisCompleted) {
      return;
    }

    callbacks.onStatusChange(uploadedFile.id, FileStatus.COMPLETE);
    computeDuplicatesAsync(uploadedFile.id, tableName, Duck);
  }

  return { process };
}

function createGeoJsonProcessor(callbacks: ProcessingCallbacks): FileProcessor {
  async function process(
    uploadedFile: UploadedFile,
    file: File
  ): Promise<void> {
    if (!(await validateAsync(callbacks, uploadedFile, file))) return;

    const content = await readFileContent(file, (progress) => {
      callbacks.onProgress(uploadedFile.id, progress);
    });

    try {
      const parsedData = JSON.parse(content as string);

      const geoValidation = DataValidator.validateGeoData(parsedData);
      if (!geoValidation.isValid) {
        callbacks.onStatusChange(
          uploadedFile.id,
          FileStatus.ERROR,
          geoValidation.errors.join(', ')
        );
        return;
      }

      if (geoValidation.warnings.length > 0) {
        geoValidation.warnings.forEach((warning) => {
          logger.warn(
            `[GeoJSON validation warning] ${warning}`,
            LogCategory.FILE,
            {
              fileId: uploadedFile.id,
              fileName: file.name
            }
          );
        });
      }

      callbacks.onDataUpdate(uploadedFile.id, {
        content,
        parsedData
      });

      const spatialValidation = await validateGeospatialFile(content as string);
      if (!spatialValidation.isValid) {
        callbacks.onStatusChange(
          uploadedFile.id,
          FileStatus.ERROR,
          spatialValidation.errors[0]
        );
        return;
      }

      callbacks.onStatusChange(uploadedFile.id, FileStatus.COMPLETE);
    } catch {
      callbacks.onStatusChange(
        uploadedFile.id,
        FileStatus.ERROR,
        ERROR_INVALID_JSON_FORMAT()
      );
    }
  }

  return { process };
}

function createGeoPackageProcessor(
  callbacks: ProcessingCallbacks
): FileProcessor {
  async function process(
    uploadedFile: UploadedFile,
    file: File
  ): Promise<void> {
    if (!(await validateAsync(callbacks, uploadedFile, file))) return;

    const content = await readFileContent(file, (progress) => {
      callbacks.onProgress(uploadedFile.id, progress);
    });

    const { dataPipeline } = await import('$lib/features/data-pipeline');

    const dataset = (await dataPipeline.processFile(file)) as DatasetResult;
    const { tableName } = dataset;

    const sampleData = (await Duck.query(
      `SELECT * FROM "${tableName}" LIMIT 100`,
      { format: 'array' }
    )) as Array<Record<string, unknown>>;

    const tabularData = convertRowsToTabular(sampleData);

    callbacks.onDataUpdate(uploadedFile.id, {
      content,
      parsedData: tabularData
    });

    callbacks.onStatusChange(uploadedFile.id, FileStatus.COMPLETE);
  }

  return { process };
}

function createZipProcessor(callbacks: ProcessingCallbacks): FileProcessor {
  async function processSingleDataset(
    uploadedFile: UploadedFile,
    dataset: Awaited<
      ReturnType<
        typeof import('$lib/features/data-pipeline').dataPipeline.processFile
      >
    > & {
      tableName: string;
      columns: Array<{
        name: string;
        type: unknown;
        stats: {
          count?: number;
          nulls?: number;
          uniques?: number;
          min?: unknown;
          max?: unknown;
          mean?: number;
        };
      }>;
    },
    fileContent: ArrayBuffer,
    duck: typeof Duck
  ): Promise<void> {
    const { tableName, columns, rowCount } = dataset as {
      tableName: string;
      columns: Array<{
        name: string;
        type: string;
        stats: {
          count?: number;
          nulls?: number;
          uniques?: number;
          min?: unknown;
          max?: unknown;
          mean?: number;
        };
      }>;
      rowCount: number;
    };
    const headers = columns.map((col) => col.name);

    callbacks.onProgress(uploadedFile.id, 50);

    const statistics = buildColumnStatistics(columns as ColumnInfo[], rowCount);

    const sampleData = (await duck.query(
      `SELECT * FROM "${tableName}" LIMIT 100`,
      { format: 'array' }
    )) as Array<Record<string, unknown>>;

    const tabularData = convertRowsToTabular(sampleData);

    callbacks.onProgress(uploadedFile.id, 80);

    callbacks.onDataUpdate(uploadedFile.id, {
      parsedData: tabularData,
      statistics,
      content: fileContent
    });

    const dataMatrix = createDataMatrix(sampleData, headers);

    const deepAnalysis = await DeepDataValidator.analyzeDataContent(
      headers,
      dataMatrix,
      { sampleSize: Math.min(100, dataMatrix.length) }
    );

    callbacks.onDataUpdate(uploadedFile.id, { deepAnalysis });
    callbacks.onProgress(uploadedFile.id, 100);
    callbacks.onStatusChange(uploadedFile.id, FileStatus.COMPLETE);
  }

  async function processMultipleDatasets(
    uploadedFile: UploadedFile,
    zipResult: Awaited<
      ReturnType<
        typeof import('$lib/features/data-pipeline').dataPipeline.processFile
      >
    >,
    duck: typeof Duck
  ): Promise<void> {
    const result = zipResult as {
      datasets: DatasetResult[];
      sourceZipName: string;
    };
    const datasets = result.datasets;
    const totalDatasets = datasets.length;

    for (let i = 0; i < datasets.length; i++) {
      const dataset = datasets[i];
      const { tableName, columns, rowCount, name, fileSize, geometry } =
        dataset;
      const headers = columns.map((col) => col.name);
      const progressBase = (i / totalDatasets) * 100;

      const detectedFileType = detectFileTypeFromName(name);
      const detectedMimeType = getMimeTypeFromFileType(detectedFileType);

      const statistics = buildColumnStatistics(
        columns as ColumnInfo[],
        rowCount
      );

      let previewData: Array<Record<string, unknown>> = [];
      try {
        previewData = (await duck.query(
          `SELECT * FROM "${tableName}" LIMIT 100`,
          {
            format: 'array'
          }
        )) as Array<Record<string, unknown>>;
      } catch {
        // Ignore errors - fallback to empty data
      }

      const tabularData = convertRowsToTabular(previewData);
      const sampleForAnalysis = previewData;
      const dataMatrix = createDataMatrix(sampleForAnalysis, headers);

      const deepAnalysis = await DeepDataValidator.analyzeDataContent(
        headers,
        dataMatrix,
        { sampleSize: Math.min(100, dataMatrix.length) }
      );

      if (geometry) {
        deepAnalysis.geoDetection = {
          hasGeoColumns: true,
          geoColumns: [
            {
              columnName: INTERNAL_COLUMN.GEOM,
              type: 'unknown',
              confidence: 1,
              index: 0
            }
          ],
          warnings: []
        };
      }

      if (i === 0) {
        callbacks.onDataUpdate(uploadedFile.id, {
          name,
          fileType: detectedFileType,
          parsedData: tabularData,
          statistics,
          content: undefined,
          deepAnalysis,
          sourceArchive: result.sourceZipName,
          duckdbTableName: tableName
        });
        callbacks.onProgress(uploadedFile.id, progressBase + 50);
        callbacks.onStatusChange(uploadedFile.id, FileStatus.COMPLETE);
      } else if (callbacks.onAdditionalFile) {
        const additionalFile: UploadedFile = {
          id: crypto.randomUUID(),
          name,
          size: fileSize ?? 0,
          type: detectedMimeType,
          fileType: detectedFileType,
          status: FileStatus.COMPLETE,
          sourceType: uploadedFile.sourceType,
          parsedData: tabularData,
          statistics,
          deepAnalysis,
          sourceArchive: result.sourceZipName,
          duckdbTableName: tableName
        };
        callbacks.onAdditionalFile(additionalFile);
      }
    }

    callbacks.onProgress(uploadedFile.id, 100);
  }

  async function process(
    uploadedFile: UploadedFile,
    file: File
  ): Promise<void> {
    if (!(await validateAsync(callbacks, uploadedFile, file))) return;

    callbacks.onProgress(uploadedFile.id, 10);

    const fileContent = await file.arrayBuffer();

    const { dataPipeline, isZipDatasetResult } =
      await import('$lib/features/data-pipeline');

    const result = await dataPipeline.processFile(file);

    if (isZipDatasetResult(result)) {
      await processMultipleDatasets(uploadedFile, result, Duck);
      return;
    }

    await processSingleDataset(uploadedFile, result, fileContent, Duck);
  }

  return { process };
}

function createGenericProcessor(callbacks: ProcessingCallbacks): FileProcessor {
  async function process(
    uploadedFile: UploadedFile,
    file: File
  ): Promise<void> {
    const content = await readFileContent(file, (progress) => {
      callbacks.onProgress(uploadedFile.id, progress);
    });

    callbacks.onDataUpdate(uploadedFile.id, {
      content,
      status: FileStatus.COMPLETE
    });
  }

  return { process };
}

function getProcessor(
  fileType: FileType,
  callbacks: ProcessingCallbacks
): FileProcessor {
  if (fileType === FileType.CSV || fileType === FileType.TSV) {
    return createCsvProcessor(callbacks);
  }

  if (fileType === FileType.GEOJSON) {
    return createGeoJsonProcessor(callbacks);
  }

  if (fileType === FileType.GEOPACKAGE) {
    return createGeoPackageProcessor(callbacks);
  }

  if (fileType === FileType.ZIP) {
    return createZipProcessor(callbacks);
  }

  return createGenericProcessor(callbacks);
}

export interface FileProcessorService {
  processFile: (uploadedFile: UploadedFile, file: File) => Promise<void>;
}

export function createFileProcessorService(
  callbacks: ProcessingCallbacks
): FileProcessorService {
  async function processFile(
    uploadedFile: UploadedFile,
    file: File
  ): Promise<void> {
    const startTime = performance.now();

    try {
      callbacks.onStatusChange(uploadedFile.id, FileStatus.PROCESSING);

      const processor = getProcessor(uploadedFile.fileType, callbacks);
      await processor.process(uploadedFile, file);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error(
        '[FileProcessorService:processFile] ERROR',
        LogCategory.FILE,
        {
          fileId: uploadedFile.id,
          duration: `${duration.toFixed(2)}ms`,
          error
        }
      );
      const message = getReadableErrorMessage(error);
      callbacks.onStatusChange(uploadedFile.id, FileStatus.ERROR, message);
    }
  }

  return {
    processFile
  };
}
