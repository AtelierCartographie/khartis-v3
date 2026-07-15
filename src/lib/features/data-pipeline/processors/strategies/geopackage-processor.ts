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
import { buildProcessorDataset, getFileForDuckDB } from './processor-utils';

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

    return buildProcessorDataset(ctx, file, actualTableName);
  }
};
