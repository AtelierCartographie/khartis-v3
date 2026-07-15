import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/types/create-project.types';
import type {
  FileProcessor,
  ProcessContext,
  ProcessorDataset
} from '../file-processor.interface';
import { buildProcessorDataset, getArrayBuffer } from './processor-utils';

export const geoparquetProcessor: FileProcessor = {
  supportedFileTypes: [FileType.GEOPARQUET],

  canHandle(file: UploadedFile): boolean {
    const lowerName = file.name.toLowerCase();
    return (
      file.fileType === FileType.GEOPARQUET ||
      lowerName.endsWith('.parquet') ||
      lowerName.endsWith('.geoparquet') ||
      lowerName.endsWith('.gpq')
    );
  },

  async process(
    ctx: ProcessContext,
    file: UploadedFile
  ): Promise<ProcessorDataset> {
    // DuckDB >= 1.33 handles geoarrow.wkb natively — no need for geoparquet-wasm.
    const buffer = await getArrayBuffer(file);
    const sanitizedName = ctx.tableName.replace(/[^a-zA-Z0-9_]/g, '_');

    const parquetFile = new File([buffer], `${sanitizedName}.parquet`, {
      type: 'application/octet-stream'
    });

    const resultTableName = await ctx.Duck.read_tabular(parquetFile, {
      tablename: ctx.tableName,
      format: 'parquet'
    });
    const actualTableName =
      typeof resultTableName === 'string' ? resultTableName : ctx.tableName;

    return buildProcessorDataset(ctx, file, actualTableName);
  }
};
