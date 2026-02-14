import { MIME } from '$lib/features/commons/constants';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { PIPELINE_CONST } from '../../constants';
import type {
  FileProcessor,
  ProcessContext,
  ProcessorDataset
} from '../file-processor.interface';
import { getFileForDuckDB } from './processor-utils';

export const shapefileProcessor: FileProcessor = {
  supportedFileTypes: [FileType.SHAPEFILE],

  canHandle(file: UploadedFile): boolean {
    return (
      file.fileType === FileType.SHAPEFILE ||
      file.name.toLowerCase().endsWith('.shp')
    );
  },

  async process(
    ctx: ProcessContext,
    file: UploadedFile
  ): Promise<ProcessorDataset> {
    const start = performance.now();
    logger.debug('Processing Shapefile', LogCategory.DUCKDB, {
      fileId: file.id,
      tableName: ctx.tableName
    });

    const shpFile = getFileForDuckDB(file, MIME.SHAPEFILE);

    const companionFiles =
      file.relatedFileObjects?.filter(
        (f) => f.name.toLowerCase() !== shpFile.name.toLowerCase()
      ) ?? [];

    logger.debug('Shapefile registration details', LogCategory.DUCKDB, {
      shpFileName: shpFile.name,
      shpFileSize: shpFile.size,
      relatedFiles: companionFiles.map((f) => ({
        name: f.name,
        size: f.size
      }))
    });

    const shapefileComponents = [shpFile, ...companionFiles];

    await ctx.Duck.register_files(shapefileComponents, { shapefile: true });

    if (companionFiles.length === 0) {
      logger.warn(
        'No companion files found for Shapefile - ingestion may fail',
        LogCategory.DUCKDB
      );
    } else {
      logger.debug(
        `Registered ${companionFiles.length} companion files for Shapefile`,
        LogCategory.DUCKDB
      );
    }

    const resultTableName = await ctx.Duck.read_geofile(shpFile, {
      tablename: ctx.tableName,
      shapefile: true
    });

    const actualTableName =
      typeof resultTableName === 'string' ? resultTableName : ctx.tableName;

    const [columns, rowCount] = await Promise.all([
      ctx.Duck.analyse(actualTableName),
      ctx.callbacks.getRowCount(actualTableName)
    ]);

    const dataset: ProcessorDataset = {
      id: crypto.randomUUID(),
      tableName: actualTableName,
      sourceFileId: file.id,
      name: file.name,
      columns,
      rowCount,
      metadata: {
        processedAt: new Date(),
        fileType: file.fileType
      },
      geoDetection: file.deepAnalysis?.geoDetection
    };

    logger.success('Shapefile processed', LogCategory.DUCKDB, {
      datasetId: dataset.id,
      tableName: dataset.tableName,
      rowCount: dataset.rowCount,
      durationMs: (performance.now() - start).toFixed(2)
    });

    return dataset;
  }
};
