import { MIME } from '$lib/features/commons/constants';
import { ParseError } from '$lib/features/commons/pipeline.errors';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/types/create-project.types';
import * as m from '$lib/paraglide/messages';
import { getFileExtensionWithDot } from '$lib/features/commons/utils/file.utils';
import type {
  FileProcessor,
  ProcessContext,
  ProcessorDataset
} from '../file-processor.interface';
import { buildProcessorDataset, getFileForDuckDB } from './processor-utils';

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

    const lowerShpName = shpFile.name.toLowerCase();
    const baseName = lowerShpName.endsWith('.shp')
      ? lowerShpName.slice(0, -'.shp'.length)
      : lowerShpName;
    const companionExtensions = new Set(
      companionFiles
        .filter((f) => {
          const ext = getFileExtensionWithDot(f.name);
          return f.name.toLowerCase() === `${baseName}${ext}`;
        })
        .map((f) => getFileExtensionWithDot(f.name))
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

    return buildProcessorDataset(ctx, file, actualTableName);
  }
};
