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

export const geopackageProcessor: FileProcessor = {
  supportedFileTypes: [FileType.GEOPACKAGE],

  canHandle(file: UploadedFile): boolean {
    return (
      file.fileType === FileType.GEOPACKAGE ||
      file.name.toLowerCase().endsWith('.gpkg')
    );
  },

  async process(
    ctx: ProcessContext,
    file: UploadedFile
  ): Promise<ProcessorDataset> {
    const start = performance.now();
    logger.debug('Processing GeoPackage file', LogCategory.DUCKDB, {
      fileId: file.id,
      tableName: ctx.tableName
    });

    const gpkgFile = getFileForDuckDB(file, 'application/geopackage+sqlite3');

    await ctx.Duck.register_files([gpkgFile]);

    const resultTableName = await ctx.Duck.read_geofile(gpkgFile, {
      tablename: ctx.tableName
    });
    const actualTableName =
      typeof resultTableName === 'string' ? resultTableName : ctx.tableName;

    const columns = await ctx.Duck.analyse(actualTableName);
    const rowCount = await ctx.callbacks.getRowCount(actualTableName);
    const { arrowTableWithMetadata, geoArrowMetadata } =
      await ctx.callbacks.createArrowTableWithMetadata(actualTableName);

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
      geoDetection: file.deepAnalysis?.geoDetection,
      arrowTableWithMetadata,
      geoArrowMetadata: geoArrowMetadata ?? undefined
    };

    logger.success('GeoPackage processed', LogCategory.DUCKDB, {
      datasetId: dataset.id,
      tableName: dataset.tableName,
      rowCount: dataset.rowCount,
      durationMs: (performance.now() - start).toFixed(2)
    });

    return dataset;
  }
};
