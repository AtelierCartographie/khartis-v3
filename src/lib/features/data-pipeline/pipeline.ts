import { initDuckDB } from '$lib/features/duckdb';
import * as m from '$lib/paraglide/messages';
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
  UploadedFilePayload,
  ValidationResult,
  ZipDatasetResult
} from './types';
import { isZipFile } from './utils/zip-handler';
import { MIME } from '$lib/features/commons/constants';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';

export { createFileFromUpload };

let initialized = false;

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
    await initDuckDB();
    initialized = true;
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
      return processZipFile(file);
    }
    return processFileInternal(file);
  },

  async processUploadedFile(
    uploadedFile: UploadedFilePayload,
    originalFile?: File
  ): Promise<DatasetResult | ZipDatasetResult> {
    await this.initialize();
    let result: DatasetResult | ZipDatasetResult;

    if (originalFile && isZipFile(originalFile)) {
      result = await processZipFile(originalFile);
    } else if (originalFile) {
      const companionFiles = uploadedFile.relatedFileObjects?.filter(
        (f: File) => f.name.toLowerCase() !== originalFile.name.toLowerCase()
      );
      result = await processFileInternal(originalFile, {
        companionFiles
      });
    } else {
      const fallback = await createFileFromUpload(uploadedFile);
      if (isZipFile(fallback)) {
        result = await processZipFile(fallback);
      } else {
        const companionFiles =
          await createCompanionFilesFromUpload(uploadedFile);
        result = await processFileInternal(fallback, {
          companionFiles
        });
      }
    }

    if ('datasets' in result) {
      for (const dataset of result.datasets) {
        dataset.sourceFileId = uploadedFile.id;
        applyGeoDetection(dataset, uploadedFile.deepAnalysis?.geoDetection);
      }
    } else {
      result.id = uploadedFile.datasetId ?? uploadedFile.id;
      result.sourceFileId = uploadedFile.id;
      result.name = uploadedFile.name;
      applyGeoDetection(result, uploadedFile.deepAnalysis?.geoDetection);
    }

    return result;
  },

  async processRemoteFile(
    url: string,
    options: { tableName?: string; decimalSeparator?: string } = {}
  ): Promise<DatasetResult | ZipDatasetResult> {
    await this.initialize();
    return processRemoteFile(url, options);
  },

  async processRemoteZipFile(
    url: string
  ): Promise<DatasetResult | ZipDatasetResult> {
    await this.initialize();
    return processRemoteZipFile(url);
  },

  async processPastedData(
    content: string,
    options: { name?: string; type?: string } = {}
  ): Promise<DatasetResult> {
    const name =
      options.name ?? `${m.pipeline_pasted_data_filename()}-${Date.now()}.csv`;
    const file = await createFileFromUploadContent(
      content,
      name,
      options.type ?? MIME.CSV
    );
    return this.processFile(file) as Promise<DatasetResult>;
  },

  async validateFile(file: File): Promise<ValidationResult> {
    return validateFile(file);
  },

  async processZipFile(file: File): Promise<DatasetResult | ZipDatasetResult> {
    await this.initialize();
    return processZipFile(file);
  },

  async destroy(): Promise<void> {
    initialized = false;
  }
};

export const dataPipeline = Pipeline;
