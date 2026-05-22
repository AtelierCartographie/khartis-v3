import { MIME } from '$lib/features/commons/constants';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/types/create-project.types';
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
    const gpkgFile = getFileForDuckDB(file, MIME.GEOPACKAGE);

    await ctx.Duck.register_files([gpkgFile]);

    const resultTableName = await ctx.Duck.read_geofile(gpkgFile, {
      tablename: ctx.tableName
    });
    const actualTableName =
      typeof resultTableName === 'string' ? resultTableName : ctx.tableName;

    const [columns, rowCount] = await Promise.all([
      ctx.Duck.analyse(actualTableName),
      ctx.callbacks.getRowCount(actualTableName)
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
      geoDetection: file.deepAnalysis?.geoDetection
    };

    return dataset;
  }
};
