import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { geoParquetReader } from '$lib/features/data-pipeline';
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

    const { insertArrowTableIntoDuckDB } =
      await import('$lib/features/duckdb/io/arrow-converter');

    const buffer = await getArrayBuffer(file);
    const arrowTable = await geoParquetReader.readGeoParquet(buffer);
    const geoMetadata = geoParquetReader.extractMetadata(arrowTable);

    await insertArrowTableIntoDuckDB(arrowTable, ctx.tableName);

    if (geoMetadata) {
      const geomColumn = geoMetadata.primary_column.replace(
        /[^a-zA-Z0-9_]/g,
        '_'
      );
      try {
        await ctx.Duck.query(`
          CREATE OR REPLACE TABLE "${ctx.tableName}" AS
          SELECT * REPLACE (
            ST_GeomFromWKB("${geomColumn}")::GEOMETRY AS "${geomColumn}"
          )
          FROM "${ctx.tableName}"
        `);
      } catch (error) {
        logger.warn(
          'Failed to convert GeoParquet geometry column',
          LogCategory.DUCKDB,
          error
        );
      }
    }

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
      geoDetection: file.deepAnalysis?.geoDetection,
      geoArrowMetadata: geoMetadata ?? undefined
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
