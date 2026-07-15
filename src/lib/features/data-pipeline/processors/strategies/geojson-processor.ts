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
import { buildProcessorDataset } from './processor-utils';

function createGeoFile(file: UploadedFile): File {
  const content = file.content ?? JSON.stringify(file.parsedData);
  return new File([content], file.name, { type: MIME.GEOJSON });
}

async function processWithSTRead(
  ctx: ProcessContext,
  file: UploadedFile
): Promise<ProcessorDataset> {
  const geoFile = createGeoFile(file);
  await ctx.Duck.register_files([geoFile]);
  const resultTableName = await ctx.Duck.read_geofile(geoFile, {
    tablename: ctx.tableName
  });
  const actualTableName =
    typeof resultTableName === 'string' ? resultTableName : ctx.tableName;

  return buildProcessorDataset(ctx, file, actualTableName);
}

export const geojsonProcessor: FileProcessor = {
  supportedFileTypes: [FileType.GEOJSON],

  canHandle(file: UploadedFile): boolean {
    const ext = file.name.toLowerCase();
    return (
      file.fileType === FileType.GEOJSON ||
      ext.endsWith('.geojson') ||
      ext.endsWith('.json')
    );
  },

  async process(
    ctx: ProcessContext,
    file: UploadedFile
  ): Promise<ProcessorDataset> {
    return processWithSTRead(ctx, file);
  }
};
