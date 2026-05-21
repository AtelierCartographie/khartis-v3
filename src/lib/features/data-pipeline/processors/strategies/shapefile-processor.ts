import { MIME } from '$lib/features/commons/constants';
import { ParseError } from '$lib/features/commons/pipeline.errors';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/types/create-project.types';
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
    const shpFile = getFileForDuckDB(file, MIME.SHAPEFILE_SHP);

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

    return dataset;
  }
};
