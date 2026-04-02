import { MIME } from '$lib/features/commons/constants';
import { ParseError } from '$lib/features/commons/errors/pipeline.errors';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import * as m from '$lib/paraglide/messages';
import type {
  FileProcessor,
  ProcessContext,
  ProcessorDataset
} from '../file-processor.interface';
import { getFileForDuckDB } from './processor-utils';

export const shapefileProcessor: FileProcessor = {
  supportedFileTypes: [FileType.SHAPEFILE],

  canHandle(file: UploadedFile): boolean {
    return (
      file.fileType === FileType.SHAPEFILE ||
      file.name.toLowerCase().endsWith('.shp')
    );
  },

  async process(
    ctx: ProcessContext,
    file: UploadedFile
  ): Promise<ProcessorDataset> {
    const start = performance.now();
    logger.debug('Processing Shapefile', LogCategory.DUCKDB, {
      fileId: file.id,
      tableName: ctx.tableName
    });

    const shpFile = getFileForDuckDB(file, MIME.SHAPEFILE);

    const companionFiles =
      file.relatedFileObjects?.filter(
        (f) => f.name.toLowerCase() !== shpFile.name.toLowerCase()
      ) ?? [];

    const baseName = shpFile.name.replace(/\.shp$/i, '');
    const companionExtensions = new Set(
      companionFiles.map((f) =>
        f.name.toLowerCase().replace(baseName.toLowerCase(), '')
      )
    );
    const hasDbf = companionExtensions.has('.dbf');
    const hasShx = companionExtensions.has('.shx');

    if (!hasDbf || !hasShx) {
      throw new ParseError(m.pipeline_error_shp_standalone(), file.fileType, {
        fileName: shpFile.name
      });
    }

    const shapefileComponents = [shpFile, ...companionFiles];

    await ctx.Duck.register_files(shapefileComponents, { shapefile: true });

    const resultTableName = await ctx.Duck.read_geofile(shpFile, {
      tablename: ctx.tableName,
      shapefile: true
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

    logger.success('Shapefile processed', LogCategory.DUCKDB, {
      datasetId: dataset.id,
      tableName: dataset.tableName,
      rowCount: dataset.rowCount,
      durationMs: (performance.now() - start).toFixed(2)
    });

    return dataset;
  }
};
