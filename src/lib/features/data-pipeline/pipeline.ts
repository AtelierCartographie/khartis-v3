import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import * as m from '$lib/paraglide/messages';
import { isGeospatialFile, isParquetFile } from './constants';
import { validateFile } from './core/validators';
import { detectFileFormat, generateTableName } from './core/parsers';
import { buildDatasetFromDuckTable } from './operations/analysis';
import type {
  DatasetResult,
  FileInfo,
  PipelineContext,
  RawDataset,
  UploadedFilePayload,
  ValidationResult
} from './types';
import { detectDecimalSeparator } from './utils/decimal-detector';
import {
  createFileFromExtracted,
  extractZip,
  getShapefileFilesFromArchive,
  getSupportedFilesFromArchive,
  isZipFile
} from './utils/zip-handler';

let initialized = false;

function getContext(): PipelineContext {
  if (!initialized) throw new Error('Pipeline not initialized');
  return { duck: Duck };
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

async function createFileFromUploadContent(
  content: string | ArrayBuffer,
  name: string,
  type: string
): Promise<File> {
  const resolvedType = type || 'application/octet-stream';
  if (typeof content === 'string') {
    return new File([content], name, { type: resolvedType });
  }
  const blob = new Blob([content], { type: resolvedType });
  return new File([blob], name, { type: resolvedType });
}

export async function createFileFromUpload(
  uploadedFile: UploadedFilePayload
): Promise<File> {
  if (!uploadedFile.content) {
    logger.error('Uploaded file is missing inline content', LogCategory.DATA, {
      fileId: uploadedFile.id,
      fileName: uploadedFile.name
    });
    throw new Error(m.pipeline_error_no_content());
  }
  return createFileFromUploadContent(
    uploadedFile.content,
    uploadedFile.name,
    uploadedFile.type
  );
}

function createCompanionFilesFromUpload(
  uploadedFile: UploadedFilePayload
): File[] | undefined {
  if (!uploadedFile.relatedFilesData) {
    return undefined;
  }

  const mainFileName = uploadedFile.name.toLowerCase();
  const companionFiles: File[] = [];

  for (const [fileName, data] of Object.entries(
    uploadedFile.relatedFilesData
  )) {
    if (fileName.toLowerCase() === mainFileName) continue;

    const buffer =
      data instanceof ArrayBuffer
        ? data
        : new Uint8Array(data as number[]).buffer;
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    companionFiles.push(new File([blob], fileName));
  }

  return companionFiles.length > 0 ? companionFiles : undefined;
}

export const Pipeline = {
  get initialized() {
    return initialized;
  },

  async initialize(): Promise<void> {
    if (initialized) return;

    const start = performance.now();
    logger.info('Initializing data pipeline DuckDB session', LogCategory.DATA);

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

  async processFile(file: File): Promise<DatasetResult> {
    await this.initialize();
    const ctx = getContext();
    const start = performance.now();

    logger.info('Processing file via data pipeline', LogCategory.DATA, {
      fileName: file.name,
      fileType: file.type
    });

    try {
      if (isZipFile(file)) {
        return this.processZipFile(file);
      }

      const fileInfo: FileInfo = {
        name: file.name,
        size: file.size,
        type: file.type
      };
      const tableName = generateTableName(file.name);
      const isGeoFile = isGeospatialFile(file.name);
      const format = detectFileFormat(file.name);

      await Duck.register_files([file]);

      if (isGeoFile) {
        await Duck.read_geofile(file, { tablename: tableName });
      } else if (isParquetFile(file.name)) {
        await Duck.read_tabular(file, {
          tablename: tableName,
          format: 'parquet'
        });
      } else if (file.name.toLowerCase().endsWith('.arrow')) {
        await Duck.read_tabular(file, {
          tablename: tableName,
          format: 'parquet'
        });
      } else {
        const detection = await detectDecimalSeparator(file);
        if (detection.separator === ',') {
          logger.info('European decimal format detected', LogCategory.DATA, {
            confidence: detection.confidence,
            sampleSize: detection.sampleSize
          });
        }
        await Duck.read_tabular(file, {
          tablename: tableName,
          decimal_separator: detection.separator
        });
      }

      const dataset = await buildDatasetFromDuckTable(ctx, {
        file: fileInfo,
        tableName,
        isGeoFile,
        format
      });

      logger.success('File processed via data pipeline', LogCategory.DATA, {
        datasetId: dataset.id,
        tableName: dataset.tableName,
        durationMs: (performance.now() - start).toFixed(2)
      });

      return dataset;
    } catch (error) {
      logger.error(
        'Failed to process file via data pipeline',
        LogCategory.DATA,
        {
          fileName: file.name,
          error
        }
      );
      throw error;
    }
  },

  async processUploadedFile(
    uploadedFile: UploadedFilePayload,
    originalFile?: File
  ): Promise<DatasetResult> {
    await this.initialize();
    const ctx = getContext();
    const start = performance.now();

    logger.info(
      'Processing uploaded file via data pipeline',
      LogCategory.DATA,
      {
        uploadedFileId: uploadedFile.id,
        fileName: uploadedFile.name,
        fileType: uploadedFile.fileType,
        hasOriginal: Boolean(originalFile)
      }
    );

    try {
      let dataset: DatasetResult;

      if (originalFile && isZipFile(originalFile)) {
        dataset = await this.processZipFile(originalFile);
      } else if (originalFile) {
        const originalName = originalFile.name.toLowerCase();
        const companionFiles = uploadedFile.relatedFileObjects?.filter(
          (f: File) => f.name.toLowerCase() !== originalName
        );
        dataset = await processFileInternal(ctx, originalFile, {
          companionFiles
        });
      } else {
        const fallback = await createFileFromUpload(uploadedFile);
        if (isZipFile(fallback)) {
          dataset = await this.processZipFile(fallback);
        } else {
          const companionFiles = createCompanionFilesFromUpload(uploadedFile);
          dataset = await processFileInternal(ctx, fallback, {
            companionFiles
          });
        }
      }

      dataset.sourceFileId = uploadedFile.id;
      applyGeoDetection(dataset, uploadedFile.deepAnalysis?.geoDetection);
      dataset.name = uploadedFile.name;

      logger.success('Uploaded file processed', LogCategory.DATA, {
        datasetId: dataset.id,
        fileName: dataset.name,
        durationMs: (performance.now() - start).toFixed(2)
      });

      return dataset;
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
  ): Promise<DatasetResult> {
    await this.initialize();
    const ctx = getContext();

    const { tableName: providedTableName, decimalSeparator } = options;
    const filename = url.split('/').pop() || 'remote_file';

    if (filename.toLowerCase().endsWith('.zip')) {
      return this.processRemoteZipFile(url);
    }

    const format = detectFileFormat(filename);
    const isGeoFile = isGeospatialFile(filename);
    const tableName = providedTableName ?? generateTableName(filename);

    await Duck.read_link(url, {
      tablename: tableName,
      decimal_separator: decimalSeparator
    });

    const dataset = await buildDatasetFromDuckTable(ctx, {
      file: { name: filename, size: 0, type: 'application/octet-stream' },
      tableName,
      isGeoFile,
      format
    });

    dataset.sourceFileId = url;
    dataset.name = filename;
    return dataset;
  },

  async processRemoteZipFile(url: string): Promise<DatasetResult> {
    await this.initialize();
    const start = performance.now();

    logger.info(
      'Downloading and processing remote ZIP archive',
      LogCategory.DATA,
      {
        url
      }
    );

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          m.pipeline_error_fetch_failed({
            status: String(response.status),
            statusText: response.statusText
          })
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const filename = url.split('/').pop() || 'remote.zip';
      const file = new File([arrayBuffer], filename, {
        type: 'application/zip'
      });

      const dataset = await this.processZipFile(file);
      dataset.sourceFileId = url;

      logger.success('Remote ZIP archive processed', LogCategory.DATA, {
        url,
        datasetId: dataset.id,
        durationMs: (performance.now() - start).toFixed(2)
      });

      return dataset;
    } catch (error) {
      logger.error('Failed to process remote ZIP archive', LogCategory.DATA, {
        url,
        error
      });
      throw error;
    }
  },

  async processPastedData(
    content: string,
    options: { name?: string; type?: string } = {}
  ): Promise<DatasetResult> {
    const name = options.name ?? 'pasted-data.csv';
    const type = options.type ?? 'text/csv';
    const file = await createFileFromUploadContent(content, name, type);
    return this.processFile(file);
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

  async applyFilters(tableName: string, filters: string[]): Promise<unknown> {
    await this.initialize();
    const metadata =
      Duck.table_metadata.get(tableName) ??
      (() => {
        const fresh = { analysis: null, join: null, filters: new Map() };
        Duck.table_metadata.set(tableName, fresh as never);
        return fresh;
      })();
    metadata.filters.clear();
    filters.forEach((filter, index) =>
      Duck.add_filter(tableName, index, filter)
    );
    return Duck.apply_filters(tableName);
  },

  async validateFile(file: File): Promise<ValidationResult> {
    return validateFile(file);
  },

  async processZipFile(file: File): Promise<DatasetResult> {
    await this.initialize();
    const ctx = getContext();
    const start = performance.now();

    logger.info('Processing ZIP archive', LogCategory.DATA, {
      fileName: file.name,
      fileSize: file.size
    });

    try {
      const extraction = await extractZip(file);

      if (extraction.isShapefileArchive && extraction.shapefileBaseName) {
        logger.info('ZIP contains shapefile archive', LogCategory.DATA, {
          baseName: extraction.shapefileBaseName,
          fileCount: extraction.files.length
        });

        const shapefileFiles = getShapefileFilesFromArchive(
          extraction.files,
          extraction.shapefileBaseName
        );

        const shpExtracted = shapefileFiles.find((f) =>
          f.name.toLowerCase().endsWith('.shp')
        );
        if (!shpExtracted) {
          throw new Error(m.pipeline_error_shp_not_found());
        }

        const shpFile = createFileFromExtracted(shpExtracted);
        const companionFiles = shapefileFiles
          .filter((f) => !f.name.toLowerCase().endsWith('.shp'))
          .map((f) => createFileFromExtracted(f));

        const dataset = await processFileInternal(ctx, shpFile, {
          originalName: `${extraction.shapefileBaseName}.shp`,
          companionFiles
        });

        dataset.sourceFileId = file.name;
        dataset.name = extraction.shapefileBaseName;

        logger.success('Shapefile from ZIP processed', LogCategory.DATA, {
          datasetId: dataset.id,
          baseName: extraction.shapefileBaseName,
          durationMs: (performance.now() - start).toFixed(2)
        });

        return dataset;
      }

      const supportedFiles = getSupportedFilesFromArchive(extraction.files);

      if (supportedFiles.length === 0) {
        throw new Error(m.pipeline_error_no_supported_files());
      }

      if (supportedFiles.length > 1) {
        logger.warn(
          'ZIP contains multiple files, processing first supported file',
          LogCategory.DATA,
          {
            fileCount: supportedFiles.length,
            files: supportedFiles.map((f) => f.name)
          }
        );
      }

      const firstFile = supportedFiles[0];
      const extractedFile = createFileFromExtracted(firstFile);

      const dataset = await processFileInternal(ctx, extractedFile, {
        originalName: firstFile.name
      });

      dataset.sourceFileId = file.name;
      dataset.name = firstFile.name;

      logger.success('File from ZIP processed', LogCategory.DATA, {
        datasetId: dataset.id,
        extractedFile: firstFile.name,
        durationMs: (performance.now() - start).toFixed(2)
      });

      return dataset;
    } catch (error) {
      logger.error('Failed to process ZIP archive', LogCategory.DATA, {
        fileName: file.name,
        error
      });
      throw error;
    }
  },

  async destroy(): Promise<void> {
    initialized = false;
    logger.info('Data pipeline destroyed', LogCategory.DATA);
  }
};

async function processFileInternal(
  ctx: PipelineContext,
  file: File,
  options: {
    originalName?: string;
    rawDataset?: RawDataset;
    companionFiles?: File[];
  } = {}
): Promise<DatasetResult> {
  const fileInfo: FileInfo = {
    name: options.originalName ?? file.name,
    size: file.size,
    type: file.type
  };

  const tableName = generateTableName(fileInfo.name);
  const isGeoFile = isGeospatialFile(fileInfo.name);
  const isShapefile = fileInfo.name.toLowerCase().endsWith('.shp');
  const format = detectFileFormat(fileInfo.name);

  const start = performance.now();
  logger.debug('Reading file into DuckDB via pipeline', LogCategory.DATA, {
    fileName: fileInfo.name,
    tableName,
    isGeoFile,
    isShapefile,
    hasCompanionFiles: Boolean(options.companionFiles?.length)
  });

  if (isShapefile) {
    const allShapefileFiles = options.companionFiles?.length
      ? [file, ...options.companionFiles]
      : [file];
    await Duck.register_files(allShapefileFiles, { shapefile: true });
  } else {
    await Duck.register_files([file]);
  }

  if (isGeoFile) {
    await Duck.read_geofile(file, {
      tablename: tableName,
      shapefile: isShapefile
    });
  } else {
    const isParquet = fileInfo.name.toLowerCase().endsWith('.parquet');
    const isArrow = fileInfo.name.toLowerCase().endsWith('.arrow');

    if (isParquet || isArrow) {
      await Duck.read_tabular(file, {
        tablename: tableName,
        format: 'parquet'
      });
    } else {
      const detection = await detectDecimalSeparator(file);
      if (detection.separator === ',') {
        logger.info('European decimal format detected', LogCategory.DATA, {
          confidence: detection.confidence,
          sampleSize: detection.sampleSize
        });
      }
      await Duck.read_tabular(file, {
        tablename: tableName,
        decimal_separator: detection.separator
      });
    }
  }

  const dataset = await buildDatasetFromDuckTable(ctx, {
    file: fileInfo,
    tableName,
    isGeoFile,
    format
  });

  if (options.rawDataset) {
    dataset.originalData = {
      columns: dataset.columns,
      data: options.rawDataset.rows.map((row) => {
        const record: Record<string, unknown> = {};
        options.rawDataset?.headers?.forEach((header, index) => {
          record[header] = row[index];
        });
        return record;
      }),
      rowCount: options.rawDataset.rows.length
    };
  }

  logger.success('DuckDB dataset built', LogCategory.DATA, {
    tableName,
    rowCount: dataset.rowCount,
    durationMs: (performance.now() - start).toFixed(2)
  });

  return dataset;
}

export const dataPipeline = Pipeline;
export type DataPipeline = typeof Pipeline;
