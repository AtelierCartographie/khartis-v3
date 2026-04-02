import { MIME } from '$lib/features/commons/constants';
import { ParseError } from '$lib/features/commons/errors/pipeline.errors';
import {
  FileType,
  type UploadedFile
} from '$lib/features/commons/store/create-project.types';
import { convertGeoJSONToArrow } from '$lib/features/commons/utils/geojson-to-arrow.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { isGeoJSONFeatureCollection } from '$lib/types/data';
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

async function processWithArrow(
  ctx: ProcessContext,
  file: UploadedFile,
  startTime: number
): Promise<ProcessorDataset> {
  if (!file.parsedData || !isGeoJSONFeatureCollection(file.parsedData)) {
    throw new ParseError(
      'Invalid or missing parsed GeoJSON data',
      FileType.GEOJSON,
      {
        fileId: file.id,
        fileName: file.name
      }
    );
  }

  const { insertArrowTableIntoDuckDB } =
    await import('$lib/features/duckdb/io/arrow-converter');
  const arrowTable = convertGeoJSONToArrow(file.parsedData);
  await insertArrowTableIntoDuckDB(arrowTable, ctx.tableName);

  await ctx.Duck.query(`
    CREATE OR REPLACE TABLE "${ctx.tableName}" AS
    SELECT * EXCLUDE (geom), ST_GeomFromGeoJSON(geom) as geom FROM "${ctx.tableName}"
  `);

  const safeSeq = ctx.tableName.replace(/[^a-zA-Z0-9_]/g, '_');
  await ctx.Duck.query(`
    CREATE OR REPLACE SEQUENCE "id_${safeSeq}" START 1;
    ALTER TABLE "${ctx.tableName}" ADD COLUMN __id INTEGER DEFAULT nextval('id_${safeSeq}');
  `);

  const [columns, rowCount, arrowMeta] = await Promise.all([
    ctx.Duck.analyse(ctx.tableName),
    ctx.callbacks.getRowCount(ctx.tableName),
    ctx.callbacks.createArrowTableWithMetadata(ctx.tableName)
  ]);

  logger.success('GeoJSON processed via Arrow', LogCategory.DUCKDB, {
    tableName: ctx.tableName,
    rowCount,
    durationMs: (performance.now() - startTime).toFixed(2)
  });

  return {
    id: file.datasetId ?? file.id,
    tableName: ctx.tableName,
    sourceFileId: file.id,
    name: file.name,
    columns,
    rowCount,
    metadata: { processedAt: new Date(), fileType: file.fileType },
    arrowTableWithMetadata: arrowMeta.arrowTableWithMetadata,
    geoArrowMetadata: arrowMeta.geoArrowMetadata ?? undefined
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

  const [columns, rowCount, arrowMeta] = await Promise.all([
    ctx.Duck.analyse(ctx.tableName),
    ctx.callbacks.getRowCount(ctx.tableName),
    ctx.callbacks.createArrowTableWithMetadata(ctx.tableName)
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
    geoDetection: file.deepAnalysis?.geoDetection,
    arrowTableWithMetadata: arrowMeta.arrowTableWithMetadata,
    geoArrowMetadata: arrowMeta.geoArrowMetadata ?? undefined
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
    const USE_ST_READ = import.meta.env.VITE_USE_ST_READ !== 'false';
    const USE_ARROW = import.meta.env.VITE_USE_ARROW_GEOJSON === 'true';
    const startTime = performance.now();

    if (USE_ST_READ) {
      try {
        return await processWithSTRead(ctx, file, startTime);
      } catch (error) {
        logger.warn('ST_Read pipeline failed', LogCategory.DUCKDB, {
          fileId: file.id,
          error
        });
      }
    }

    if (USE_ARROW) {
      try {
        return await processWithArrow(ctx, file, startTime);
      } catch (error) {
        logger.warn('Arrow pipeline failed', LogCategory.DUCKDB, {
          fileId: file.id,
          error
        });
      }
    }

    return processWithLegacy(ctx, file, startTime);
  }
};
