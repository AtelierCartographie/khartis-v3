import { MIME } from '$lib/features/commons/constants';
import { DataValidationError } from '$lib/features/commons/errors/pipeline.errors';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import { validateFile } from './core/validators';
import {
  createCompanionFilesFromUpload,
  createFileFromUpload,
  createFileFromUploadContent,
  processFileInternal,
  processRemoteFile,
  processRemoteZipFile,
  processZipFile
} from './processors';
import type {
  DatasetResult,
  PipelineContext,
  UploadedFilePayload,
  ValidationResult,
  ZipDatasetResult
} from './types';
import { isZipFile } from './utils/zip-handler';

export { createFileFromUpload };

let initialized = false;

function getContext(): PipelineContext {
  if (!initialized) throw new Error('Pipeline not initialized');
  return { initialized };
}

function applyGeoDetection(
  dataset: DatasetResult,
  geoDetection?: GeoDetectionResult
): void {
  if (!geoDetection) return;
  dataset.geoDetection = geoDetection;
  dataset.analysis = {
    columns: dataset.analysis?.columns ?? dataset.columns,
    hasGeoData:
      geoDetection.hasGeoColumns ?? dataset.analysis?.hasGeoData ?? false,
    geoColumns: geoDetection.geoColumns,
    rowCount: dataset.rowCount,
    warnings: [...(dataset.analysis?.warnings ?? []), ...geoDetection.warnings]
  };
}

const Pipeline = {
  get initialized() {
    return initialized;
  },

  async initialize(): Promise<void> {
    if (initialized) return;
    const start = performance.now();
    try {
      await initDuckDB();
      initialized = true;
      logger.success('Data pipeline ready', LogCategory.DATA, {
        durationMs: (performance.now() - start).toFixed(2)
      });
    } catch (error) {
      logger.error('Data pipeline initialization failed', LogCategory.DATA, {
        error
      });
      throw error;
    }
  },

  async processFile(file: File): Promise<DatasetResult | ZipDatasetResult> {
    await this.initialize();
    const validation = await validateFile(file);
    if (!validation.isValid) {
      throw new DataValidationError(validation.errors[0], undefined, {
        errors: validation.errors
      });
    }
    if (isZipFile(file)) {
      return processZipFile(getContext(), file);
    }
    return processFileInternal(getContext(), file);
  },

  async processUploadedFile(
    uploadedFile: UploadedFilePayload,
    originalFile?: File
  ): Promise<DatasetResult | ZipDatasetResult> {
    await this.initialize();
    const ctx = getContext();
    const start = performance.now();
    try {
      let result: DatasetResult | ZipDatasetResult;

      if (originalFile && isZipFile(originalFile)) {
        result = await processZipFile(ctx, originalFile);
      } else if (originalFile) {
        const companionFiles = uploadedFile.relatedFileObjects?.filter(
          (f: File) => f.name.toLowerCase() !== originalFile.name.toLowerCase()
        );
        result = await processFileInternal(ctx, originalFile, {
          companionFiles
        });
      } else {
        const fallback = await createFileFromUpload(uploadedFile);
        if (isZipFile(fallback)) {
          result = await processZipFile(ctx, fallback);
        } else {
          result = await processFileInternal(ctx, fallback, {
            companionFiles: createCompanionFilesFromUpload(uploadedFile)
          });
        }
      }

      if ('datasets' in result) {
        for (const dataset of result.datasets) {
          dataset.sourceFileId = uploadedFile.id;
          applyGeoDetection(dataset, uploadedFile.deepAnalysis?.geoDetection);
        }
      } else {
        result.sourceFileId = uploadedFile.id;
        result.name = uploadedFile.name;
        applyGeoDetection(result, uploadedFile.deepAnalysis?.geoDetection);
      }

      logger.success('Uploaded file processed', LogCategory.DATA, {
        durationMs: (performance.now() - start).toFixed(2)
      });
      return result;
    } catch (error) {
      logger.error('Failed to process uploaded file', LogCategory.DATA, {
        fileId: uploadedFile.id,
        error
      });
      throw error;
    }
  },

  async processRemoteFile(
    url: string,
    options: { tableName?: string; decimalSeparator?: string } = {}
  ): Promise<DatasetResult | ZipDatasetResult> {
    await this.initialize();
    return processRemoteFile(getContext(), url, options);
  },

  async processRemoteZipFile(
    url: string
  ): Promise<DatasetResult | ZipDatasetResult> {
    await this.initialize();
    return processRemoteZipFile(getContext(), url);
  },

  async processPastedData(
    content: string,
    options: { name?: string; type?: string } = {}
  ): Promise<DatasetResult> {
    const name = options.name ?? `pasted-data-${Date.now()}.csv`;
    const file = await createFileFromUploadContent(
      content,
      name,
      options.type ?? MIME.CSV
    );
    return this.processFile(file) as Promise<DatasetResult>;
  },

  async joinDatasetById(
    tableName: string,
    idColumn: string,
    options: {
      basemapsTable?: string;
      basemapTable?: string;
      basemapId?: string;
      basemapOthersId?: string;
    }
  ): Promise<unknown> {
    await this.initialize();
    return Duck.join_by_id(tableName, idColumn, {
      basemaps_table: options.basemapsTable,
      basemap_table: options.basemapTable,
      basemap_id: options.basemapId,
      basemap_others_id: options.basemapOthersId
    });
  },

  async applyJoinAssociation(
    tableName: string,
    basemap: string
  ): Promise<void> {
    await this.initialize();
    await Duck.apply_join_association(tableName, basemap);
  },

  async validateFile(file: File): Promise<ValidationResult> {
    return validateFile(file);
  },

  async processZipFile(file: File): Promise<DatasetResult | ZipDatasetResult> {
    await this.initialize();
    return processZipFile(getContext(), file);
  },

  async destroy(): Promise<void> {
    initialized = false;
  }
};

export const dataPipeline = Pipeline;
