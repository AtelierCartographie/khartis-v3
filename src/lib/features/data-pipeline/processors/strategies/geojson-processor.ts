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

function createGeoFile(file: UploadedFile): File {
  const content = file.content ?? JSON.stringify(file.parsedData);
  return new File([content], file.name, { type: MIME.GEOJSON });
}

async function processWithSTRead(
  ctx: ProcessContext,
  file: UploadedFile,
  startTime: number
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

  logger.success('GeoJSON processed via ST_Read', LogCategory.DUCKDB, {
    tableName: actualTableName,
    rowCount,
    durationMs: (performance.now() - startTime).toFixed(2)
  });

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
  file: UploadedFile,
  start: number
): Promise<ProcessorDataset> {
  const duckFile = createGeoFile(file);
  await ctx.Duck.register_files([duckFile]);
  await ctx.Duck.read_geofile(duckFile, { tablename: ctx.tableName });

  const [columns, rowCount] = await Promise.all([
    ctx.Duck.analyse(ctx.tableName),
    ctx.callbacks.getRowCount(ctx.tableName)
  ]);

  logger.success('GeoJSON processed via legacy', LogCategory.DUCKDB, {
    tableName: ctx.tableName,
    rowCount,
    durationMs: (performance.now() - start).toFixed(2)
  });

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
    const startTime = performance.now();

    try {
      return await processWithSTRead(ctx, file, startTime);
    } catch (error) {
      logger.warn('ST_Read pipeline failed', LogCategory.DUCKDB, {
        fileId: file.id,
        error
      });
    }

    return processWithLegacy(ctx, file, startTime);
  }
};
