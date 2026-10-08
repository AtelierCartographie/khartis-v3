import { initDuckDB } from '$lib/features/duckdb';
import * as m from '$lib/paraglide/messages';
import { validateFile } from './core/validators';
import {
  createCompanionFilesFromUpload,
  createFileFromUpload,
  createFileFromUploadContent,
  processFileInternal,
  processGeoPackageLayers,
  processRemoteFile,
  processRemoteZipFile,
  processZipFile
} from './processors';
import type {
  DatasetResult,
  UploadedFilePayload,
  ZipDatasetResult
} from './types';
import { isZipFile } from './utils/zip-handler';
import { MIME } from '$lib/features/commons/constants';
import { DataValidationError } from '$lib/features/commons/pipeline.errors';
import type { ValidationResult } from '$lib/features/commons/types/validation.types';

export { createFileFromUpload };

let initialized = false;

const Pipeline = {
  get initialized() {
    return initialized;
  },

  async initialize(): Promise<void> {
    if (initialized) return;
    await initDuckDB();
    initialized = true;
  },

  async processFile(
    file: File,
    options: { sourceFileId?: string } = {}
  ): Promise<DatasetResult | ZipDatasetResult> {
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
    return processFileInternal(file, { sourceFileId: options.sourceFileId });
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
        companionFiles,
        sourceFileId: uploadedFile.id
      });
    } else {
      const fallback = await createFileFromUpload(uploadedFile);
      if (isZipFile(fallback)) {
        result = await processZipFile(fallback);
      } else {
        const companionFiles =
          await createCompanionFilesFromUpload(uploadedFile);
        result = await processFileInternal(fallback, {
          companionFiles,
          sourceFileId: uploadedFile.id
        });
      }
    }

    if ('datasets' in result) {
      for (const dataset of result.datasets) {
        dataset.sourceFileId = uploadedFile.id;
      }
    } else {
      result.id = uploadedFile.datasetId ?? uploadedFile.id;
      result.sourceFileId = uploadedFile.id;
      result.name = uploadedFile.name;
    }

    return result;
  },

  /**
   * Import path of the welcome modal: a GeoPackage with several spatial layers
   * comes back as one dataset per layer. Restores keep processUploadedFile,
   * which reads one layer, since a layer imported this way is persisted as its
   * own snapshot.
   */
  async processGeoPackageFile(
    uploadedFile: UploadedFilePayload,
    originalFile: File
  ): Promise<DatasetResult | ZipDatasetResult> {
    await this.initialize();
    const layered = await processGeoPackageLayers(originalFile, {
      sourceFileId: uploadedFile.id
    });
    return layered ?? this.processUploadedFile(uploadedFile, originalFile);
  },

  async processRemoteFile(
    url: string
  ): Promise<DatasetResult | ZipDatasetResult> {
    await this.initialize();
    return processRemoteFile(url);
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
  }
};

export const dataPipeline = Pipeline;
