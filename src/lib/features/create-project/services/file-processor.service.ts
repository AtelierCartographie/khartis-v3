import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import { FileType } from '$lib/features/commons/store/create-project.types';
import { DeepDataValidator } from '$lib/features/commons/utils/deep-validator.utils';
import {
  detectDuplicateRows,
  getDataStatistics,
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
import * as m from '$lib/paraglide/messages';

const ERROR_FILE_PROCESSING = () => m.error_file_processing();
const ERROR_INVALID_JSON_FORMAT = () => m.error_invalid_json_format();
const ERROR_NO_GEO_COLUMN_TITLE = () => m.error_no_geo_column_title();
const ERROR_NO_GEO_COLUMN_MESSAGE = () => m.error_no_geo_column_message();
const WARNING_DUPLICATE_ROWS_TITLE = () => m.warning_duplicate_rows_title();
const WARNING_PERFORMANCE_TITLE = () => m.warning_performance_title();

import type { JsonValue, TabularData } from '$lib/types/data';

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
    const startTime = performance.now();
    logger.debug('[FileProcessorService:processFile] START', LogCategory.FILE, {
      fileId: uploadedFile.id,
      fileName: file.name,
      fileSize: file.size,
      fileType: uploadedFile.fileType
    });

    try {
      this.callbacks.onStatusChange(uploadedFile.id, 'processing');

      const processor = this.getProcessor(uploadedFile.fileType);
      await processor.process(uploadedFile, file);

      const duration = performance.now() - startTime;
      logger.debug('[FileProcessorService:processFile] END', LogCategory.FILE, {
        fileId: uploadedFile.id,
        duration: `${duration.toFixed(2)}ms`
      });
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
      const message =
        error instanceof Error ? error.message : ERROR_FILE_PROCESSING();
      this.callbacks.onStatusChange(uploadedFile.id, 'error', message);
    }
  }

  private getProcessor(fileType: FileType): FileProcessor {
    if (fileType === FileType.CSV || fileType === FileType.TSV) {
      return new CsvProcessor(this.callbacks);
    }

    if (fileType === FileType.GEOJSON) {
      return new GeoJsonProcessor(this.callbacks);
    }

    if (fileType === FileType.GEOPACKAGE) {
      return new GeoPackageProcessor(this.callbacks);
    }

    return new GenericProcessor(this.callbacks);
  }
}

abstract class FileProcessor {
  constructor(protected callbacks: ProcessingCallbacks) {}

  abstract process(uploadedFile: UploadedFile, file: File): Promise<void>;

  protected async stringifyInChunks(data: unknown[]): Promise<string> {
    // For small datasets, use regular JSON.stringify
    if (data.length < 1000) {
      return JSON.stringify(data);
    }

    // For large datasets, stringify in chunks to avoid blocking
    const chunks: string[] = [];
    const CHUNK_SIZE = 500;

    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      // Yield to event loop between chunks
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 0));

      const chunk = data.slice(i, i + CHUNK_SIZE);
      chunks.push(JSON.stringify(chunk).slice(1, -1)); // Remove [ and ]
    }

    return '[' + chunks.join(',') + ']';
  }

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
    const startTime = performance.now();
    logger.debug('[CsvProcessor:process] START', LogCategory.FILE, {
      fileId: uploadedFile.id,
      fileName: file.name
    });

    if (!(await this.validateAsync(uploadedFile, file))) return;

    // Use new dataPipeline CSV parser (no Web Worker issues)
    logger.debug(
      '[CsvProcessor:process] Parsing CSV with dataPipeline...',
      LogCategory.FILE
    );
    const parseStart = performance.now();

    // Import CSV parser from new architecture
    const { CSVParser } = await import('$lib/features/data-pipeline');
    const csvParser = new CSVParser();
    const rawDataset = await csvParser.parse(file);

    logger.debug('[CsvProcessor:process] CSV parsed', LogCategory.FILE, {
      duration: `${(performance.now() - parseStart).toFixed(2)}ms`,
      rowCount: rawDataset.rows.length,
      columnCount: rawDataset.columns.length
    });

    // Convert RawDataset to the format expected by the rest of the code
    const headers = rawDataset.columns.map((col) => col.name);
    const csvRows = rawDataset.columns[0].values.map((_, rowIndex) => {
      const row: Record<string, unknown> = {};
      rawDataset.columns.forEach((col) => {
        row[col.name] = col.values[rowIndex];
      });
      return normalizeCsvRow(row, headers);
    });

    logger.debug(
      '[CsvProcessor:process] Validating CSV data...',
      LogCategory.FILE
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

    // Use async versions of data analysis functions to avoid blocking
    logger.debug(
      '[CsvProcessor:process] Detecting duplicates...',
      LogCategory.FILE
    );
    const dupStart = performance.now();
    const duplicates = await detectDuplicateRows(csvRows);
    logger.debug(
      '[CsvProcessor:process] Duplicates detected',
      LogCategory.FILE,
      {
        duration: `${(performance.now() - dupStart).toFixed(2)}ms`,
        hasDuplicates: duplicates.hasDuplicates,
        count: duplicates.duplicateCount
      }
    );

    logger.debug(
      '[CsvProcessor:process] Computing statistics...',
      LogCategory.FILE
    );
    const statsStart = performance.now();
    const statistics = await getDataStatistics(csvRows, headers);
    logger.debug(
      '[CsvProcessor:process] Statistics computed',
      LogCategory.FILE,
      {
        duration: `${(performance.now() - statsStart).toFixed(2)}ms`
      }
    );

    logger.debug(
      '[CsvProcessor:process] Converting to tabular data...',
      LogCategory.FILE
    );
    const tabularData = csvRowsToTabularData(csvRows);

    // Yield before JSON.stringify to avoid blocking
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Stringify in chunks for large datasets to avoid blocking
    logger.debug(
      '[CsvProcessor:process] Stringifying data...',
      LogCategory.FILE
    );
    const stringifyStart = performance.now();
    const content = await this.stringifyInChunks(tabularData);
    logger.debug('[CsvProcessor:process] Data stringified', LogCategory.FILE, {
      duration: `${(performance.now() - stringifyStart).toFixed(2)}ms`,
      size: content.length
    });

    this.callbacks.onDataUpdate(uploadedFile.id, {
      parsedData: tabularData,
      content,
      duplicates: {
        hasDuplicates: duplicates.hasDuplicates,
        duplicateCount: duplicates.duplicateCount
      },
      statistics
    });

    if (duplicates.hasDuplicates) {
      showWarning(
        WARNING_DUPLICATE_ROWS_TITLE(),
        `Found ${duplicates.duplicateCount} duplicate rows`
      );
    }

    logger.debug(
      '[CsvProcessor:process] Starting deep analysis...',
      LogCategory.FILE
    );
    const deepAnalysisStart = performance.now();
    const deepAnalysisCompleted = await this.performDeepAnalysis(
      uploadedFile,
      csvRows,
      headers
    );
    logger.debug(
      '[CsvProcessor:process] Deep analysis completed',
      LogCategory.FILE,
      {
        duration: `${(performance.now() - deepAnalysisStart).toFixed(2)}ms`,
        success: deepAnalysisCompleted
      }
    );

    if (!deepAnalysisCompleted) {
      return;
    }

    this.callbacks.onStatusChange(uploadedFile.id, 'complete');

    const totalDuration = performance.now() - startTime;
    logger.debug('[CsvProcessor:process] END', LogCategory.FILE, {
      fileId: uploadedFile.id,
      totalDuration: `${totalDuration.toFixed(2)}ms`
    });
  }

  private async performDeepAnalysis(
    uploadedFile: UploadedFile,
    rows: CsvRow[],
    headers: string[]
  ): Promise<boolean> {
    logger.debug('[CsvProcessor:performDeepAnalysis] START', LogCategory.FILE, {
      rowCount: rows.length,
      columnCount: headers.length
    });

    logger.debug(
      '[CsvProcessor:performDeepAnalysis] Creating data matrix...',
      LogCategory.FILE
    );
    const dataMatrix: CsvMatrix = rows.map((row) =>
      headers.map((header) => row[header] ?? null)
    );

    logger.debug(
      '[CsvProcessor:performDeepAnalysis] Calling DeepDataValidator...',
      LogCategory.FILE
    );
    const deepAnalysisStart = performance.now();
    const deepAnalysis = await DeepDataValidator.analyzeDataContent(
      headers,
      dataMatrix,
      { sampleSize: Math.min(100, dataMatrix.length) }
    );
    logger.debug(
      '[CsvProcessor:performDeepAnalysis] DeepDataValidator completed',
      LogCategory.FILE,
      {
        duration: `${(performance.now() - deepAnalysisStart).toFixed(2)}ms`,
        hasGeoColumns: deepAnalysis.geoDetection.hasGeoColumns
      }
    );

    if (!deepAnalysis.geoDetection.hasGeoColumns) {
      showError(ERROR_NO_GEO_COLUMN_TITLE(), ERROR_NO_GEO_COLUMN_MESSAGE());
      this.callbacks.onStatusChange(
        uploadedFile.id,
        'error',
        ERROR_NO_GEO_COLUMN_TITLE()
      );
      return false;
    }

    if (deepAnalysis.performanceWarnings.length > 0) {
      deepAnalysis.performanceWarnings.forEach((warning) =>
        showWarning(WARNING_PERFORMANCE_TITLE(), warning)
      );
    }

    this.callbacks.onDataUpdate(uploadedFile.id, { deepAnalysis });
    logger.debug('[CsvProcessor:performDeepAnalysis] END', LogCategory.FILE);
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
    } catch (_e) {
      this.callbacks.onStatusChange(
        uploadedFile.id,
        'error',
        ERROR_INVALID_JSON_FORMAT()
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
      parsedData: geojson as UploadedFile['parsedData'],
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

function csvRowsToTabularData(csvRows: CsvRow[]): TabularData {
  return csvRows.map((row) => {
    const tabularRow: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(row)) {
      if (value instanceof Date) {
        tabularRow[key] = value.toISOString();
      } else {
        tabularRow[key] = value;
      }
    }
    return tabularRow;
  });
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
