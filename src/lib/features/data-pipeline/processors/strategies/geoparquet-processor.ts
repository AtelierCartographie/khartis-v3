import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
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
    const start = performance.now();
    logger.debug('Processing GeoParquet file', LogCategory.DUCKDB, {
      fileId: file.id,
      tableName: ctx.tableName
    });

    // Register parquet file in DuckDB and create table via read_parquet().
    // DuckDB >= 1.33 handles geoarrow.wkb natively — no need for geoparquet-wasm.
    const buffer = await getArrayBuffer(file);
    const sanitizedName = ctx.tableName
      .replace(/[^a-zA-Z0-9_]/g, '_');

    const parquetFile = new File([buffer], `${sanitizedName}.parquet`, {
      type: 'application/octet-stream'
    });

    await ctx.Duck.register_files([parquetFile]);

    const fileWithId = parquetFile as File & { id?: string };
    const fileId =
      fileWithId.id || `${parquetFile.lastModified}-${parquetFile.name}`;
    const escapedFileId = escapeSqlString(fileId);

    await ctx.Duck.query(`
      CREATE OR REPLACE TABLE "${ctx.tableName}" AS
      SELECT * FROM read_parquet('${escapedFileId}')
    `);

    const safeSeqName = ctx.tableName.replace(/[^a-zA-Z0-9_]/g, '_');
    await ctx.Duck.query(`
      CREATE OR REPLACE SEQUENCE "id_${safeSeqName}" START 1;
      ALTER TABLE "${ctx.tableName}" ADD COLUMN __id INTEGER DEFAULT nextval('id_${safeSeqName}');
    `);

    const [columns, rowCount] = await Promise.all([
      ctx.Duck.analyse(ctx.tableName),
      ctx.callbacks.getRowCount(ctx.tableName)
    ]);

    const dataset: ProcessorDataset = {
      id: file.datasetId ?? file.id,
      tableName: ctx.tableName,
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

    logger.success('GeoParquet processed', LogCategory.DUCKDB, {
      datasetId: dataset.id,
      tableName: dataset.tableName,
      rowCount: dataset.rowCount,
      durationMs: (performance.now() - start).toFixed(2)
    });

    return dataset;
  }
};
