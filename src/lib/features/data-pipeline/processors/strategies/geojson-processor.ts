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

  const [columns, rowCount] = await Promise.all([
    ctx.Duck.analyse(actualTableName),
    ctx.callbacks.getRowCount(actualTableName)
  ]);

  return {
    id: file.datasetId ?? file.id,
    tableName: actualTableName,
    sourceFileId: file.id,
    name: file.name,
    columns,
    rowCount,
    metadata: { processedAt: new Date(), fileType: file.fileType },
    geoDetection: file.deepAnalysis?.geoDetection
  };
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
