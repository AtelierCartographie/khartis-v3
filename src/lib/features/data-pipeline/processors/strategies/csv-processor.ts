import { ParseError } from '$lib/features/commons/errors/pipeline.errors';
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
import { convertToCSV, isTabularData } from './processor-utils';

async function processWithArrow(
  ctx: ProcessContext,
  file: UploadedFile,
  start: number
): Promise<ProcessorDataset | null> {
  const { convertTabularDataToArrow, insertArrowTableIntoDuckDB } =
    await import('$lib/features/duckdb/io/arrow-converter');

  try {
    const arrowTable = convertTabularDataToArrow(
      file.parsedData as Record<string, unknown>[],
      { addRowId: true }
    );
    await insertArrowTableIntoDuckDB(arrowTable, ctx.tableName);

    const [columns, rowCount] = await Promise.all([
      ctx.Duck.analyse(ctx.tableName),
      ctx.callbacks.getRowCount(ctx.tableName)
    ]);

    logger.success('CSV processed via Arrow', LogCategory.DUCKDB, {
      tableName: ctx.tableName,
      rowCount,
      durationMs: (performance.now() - start).toFixed(2)
    });

    return {
      id: crypto.randomUUID(),
      tableName: ctx.tableName,
      sourceFileId: file.id,
      name: file.name,
      columns,
      rowCount,
      metadata: { processedAt: new Date(), fileType: file.fileType },
      geoDetection: file.deepAnalysis?.geoDetection
    };
  } catch (error) {
    logger.warn(
      'Arrow ingestion failed, falling back',
      LogCategory.DUCKDB,
      error
    );
    return null;
  }
}

async function processWithLegacy(
  ctx: ProcessContext,
  file: UploadedFile,
  start: number
): Promise<ProcessorDataset> {
  const csvData = convertToCSV(file.parsedData as Record<string, unknown>[]);
  const duckFile = new File([csvData], file.name, { type: 'text/csv' });

  await ctx.Duck.register_files([duckFile]);
  const actualTableName =
    (await ctx.Duck.read_tabular(duckFile, { tablename: ctx.tableName })) ||
    ctx.tableName;

  const [columns, rowCount] = await Promise.all([
    ctx.Duck.analyse(actualTableName),
    ctx.callbacks.getRowCount(actualTableName)
  ]);

  logger.success('CSV processed via legacy', LogCategory.DUCKDB, {
    tableName: actualTableName,
    rowCount,
    durationMs: (performance.now() - start).toFixed(2)
  });

  return {
    id: crypto.randomUUID(),
    tableName: actualTableName,
    sourceFileId: file.id,
    name: file.name,
    columns,
    rowCount,
    metadata: { processedAt: new Date(), fileType: file.fileType },
    geoDetection: file.deepAnalysis?.geoDetection
  };
}

export const csvProcessor: FileProcessor = {
  supportedFileTypes: [FileType.CSV, FileType.TSV],

  canHandle(file: UploadedFile): boolean {
    const ext = file.name.toLowerCase();
    return (
      file.fileType === FileType.CSV ||
      file.fileType === FileType.TSV ||
      ext.endsWith('.csv') ||
      ext.endsWith('.tsv') ||
      ext.endsWith('.txt')
    );
  },

  async process(
    ctx: ProcessContext,
    file: UploadedFile
  ): Promise<ProcessorDataset> {
    const start = performance.now();
    logger.debug('Processing CSV file', LogCategory.DUCKDB, {
      fileId: file.id,
      tableName: ctx.tableName
    });

    if (!file.parsedData || !isTabularData(file.parsedData)) {
      throw new ParseError(
        'Invalid or missing parsed data for CSV file',
        FileType.CSV,
        {
          fileId: file.id,
          fileName: file.name
        }
      );
    }

    return (
      (await processWithArrow(ctx, file, start)) ??
      processWithLegacy(ctx, file, start)
    );
  }
};
