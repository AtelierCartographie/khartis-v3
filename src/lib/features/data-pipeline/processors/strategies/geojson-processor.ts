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

async function processWithLegacy(
  ctx: ProcessContext,
  file: UploadedFile
): Promise<ProcessorDataset> {
  const duckFile = createGeoFile(file);
  await ctx.Duck.register_files([duckFile]);
  await ctx.Duck.read_geofile(duckFile, { tablename: ctx.tableName });

  const [columns, rowCount] = await Promise.all([
    ctx.Duck.analyse(ctx.tableName),
    ctx.callbacks.getRowCount(ctx.tableName)
  ]);

  return {
    id: file.datasetId ?? file.id,
    tableName: ctx.tableName,
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
    try {
      return await processWithSTRead(ctx, file);
    } catch {
      // Fallback path handles GeoJSON variants that ST_Read cannot ingest.
    }

    return processWithLegacy(ctx, file);
  }
};
