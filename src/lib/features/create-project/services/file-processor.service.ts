import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import { FileType } from '$lib/features/commons/store/create-project.types';
import { DeepDataValidator } from '$lib/features/commons/utils/deep-validator.utils';
import {
  detectDuplicateRows,
  getDataStatistics,
  parseCsvWithPapa,
  parseGeoPackage,
  readFileContent,
  validateGeospatialFile
} from '$lib/features/commons/utils/file-import.utils';
import { FileValidator } from '$lib/features/commons/utils/file-validator.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import {
  showError,
  showWarning
} from '$lib/features/commons/utils/notification.utils.svelte';
import { DataValidator } from '$lib/features/commons/utils/validation.utils';

const ERROR_FILE_PROCESSING = 'Failed to process file';
const ERROR_INVALID_JSON_FORMAT = 'Invalid JSON format';
const ERROR_NO_GEO_COLUMN_TITLE = 'Aucune colonne géographique détectée';
const ERROR_NO_GEO_COLUMN_MESSAGE =
  "Assurez-vous d'avoir une colonne avec des noms de lieux, codes ISO ou coordonnées.";
const WARNING_DUPLICATE_ROWS_TITLE = 'Duplicate rows detected';
const WARNING_PERFORMANCE_TITLE = 'Performance';

type CsvPrimitive = string | number | boolean | null | Date;
type CsvRow = Record<string, CsvPrimitive>;
type CsvMatrix = CsvPrimitive[][];

export interface ProcessingCallbacks {
  onProgress: (fileId: string, progress: number) => void;
  onStatusChange: (
    fileId: string,
    status: UploadedFile['status'],
    errorMessage?: string
  ) => void;
  onDataUpdate: (fileId: string, data: Partial<UploadedFile>) => void;
}

export class FileProcessorService {
  constructor(private callbacks: ProcessingCallbacks) {}

  async processFile(uploadedFile: UploadedFile, file: File): Promise<void> {
    try {
      this.callbacks.onStatusChange(uploadedFile.id, 'processing');

      const processor = this.getProcessor(uploadedFile.fileType);
      await processor.process(uploadedFile, file);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : ERROR_FILE_PROCESSING;
      this.callbacks.onStatusChange(uploadedFile.id, 'error', message);
      logger.error('File processing failed', LogCategory.FILE, error);
    }
  }

  private getProcessor(fileType: FileType): FileProcessor {
    switch (fileType) {
      case FileType.CSV:

      case FileType.TSV:
        return new CsvProcessor(this.callbacks);

      case FileType.GEOJSON:
        return new GeoJsonProcessor(this.callbacks);

      case FileType.GEOPACKAGE:
        return new GeoPackageProcessor(this.callbacks);

      default:
        return new GenericProcessor(this.callbacks);
    }
  }
}

abstract class FileProcessor {
  constructor(protected callbacks: ProcessingCallbacks) {}

  abstract process(uploadedFile: UploadedFile, file: File): Promise<void>;

  protected async validateAsync(
    uploadedFile: UploadedFile,
    file: File
  ): Promise<boolean> {
    const validation = FileValidator.validate(file);

    if (validation.requiresAsyncValidation) {
      const asyncValidation = await FileValidator.validateAsync(
        file,
        validation
      );
      if (!asyncValidation.isValid) {
        this.callbacks.onDataUpdate(uploadedFile.id, {
          status: 'error',
          errorMessage: asyncValidation.errors.join(', '),
          validation: asyncValidation
        });
        return false;
      }

      if (asyncValidation.warnings.length > 0) {
        asyncValidation.warnings.forEach((warning) =>
          logger.warn(warning, LogCategory.FILE)
        );
      }
    }

    return true;
  }
}

class CsvProcessor extends FileProcessor {
  async process(uploadedFile: UploadedFile, file: File): Promise<void> {
    if (!(await this.validateAsync(uploadedFile, file))) return;

    const result = await parseCsvWithPapa(file, (progress) => {
      this.callbacks.onProgress(uploadedFile.id, progress);
    });

    const headers = result.headers;
    const csvRows = (result.data as Array<Record<string, unknown>>).map((row) =>
      normalizeCsvRow(row, headers)
    );

    const csvValidation = DataValidator.validateCSVData(csvRows);
    if (!csvValidation.isValid) {
      this.callbacks.onStatusChange(
        uploadedFile.id,
        'error',
        csvValidation.errors.join(', ')
      );
      return;
    }

    if (csvValidation.warnings.length > 0) {
      csvValidation.warnings.forEach((warning) =>
        logger.warn(warning, LogCategory.FILE)
      );
    }

    const duplicates = detectDuplicateRows(csvRows);
    const statistics = getDataStatistics(csvRows, headers);

    this.callbacks.onDataUpdate(uploadedFile.id, {
      parsedData: csvRows,
      content: JSON.stringify(csvRows),
      duplicates: {
        hasDuplicates: duplicates.hasDuplicates,
        duplicateCount: duplicates.duplicateCount
      },
      statistics
    });

    if (duplicates.hasDuplicates) {
      showWarning(
        WARNING_DUPLICATE_ROWS_TITLE,
        `Found ${duplicates.duplicateCount} duplicate rows`
      );
    }

    const deepAnalysisCompleted = await this.performDeepAnalysis(
      uploadedFile,
      csvRows,
      headers
    );
    if (!deepAnalysisCompleted) {
      return;
    }

    this.callbacks.onStatusChange(uploadedFile.id, 'complete');
  }

  private async performDeepAnalysis(
    uploadedFile: UploadedFile,
    rows: CsvRow[],
    headers: string[]
  ): Promise<boolean> {
    const dataMatrix: CsvMatrix = rows.map((row) =>
      headers.map((header) => row[header] ?? null)
    );

    const deepAnalysis = await DeepDataValidator.analyzeDataContent(
      headers,
      dataMatrix,
      { sampleSize: Math.min(100, dataMatrix.length) }
    );

    if (!deepAnalysis.geoDetection.hasGeoColumns) {
      showError(ERROR_NO_GEO_COLUMN_TITLE, ERROR_NO_GEO_COLUMN_MESSAGE);
      this.callbacks.onStatusChange(
        uploadedFile.id,
        'error',
        'Pas de données géographiques détectées'
      );
      return false;
    }

    if (deepAnalysis.performanceWarnings.length > 0) {
      deepAnalysis.performanceWarnings.forEach((warning) =>
        showWarning(WARNING_PERFORMANCE_TITLE, warning)
      );
    }

    this.callbacks.onDataUpdate(uploadedFile.id, { deepAnalysis });
    return true;
  }
}

class GeoJsonProcessor extends FileProcessor {
  async process(uploadedFile: UploadedFile, file: File): Promise<void> {
    if (!(await this.validateAsync(uploadedFile, file))) return;

    const content = await readFileContent(file, (progress) => {
      this.callbacks.onProgress(uploadedFile.id, progress);
    });

    try {
      const parsedData = JSON.parse(content as string);

      const geoValidation = DataValidator.validateGeoData(parsedData);
      if (!geoValidation.isValid) {
        this.callbacks.onStatusChange(
          uploadedFile.id,
          'error',
          geoValidation.errors.join(', ')
        );
        return;
      }

      if (geoValidation.warnings.length > 0) {
        geoValidation.warnings.forEach((warning) =>
          logger.warn(warning, LogCategory.FILE)
        );
      }

      this.callbacks.onDataUpdate(uploadedFile.id, {
        content,
        parsedData
      });

      const spatialValidation = await validateGeospatialFile(content as string);
      if (!spatialValidation.isValid) {
        this.callbacks.onStatusChange(
          uploadedFile.id,
          'error',
          spatialValidation.errors[0]
        );
        return;
      }

      this.callbacks.onStatusChange(uploadedFile.id, 'complete');
    } catch (e) {
      this.callbacks.onStatusChange(
        uploadedFile.id,
        'error',
        ERROR_INVALID_JSON_FORMAT
      );
    }
  }
}

class GeoPackageProcessor extends FileProcessor {
  async process(uploadedFile: UploadedFile, file: File): Promise<void> {
    if (!(await this.validateAsync(uploadedFile, file))) return;

    const content = await readFileContent(file, (progress) => {
      this.callbacks.onProgress(uploadedFile.id, progress * 0.5);
    });

    const geojson = await parseGeoPackage(
      content as ArrayBuffer,
      (progress) => {
        this.callbacks.onProgress(uploadedFile.id, 50 + progress * 0.5);
      }
    );

    const geoValidation = await validateGeospatialFile(JSON.stringify(geojson));
    if (!geoValidation.isValid) {
      this.callbacks.onStatusChange(
        uploadedFile.id,
        'error',
        geoValidation.errors[0]
      );
      return;
    }

    this.callbacks.onDataUpdate(uploadedFile.id, {
      parsedData: geojson,
      content: JSON.stringify(geojson),
      validation: geoValidation
    });

    this.callbacks.onStatusChange(uploadedFile.id, 'complete');
  }
}

class GenericProcessor extends FileProcessor {
  async process(uploadedFile: UploadedFile, file: File): Promise<void> {
    const content = await readFileContent(file, (progress) => {
      this.callbacks.onProgress(uploadedFile.id, progress);
    });

    this.callbacks.onDataUpdate(uploadedFile.id, {
      content,
      status: 'complete'
    });
  }
}

function normalizeCsvRow(
  row: Record<string, unknown>,
  headers: readonly string[]
): CsvRow {
  return headers.reduce<CsvRow>((accumulator, header) => {
    accumulator[header] = normalizeCsvValue(row[header]);
    return accumulator;
  }, {} as CsvRow);
}

function normalizeCsvValue(value: unknown): CsvPrimitive {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}
