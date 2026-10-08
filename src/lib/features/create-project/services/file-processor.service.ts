import type {
  ProcessingCallbacks,
  FileProcessorService
} from '../types/file-processing.service.types';
export type {
  ProcessingCallbacks,
  FileProcessorService
} from '../types/file-processing.service.types';
import { FILE_EXTENSIONS, MIME } from '$lib/features/commons/constants';
import {
  EXCLUDED_COLUMNS,
  INTERNAL_COLUMN
} from '$lib/features/commons/constants/data.constants';
import { FileStatus } from '$lib/features/commons/constants/ui.constants';
import type { UploadedFile } from '$lib/features/commons/types/create-project.types';
import { FileType } from '$lib/features/commons/types/create-project.types';
import { getFileExtension } from '$lib/features/commons/utils/file.utils';
import { readFileContent } from '$lib/features/commons/utils/file-import.utils';
import { FileValidator } from '$lib/features/commons/utils/file-validator.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
import {
  PERF_PHASE,
  perfMark,
  perfMeasure
} from '$lib/features/commons/utils/perf-marks.utils';
import {
  buildStatisticsFromColumns,
  dataPipeline,
  isZipDatasetResult,
  type DatasetResult
} from '$lib/features/data-pipeline';
import { Duck } from '$lib/features/duckdb';
import * as m from '$lib/paraglide/messages';

type ProcessFileResult = Awaited<ReturnType<typeof dataPipeline.processFile>>;

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

interface FileProcessor {
  process: (uploadedFile: UploadedFile, file: File) => Promise<void>;
}

function countUserColumns(
  columns: ReadonlyArray<{ name: string }>,
  geometry?: DatasetResult['geometry']
): number {
  const hiddenColumns = new Set<string>([
    ...EXCLUDED_COLUMNS,
    ...(geometry?.columnName ? [geometry.columnName] : [])
  ]);

  return columns.filter((column) => !hiddenColumns.has(column.name)).length;
}

async function updateFileFromDuckDBDataset(
  callbacks: ProcessingCallbacks,
  uploadedFile: UploadedFile,
  dataset: DatasetResult,
  fileContent: UploadedFile['content']
): Promise<void> {
  const { tableName, columns, rowCount, geometry } = dataset;

  callbacks.onProgress(uploadedFile.id, 50);

  const statistics = buildStatisticsFromColumns(columns);

  callbacks.onDataUpdate(uploadedFile.id, {
    rowCount,
    columnCount: countUserColumns(columns, geometry),
    statistics,
    content: fileContent,
    duckdbTableName: tableName,
    ...(geometry ? { geometry } : {})
  });

  callbacks.onProgress(uploadedFile.id, 100);
  callbacks.onStatusChange(uploadedFile.id, FileStatus.COMPLETE);

  warnIfKmlExtendedDataDropped(uploadedFile, fileContent);
}

// The DuckDB spatial GDAL build ships the basic KML driver (no LIBKML), so a KML
// <ExtendedData>/<SchemaData> attribute set is silently dropped to Name/Description.
// Warn the user when the source actually carried extended attributes.
function warnIfKmlExtendedDataDropped(
  uploadedFile: UploadedFile,
  fileContent: UploadedFile['content']
): void {
  if (uploadedFile.fileType !== FileType.KML) return;
  if (typeof fileContent !== 'string') return;
  if (!/<(?:ExtendedData|SchemaData)\b/.test(fileContent)) return;
  showWarning(
    m.warning_kml_extended_data_title(),
    m.warning_kml_extended_data_message()
  );
}

async function readDuckDBGeofileContent(
  callbacks: ProcessingCallbacks,
  uploadedFile: UploadedFile,
  file: File
): Promise<UploadedFile['content']> {
  callbacks.onProgress(uploadedFile.id, 20);

  const shouldReadAsText =
    uploadedFile.fileType === FileType.GEOJSON ||
    uploadedFile.fileType === FileType.KML ||
    uploadedFile.fileType === FileType.GPX;

  const content = shouldReadAsText
    ? await file.text()
    : await file.arrayBuffer();
  callbacks.onProgress(uploadedFile.id, 40);

  return content;
}

async function validateAsync(
  callbacks: ProcessingCallbacks,
  uploadedFile: UploadedFile,
  file: File
): Promise<boolean> {
  const validation = FileValidator.validate(file);
  // Content checks only run on a file that passed the basic ones: an empty
  // CSV would otherwise report "file is empty" from both.
  const result =
    validation.isValid && validation.requiresAsyncValidation
      ? await FileValidator.validateAsync(file, validation)
      : validation;

  if (result.isValid) return true;

  callbacks.onDataUpdate(uploadedFile.id, {
    status: FileStatus.ERROR,
    errorMessage: result.errors.join(m.separator_comma_space()),
    validation: result
  });
  return false;
}

function createCsvProcessor(callbacks: ProcessingCallbacks): FileProcessor {
  async function process(
    uploadedFile: UploadedFile,
    file: File
  ): Promise<void> {
    if (!(await validateAsync(callbacks, uploadedFile, file))) return;

    perfMark(PERF_PHASE.FILE_IMPORT);

    const originalContent = await readFileContent(file, (progress) => {
      callbacks.onProgress(uploadedFile.id, progress);
    });

    const dataset = (await dataPipeline.processFile(file, {
      sourceFileId: uploadedFile.id
    })) as DatasetResult;
    const { tableName, columns, rowCount } = dataset;

    if (rowCount === 0) {
      callbacks.onStatusChange(
        uploadedFile.id,
        FileStatus.ERROR,
        m.pipeline_error_header_only()
      );
      perfMeasure(PERF_PHASE.FILE_IMPORT);
      return;
    }

    const statistics = buildStatisticsFromColumns(columns);

    callbacks.onDataUpdate(uploadedFile.id, {
      content: originalContent,
      duckdbTableName: tableName,
      rowCount,
      columnCount: countUserColumns(columns),
      statistics
    });

    perfMeasure(PERF_PHASE.FILE_IMPORT);
    callbacks.onStatusChange(uploadedFile.id, FileStatus.COMPLETE);
  }

  return { process };
}

function createDuckDBGeofileProcessor(
  callbacks: ProcessingCallbacks
): FileProcessor {
  async function process(
    uploadedFile: UploadedFile,
    file: File
  ): Promise<void> {
    if (!(await validateAsync(callbacks, uploadedFile, file))) return;

    const content = await readDuckDBGeofileContent(
      callbacks,
      uploadedFile,
      file
    );

    const result = await dataPipeline.processUploadedFile(uploadedFile, file);

    await updateFileFromDuckDBDataset(
      callbacks,
      uploadedFile,
      result as DatasetResult,
      content
    );
  }

  return { process };
}

function createGeoPackageProcessor(
  callbacks: ProcessingCallbacks
): FileProcessor {
  return createDuckDBGeofileProcessor(callbacks);
}

function createZipProcessor(callbacks: ProcessingCallbacks): FileProcessor {
  function resolveArchiveDatasetFileType(dataset: DatasetResult): FileType {
    const detectedFileType = detectFileTypeFromName(dataset.name);
    if (detectedFileType !== FileType.UNKNOWN) {
      return detectedFileType;
    }

    return (
      Object.values(FileType).find(
        (fileType) => fileType === dataset.metadata.fileType
      ) ?? FileType.UNKNOWN
    );
  }

  async function buildArchiveLayerSnapshot(
    duck: typeof Duck,
    dataset: DatasetResult,
    headers: string[]
  ): Promise<Uint8Array> {
    const geometryColumnName = dataset.geometry
      ? (dataset.geometry.columnName ?? INTERNAL_COLUMN.GEOM)
      : undefined;
    const userColumns = headers.filter(
      (header) =>
        header !== geometryColumnName &&
        !EXCLUDED_COLUMNS.includes(header as (typeof EXCLUDED_COLUMNS)[number])
    );
    return duck.copy_to_parquet_bytes(
      dataset.tableName,
      geometryColumnName ? [...userColumns, geometryColumnName] : userColumns
    );
  }

  async function processMultipleDatasets(
    uploadedFile: UploadedFile,
    zipResult: ProcessFileResult,
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

      const detectedFileType = resolveArchiveDatasetFileType(dataset);
      const detectedMimeType = getMimeTypeFromFileType(detectedFileType);

      const statistics = buildStatisticsFromColumns(columns);

      const archiveLayerSnapshot = await buildArchiveLayerSnapshot(
        duck,
        dataset,
        headers
      );
      const geometryUpdates = {
        ...(geometry ? { geometry } : {}),
        archiveLayerSnapshot
      };
      if (i === 0) {
        callbacks.onDataUpdate(uploadedFile.id, {
          name,
          fileType: detectedFileType,
          rowCount,
          columnCount: countUserColumns(columns, geometry),
          statistics,
          content: undefined,
          sourceArchive: result.sourceZipName,
          duckdbTableName: tableName,
          ...geometryUpdates
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
          rowCount,
          columnCount: countUserColumns(columns, geometry),
          statistics,
          sourceArchive: result.sourceZipName,
          duckdbTableName: tableName,
          ...geometryUpdates
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

    const result = await dataPipeline.processFile(file);

    if (isZipDatasetResult(result)) {
      await processMultipleDatasets(uploadedFile, result, Duck);
      return;
    }

    await updateFileFromDuckDBDataset(
      callbacks,
      uploadedFile,
      result,
      fileContent
    );
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

  if (
    fileType === FileType.GEOJSON ||
    fileType === FileType.KML ||
    fileType === FileType.GPX ||
    fileType === FileType.SHAPEFILE ||
    fileType === FileType.GEOPARQUET
  ) {
    return createDuckDBGeofileProcessor(callbacks);
  }

  if (fileType === FileType.GEOPACKAGE) {
    return createGeoPackageProcessor(callbacks);
  }

  if (fileType === FileType.ZIP || fileType === FileType.KMZ) {
    return createZipProcessor(callbacks);
  }

  return createGenericProcessor(callbacks);
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
