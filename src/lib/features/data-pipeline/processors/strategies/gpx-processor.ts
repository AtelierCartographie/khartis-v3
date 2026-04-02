import { MIME } from '$lib/features/commons/constants';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import type {
  FileProcessor,
  ProcessContext,
  ProcessorDataset
} from '../file-processor.interface';
import { getFileForDuckDB } from './processor-utils';

export const gpxProcessor: FileProcessor = {
  supportedFileTypes: [FileType.GPX],

  canHandle(file: UploadedFile): boolean {
    return (
      file.fileType === FileType.GPX || file.name.toLowerCase().endsWith('.gpx')
    );
  },

  async process(
    ctx: ProcessContext,
    file: UploadedFile
  ): Promise<ProcessorDataset> {
    const start = performance.now();
    logger.debug('Processing GPX file', LogCategory.DUCKDB, {
      fileId: file.id,
      tableName: ctx.tableName
    });

    const gpxFile = getFileForDuckDB(file, MIME.GPX);

    await ctx.Duck.register_files([gpxFile]);

    const resultTableName = await ctx.Duck.read_geofile(gpxFile, {
      tablename: ctx.tableName
    });
    const actualTableName =
      typeof resultTableName === 'string' ? resultTableName : ctx.tableName;

    const [columns, rowCount, { arrowTableWithMetadata, geoArrowMetadata }] =
      await Promise.all([
        ctx.Duck.analyse(actualTableName),
        ctx.callbacks.getRowCount(actualTableName),
        ctx.callbacks.createArrowTableWithMetadata(actualTableName)
      ]);

    const dataset: ProcessorDataset = {
      id: file.datasetId ?? file.id,
      tableName: actualTableName,
      sourceFileId: file.id,
      name: file.name,
      columns,
      rowCount,
      metadata: {
        processedAt: new Date(),
        fileType: file.fileType
      },
      geoDetection: file.deepAnalysis?.geoDetection,
      arrowTableWithMetadata,
      geoArrowMetadata: geoArrowMetadata ?? undefined
    };

    logger.success('GPX processed', LogCategory.DUCKDB, {
      datasetId: dataset.id,
      tableName: dataset.tableName,
      rowCount: dataset.rowCount,
      durationMs: (performance.now() - start).toFixed(2)
    });

    return dataset;
  }
};
