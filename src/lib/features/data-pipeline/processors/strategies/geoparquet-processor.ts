import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/types/create-project.types';
import type {
  FileProcessor,
  ProcessContext,
  ProcessorDataset
} from '../file-processor.interface';
import { getArrayBuffer } from './processor-utils';

export const geoparquetProcessor: FileProcessor = {
  supportedFileTypes: [FileType.GEOPARQUET, FileType.ARROW],

  canHandle(file: UploadedFile): boolean {
    const lowerName = file.name.toLowerCase();
    return (
      file.fileType === FileType.GEOPARQUET ||
      file.fileType === FileType.ARROW ||
      lowerName.endsWith('.parquet') ||
      lowerName.endsWith('.geoparquet') ||
      lowerName.endsWith('.gpq') ||
      lowerName.endsWith('.arrow')
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
