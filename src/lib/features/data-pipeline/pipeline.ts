import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck, initDuckDB } from '$lib/features/duckdb';
import type { FeatureCollection } from 'geojson';
import { isGeospatialFile } from './constants';
import { validateFile } from './core/validators';
import { buildDatasetFromDuckTable } from './operations/analysis';
import type {
  DatasetResult,
  FileFormat,
  FileInfo,
  PipelineContext,
  RawDataset,
  UploadedFilePayload,
  ValidationResult
} from './types';
import { convertGeoJSONToRawDataset } from './utils/geojson-converter';
import {
  describeGeojsonStructure,
  normalizeGeojsonInput,
  type GeoJSONLike
} from './utils/geojson-guards';

// Module-level state
let initialized = false;

function getContext(): PipelineContext {
  if (!initialized) throw new Error('Pipeline not initialized');
  return { duck: Duck };
}

function generateTableName(filename: string): string {
  const base = filename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
  const prefix = base.length > 0 ? base : 'table';
  const suffix = Date.now().toString(36);
  return `${prefix}_${suffix}`;
}

function detectFileFormat(name: string): FileFormat {
  const lower = name.toLowerCase();
  if (
    lower.endsWith('.csv') ||
    lower.endsWith('.tsv') ||
    lower.endsWith('.txt')
  )
    return 'csv';
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) return 'geojson';
  if (lower.endsWith('.shp')) return 'shapefile';
  if (lower.endsWith('.gpkg')) return 'geopackage';
  if (lower.endsWith('.kml')) return 'kml';
  if (lower.endsWith('.kmz')) return 'kmz';
  if (lower.endsWith('.geoparquet') || lower.endsWith('.parquet'))
    return 'geoparquet';
  return 'unknown';
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
    throw new Error('Uploaded file has no content');
  }
  return createFileFromUploadContent(
    uploadedFile.content,
    uploadedFile.name,
    uploadedFile.type
  );
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
      } else {
        await Duck.read_tabular(file, { tablename: tableName });
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

      if (uploadedFile.parsedData && uploadedFile.fileType === 'shapefile') {
        dataset = await processShapefile(ctx, uploadedFile);
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
        dataset = await processFileInternal(ctx, fallback);
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

  if (isShapefile && options.companionFiles?.length) {
    const allShapefileFiles = [file, ...options.companionFiles];
    await Duck.register_files(allShapefileFiles, { shapefile: true });
  } else if (!isShapefile) {
    await Duck.register_files([file]);
  }

  if (isGeoFile) {
    await Duck.read_geofile(file, {
      tablename: tableName,
      shapefile: isShapefile
    });
  } else {
    await Duck.read_tabular(file, { tablename: tableName });
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

async function processShapefile(
  ctx: PipelineContext,
  uploadedFile: UploadedFilePayload
): Promise<DatasetResult> {
  const start = performance.now();
  logger.info('Processing shapefile upload', LogCategory.DATA, {
    fileId: uploadedFile.id,
    fileName: uploadedFile.name
  });

  const parsedGeojson =
    typeof uploadedFile.parsedData === 'string'
      ? JSON.parse(uploadedFile.parsedData)
      : uploadedFile.parsedData;

  const structureInfo = describeGeojsonStructure(parsedGeojson);
  const normalizedGeojson = normalizeGeojsonInput(parsedGeojson as GeoJSONLike);
  const rawDataset = convertGeoJSONToRawDataset(
    normalizedGeojson as FeatureCollection
  );

  const geojsonString = JSON.stringify(normalizedGeojson);
  const geojsonFileName = uploadedFile.name.replace(/\.shp$/i, '.geojson');
  uploadedFile.preparedGeoJSON = geojsonString;

  const geojsonFile = new File([geojsonString], geojsonFileName, {
    type: 'application/geo+json'
  });

  const dataset = await processFileInternal(ctx, geojsonFile, {
    originalName: uploadedFile.name,
    rawDataset
  });

  dataset.sourceFileId = uploadedFile.id;
  dataset.name = uploadedFile.name;

  logger.success('Shapefile converted to dataset', LogCategory.DATA, {
    fileId: uploadedFile.id,
    featureKeys: structureInfo.keys,
    durationMs: (performance.now() - start).toFixed(2)
  });

  return dataset;
}

// Export singleton for compatibility
export const dataPipeline = Pipeline;
export type DataPipeline = typeof Pipeline;
