import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import { FileType } from '$lib/features/commons/store/create-project.types';
import { DeepDataValidator } from '$lib/features/commons/utils/deep-validator.utils';
import {
  type ColumnStatSummary,
  readFileContent,
  validateGeospatialFile
} from '$lib/features/commons/utils/file-import.utils';
import { FileValidator } from '$lib/features/commons/utils/file-validator.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { showWarning } from '$lib/features/commons/utils/notification.utils.svelte';
import { DataValidator } from '$lib/features/commons/utils/validation.utils';
import * as m from '$lib/paraglide/messages';

const ERROR_FILE_PROCESSING = () => m.error_file_processing();
const ERROR_INVALID_JSON_FORMAT = () => m.error_invalid_json_format();
const WARNING_NO_GEO_COLUMN_TITLE = () => m.warning_no_geo_column_title();
const WARNING_NO_GEO_COLUMN_MESSAGE = () => m.warning_no_geo_column_message();
const WARNING_DUPLICATE_ROWS_TITLE = () => m.warning_duplicate_rows_title();
const WARNING_PERFORMANCE_TITLE = () => m.warning_performance_title();

import type { JsonValue } from '$lib/types/data';

type CsvPrimitive = string | number | boolean | null | Date;
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

    try {
      this.callbacks.onStatusChange(uploadedFile.id, 'processing');

      const processor = this.getProcessor(uploadedFile.fileType);
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
    // Chunked stringify to avoid blocking on large datasets.
    if (data.length < 1000) {
      return JSON.stringify(data);
    }

    const chunks: string[] = [];
    const CHUNK_SIZE = 500;

    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, 0)); // yield between chunks

      const chunk = data.slice(i, i + CHUNK_SIZE);
      chunks.push(JSON.stringify(chunk).slice(1, -1)); // strip array brackets
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
}

class CsvProcessor extends FileProcessor {
  async process(uploadedFile: UploadedFile, file: File): Promise<void> {
    if (!(await this.validateAsync(uploadedFile, file))) return;

    // Read original file content for persistence (needed for project restore)
    const originalContent = await readFileContent(file, (progress) => {
      this.callbacks.onProgress(uploadedFile.id, progress);
    });

    // Use dataPipeline directly - DuckDB handles everything
    const { dataPipeline } = await import('$lib/features/data-pipeline');
    const { Duck } = await import('$lib/features/duckdb');

    const dataset = await dataPipeline.processFile(file);
    const { tableName, columns, rowCount } = dataset;
    const headers = columns.map((col) => col.name);

    // Convert DuckDB stats to the expected statistics format
    const statistics: Record<string, ColumnStatSummary> = {};
    for (const col of columns) {
      statistics[col.name] = {
        type: col.type,
        count: col.stats.count ?? rowCount,
        nullCount: col.stats.nulls ?? 0,
        unique: col.stats.uniques ?? 0,
        min: col.stats.min as number | undefined,
        max: col.stats.max as number | undefined,
        mean: col.stats.mean
      };
    }

    // Detect duplicates using SQL (much faster than JS for large datasets)
    // Note: COUNT(DISTINCT *) is not supported in DuckDB, use subquery instead
    const duplicateResult = (await Duck!.query(
      `SELECT (SELECT COUNT(*) FROM "${tableName}") - (SELECT COUNT(*) FROM (SELECT DISTINCT * FROM "${tableName}")) as duplicate_count`,
      { format: 'array' }
    )) as Array<{ duplicate_count: number }>;
    const duplicateCount = Number(duplicateResult[0]?.duplicate_count ?? 0);

    // Get sample data for deep analysis (limit to 100 rows for geo detection)
    const sampleData = (await Duck!.query(
      `SELECT * FROM "${tableName}" LIMIT 100`,
      { format: 'array' }
    )) as Array<Record<string, unknown>>;

    // Convert to tabular data format
    const tabularData = sampleData.map((row) => {
      const tabularRow: Record<string, JsonValue> = {};
      for (const [key, value] of Object.entries(row)) {
        if (value instanceof Date) {
          tabularRow[key] = value.toISOString();
        } else {
          tabularRow[key] = value as JsonValue;
        }
      }
      return tabularRow;
    });

    this.callbacks.onDataUpdate(uploadedFile.id, {
      parsedData: tabularData,
      content: originalContent,
      duplicates: {
        hasDuplicates: duplicateCount > 0,
        duplicateCount
      },
      statistics
    });

    if (duplicateCount > 0) {
      showWarning(
        WARNING_DUPLICATE_ROWS_TITLE(),
        `Found ${duplicateCount} duplicate rows`
      );
    }

    // Perform deep analysis for geo column detection
    const deepAnalysisCompleted = await this.performDeepAnalysis(
      uploadedFile,
      sampleData,
      headers
    );

    if (!deepAnalysisCompleted) {
      return;
    }

    this.callbacks.onStatusChange(uploadedFile.id, 'complete');
  }

  private async performDeepAnalysis(
    uploadedFile: UploadedFile,
    sampleData: Array<Record<string, unknown>>,
    headers: string[]
  ): Promise<boolean> {
    // Convert sample data to matrix format for DeepDataValidator
    const dataMatrix: CsvMatrix = sampleData.map((row) =>
      headers.map((header) => {
        const value = row[header];
        if (value === null || value === undefined) return null;
        if (value instanceof Date) return value;
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          return value;
        }
        return String(value);
      })
    );

    const deepAnalysis = await DeepDataValidator.analyzeDataContent(
      headers,
      dataMatrix,
      { sampleSize: Math.min(100, dataMatrix.length) }
    );

    if (!deepAnalysis.geoDetection.hasGeoColumns) {
      // Show warning instead of blocking - user can still manually join to a basemap
      showWarning(
        WARNING_NO_GEO_COLUMN_TITLE(),
        WARNING_NO_GEO_COLUMN_MESSAGE()
      );
      // Continue processing - don't block the import
    }

    if (deepAnalysis.performanceWarnings.length > 0) {
      deepAnalysis.performanceWarnings.forEach((warning) =>
        showWarning(WARNING_PERFORMANCE_TITLE(), warning)
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

    // Read original file content for persistence
    const content = await readFileContent(file, (progress) => {
      this.callbacks.onProgress(uploadedFile.id, progress);
    });

    // Delegate to dataPipeline for proper GeoPackage processing
    const { dataPipeline } = await import('$lib/features/data-pipeline');
    const { Duck } = await import('$lib/features/duckdb');

    const dataset = await dataPipeline.processFile(file);
    const { tableName } = dataset;

    // Get sample data for preview (similar to CsvProcessor)
    const sampleData = (await Duck!.query(
      `SELECT * FROM "${tableName}" LIMIT 100`,
      { format: 'array' }
    )) as Array<Record<string, unknown>>;

    // Convert to tabular data format
    const tabularData = sampleData.map((row) => {
      const tabularRow: Record<string, JsonValue> = {};
      for (const [key, value] of Object.entries(row)) {
        if (value instanceof Date) {
          tabularRow[key] = value.toISOString();
        } else {
          tabularRow[key] = value as JsonValue;
        }
      }
      return tabularRow;
    });

    this.callbacks.onDataUpdate(uploadedFile.id, {
      content,
      parsedData: tabularData
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
