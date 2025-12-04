import { ParseError } from '$lib/features/commons/errors/pipeline.errors';
import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import { convertGeoJSONToArrow } from '$lib/features/commons/utils/geojson-to-arrow.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { geoParquetReader, type GeoArrowMetadata } from '$lib/features/data-pipeline';
import { isGeoJSONFeatureCollection } from '$lib/types/data';
import type { Table } from 'apache-arrow/Arrow';
import {
  convertTabularDataToArrow,
  insertArrowTableIntoDuckDB
} from '../io/arrow-converter';
import { FileType, type AnalysisResult, type DuckDBDataset } from '../types';

export interface DuckDBClientForFileProcessing {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  analyse(
    tableName: string,
    options?: { force?: boolean }
  ): Promise<AnalysisResult[]>;
  register_files(
    files: File[],
    options?: { shapefile?: boolean }
  ): Promise<void>;
  read_tabular(
    file: File,
    options: { tablename: string }
  ): Promise<string | null>;
  read_geofile(
    file: File,
    options: { tablename: string; shapefile?: boolean }
  ): Promise<string | unknown>;
}

export interface FileProcessorCallbacks {
  getRowCount: (tableName: string) => Promise<number>;
  createArrowTableWithMetadata: (tableName: string) => Promise<{
    arrowTableWithMetadata: Table;
    geoArrowMetadata: GeoArrowMetadata | null;
  }>;
}

export function generateTableName(filename: string): string {
  let name = filename.replace(/\.[^/.]+$/, '');
  name = name.replace(/[^a-zA-Z0-9_]/g, '_');

  if (!/^[a-zA-Z]/.test(name)) {
    name = 't_' + name;
  }

  const timestamp = Date.now().toString(36);
  return `${name}_${timestamp}`;
}

export function convertToCSV(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvRows = [];

  csvRows.push(headers.join(','));

  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

export function getFileForDuckDB(
  file: UploadedFile,
  fallbackMime: string
): File {
  if (file.originalFile) {
    return file.originalFile;
  }

  if (file.content instanceof ArrayBuffer) {
    return new File([file.content], file.name, { type: fallbackMime });
  }

  if (typeof file.content === 'string') {
    return new File([file.content], file.name, { type: fallbackMime });
  }

  throw new ParseError(
    'Missing original file content for DuckDB ingestion',
    file.fileType,
    {
      fileId: file.id,
      fileName: file.name
    }
  );
}

export async function ensureFileObject(
  file: UploadedFile,
  fallbackMime: string
): Promise<File> {
  if (file.originalFile) {
    return file.originalFile;
  }

  if (file.content instanceof ArrayBuffer) {
    return new File([file.content], file.name, { type: fallbackMime });
  }

  if (typeof file.content === 'string') {
    return new File([file.content], file.name, { type: fallbackMime });
  }

  throw new ParseError('Missing original file content', file.fileType, {
    fileId: file.id,
    fileName: file.name
  });
}

export async function getArrayBufferFromUploadedFile(
  file: UploadedFile
): Promise<ArrayBuffer> {
  if (file.originalFile) {
    return file.originalFile.arrayBuffer();
  }

  if (file.content instanceof ArrayBuffer) {
    return file.content;
  }

  if (typeof file.content === 'string') {
    return new TextEncoder().encode(file.content).buffer;
  }

  throw new ParseError(
    'Missing file content for GeoParquet processing',
    file.fileType,
    {
      fileId: file.id,
      fileName: file.name
    }
  );
}

function logDatasetReady(
  source: string,
  dataset: DuckDBDataset,
  startTime: number
): void {
  logger.success(`${source} dataset ready`, LogCategory.DUCKDB, {
    datasetId: dataset.id,
    tableName: dataset.tableName,
    rowCount: dataset.rowCount,
    durationMs: (performance.now() - startTime).toFixed(2)
  });
}

export async function processCSV(
  file: UploadedFile,
  tableName: string,
  Duck: DuckDBClientForFileProcessing,
  callbacks: FileProcessorCallbacks
): Promise<DuckDBDataset> {
  const start = performance.now();
  logger.debug('Processing CSV file', LogCategory.DUCKDB, {
    fileId: file.id,
    tableName
  });
  const { isTabularData } = await import('$lib/types/data');

  if (!file.parsedData || !isTabularData(file.parsedData)) {
    throw new ParseError(
      'Invalid or missing parsed data for CSV file',
      FileType.CSV,
      { fileId: file.id, fileName: file.name }
    );
  }

  try {
    const arrowTable = convertTabularDataToArrow(file.parsedData, {
      addRowId: true
    });
    await insertArrowTableIntoDuckDB(arrowTable, tableName);

    const columns = await Duck.analyse(tableName);
    const rowCount = await callbacks.getRowCount(tableName);

    const dataset: DuckDBDataset = {
      id: crypto.randomUUID(),
      tableName: tableName,
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

    logDatasetReady('CSV (Arrow)', dataset, start);
    return dataset;
  } catch (error) {
    logger.warn(
      'Arrow ingestion failed, falling back to legacy CSV string',
      LogCategory.DUCKDB,
      error
    );
  }

  const csvData = convertToCSV(file.parsedData);

  const blob = new Blob([csvData], { type: 'text/csv' });
  const duckFile = new File([blob], file.name, { type: 'text/csv' });

  await Duck.register_files([duckFile]);

  const actualTableName = await Duck.read_tabular(duckFile, {
    tablename: tableName
  });

  const finalTableName = actualTableName || tableName;

  const columns = await Duck.analyse(finalTableName);
  const rowCount = await callbacks.getRowCount(finalTableName);

  const dataset: DuckDBDataset = {
    id: crypto.randomUUID(),
    tableName: finalTableName,
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

  logDatasetReady('CSV', dataset, start);
  return dataset;
}

export async function processGeoJSONWithSTRead(
  file: UploadedFile,
  tableName: string,
  Duck: DuckDBClientForFileProcessing,
  callbacks: FileProcessorCallbacks
): Promise<DuckDBDataset> {
  const startTime = performance.now();
  logger.debug('Processing GeoJSON via ST_Read', LogCategory.DUCKDB, {
    fileId: file.id,
    tableName
  });

  let geoFile: File;
  if (file.content) {
    const blob = new Blob([file.content], { type: 'application/json' });
    geoFile = new File([blob], file.name, { type: 'application/json' });
  } else {
    const geoJsonData = JSON.stringify(file.parsedData);
    const blob = new Blob([geoJsonData], { type: 'application/json' });
    geoFile = new File([blob], file.name, { type: 'application/json' });
  }

  await Duck.register_files([geoFile]);

  const resultTableName = await Duck.read_geofile(geoFile, {
    tablename: tableName
  });

  const actualTableName =
    typeof resultTableName === 'string' ? resultTableName : tableName;

  const [columns, rowCount] = await Promise.all([
    Duck.analyse(actualTableName),
    callbacks.getRowCount(actualTableName)
  ]);

  const dataset: DuckDBDataset = {
    id: crypto.randomUUID(),
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

  logDatasetReady('GeoJSON ST_Read', dataset, startTime);
  return dataset;
}

export async function processGeoJSONWithArrow(
  file: UploadedFile,
  tableName: string,
  Duck: DuckDBClientForFileProcessing,
  callbacks: FileProcessorCallbacks
): Promise<DuckDBDataset> {
  const startTime = performance.now();
  logger.debug('Processing GeoJSON via Arrow pipeline', LogCategory.DUCKDB, {
    fileId: file.id,
    tableName
  });

  if (!file.parsedData || !isGeoJSONFeatureCollection(file.parsedData)) {
    throw new ParseError(
      'Invalid or missing parsed GeoJSON data',
      FileType.GEOJSON,
      { fileId: file.id, fileName: file.name }
    );
  }

  const arrowTable = convertGeoJSONToArrow(file.parsedData);

  await insertArrowTableIntoDuckDB(arrowTable, tableName);

  await Duck.query(`
    CREATE OR REPLACE TABLE "${tableName}" AS
    SELECT
      * EXCLUDE (geom),
      ST_GeomFromGeoJSON(geom) as geom
    FROM "${tableName}"
  `);
  const safeSeqNameGeo = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
  await Duck.query(`
    CREATE OR REPLACE SEQUENCE "id_${safeSeqNameGeo}" START 1;
    ALTER TABLE "${tableName}" ADD COLUMN __id INTEGER DEFAULT nextval('id_${safeSeqNameGeo}');
  `);

  const columns = await Duck.analyse(tableName);
  const rowCount = await callbacks.getRowCount(tableName);

  const { arrowTableWithMetadata, geoArrowMetadata } =
    await callbacks.createArrowTableWithMetadata(tableName);

  const dataset: DuckDBDataset = {
    id: crypto.randomUUID(),
    tableName,
    sourceFileId: file.id,
    name: file.name,
    columns,
    rowCount,
    metadata: {
      processedAt: new Date(),
      fileType: file.fileType
    },
    arrowTableWithMetadata,
    geoArrowMetadata: geoArrowMetadata ?? undefined
  };

  logDatasetReady('GeoJSON Arrow', dataset, startTime);
  return dataset;
}

export async function processGeoJSONLegacy(
  file: UploadedFile,
  tableName: string,
  Duck: DuckDBClientForFileProcessing,
  callbacks: FileProcessorCallbacks
): Promise<DuckDBDataset> {
  const start = performance.now();
  logger.debug('Processing GeoJSON via legacy pipeline', LogCategory.DUCKDB, {
    fileId: file.id,
    tableName
  });

  const geoJsonData = JSON.stringify(file.parsedData);

  const blob = new Blob([geoJsonData], { type: 'application/json' });
  const duckFile = new File([blob], file.name, { type: 'application/json' });

  await Duck.register_files([duckFile]);
  await Duck.read_geofile(duckFile, { tablename: tableName });

  const columns = await Duck.analyse(tableName);
  const rowCount = await callbacks.getRowCount(tableName);

  const { arrowTableWithMetadata, geoArrowMetadata } =
    await callbacks.createArrowTableWithMetadata(tableName);

  const dataset: DuckDBDataset = {
    id: crypto.randomUUID(),
    tableName,
    sourceFileId: file.id,
    name: file.name,
    columns,
    rowCount,
    metadata: {
      processedAt: new Date(),
      fileType: file.fileType
    },
    geoDetection: file.deepAnalysis?.geoDetection,
    arrowTableWithMetadata,
    geoArrowMetadata: geoArrowMetadata ?? undefined
  };

  logDatasetReady('GeoJSON Legacy', dataset, start);
  return dataset;
}

export async function processGeoJSON(
  file: UploadedFile,
  tableName: string,
  Duck: DuckDBClientForFileProcessing,
  callbacks: FileProcessorCallbacks
): Promise<DuckDBDataset> {
  const USE_ST_READ = import.meta.env.VITE_USE_ST_READ !== 'false';
  const USE_ARROW_PIPELINE = import.meta.env.VITE_USE_ARROW_GEOJSON === 'true';

  if (USE_ST_READ) {
    try {
      return await processGeoJSONWithSTRead(file, tableName, Duck, callbacks);
    } catch (error) {
      logger.warn(
        'DuckDB ST_Read pipeline failed, falling back',
        LogCategory.DUCKDB,
        {
          fileId: file.id,
          error
        }
      );
    }
  }

  if (USE_ARROW_PIPELINE) {
    try {
      return await processGeoJSONWithArrow(file, tableName, Duck, callbacks);
    } catch (error) {
      logger.warn(
        'Arrow pipeline failed, falling back to legacy GeoJSON loader',
        LogCategory.DUCKDB,
        {
          fileId: file.id,
          error
        }
      );
    }
  }

  return await processGeoJSONLegacy(file, tableName, Duck, callbacks);
}

export async function processGeoPackage(
  file: UploadedFile,
  tableName: string,
  Duck: DuckDBClientForFileProcessing,
  callbacks: FileProcessorCallbacks
): Promise<DuckDBDataset> {
  const start = performance.now();
  logger.debug('Processing GeoPackage file', LogCategory.DUCKDB, {
    fileId: file.id,
    tableName
  });

  const gpkgFile = getFileForDuckDB(file, 'application/geopackage+sqlite3');

  await Duck.register_files([gpkgFile]);

  const resultTableName = await Duck.read_geofile(gpkgFile, {
    tablename: tableName
  });
  const actualTableName =
    typeof resultTableName === 'string' ? resultTableName : tableName;

  const columns = await Duck.analyse(actualTableName);
  const rowCount = await callbacks.getRowCount(actualTableName);
  const { arrowTableWithMetadata, geoArrowMetadata } =
    await callbacks.createArrowTableWithMetadata(actualTableName);

  const dataset: DuckDBDataset = {
    id: crypto.randomUUID(),
    tableName: actualTableName,
    sourceFileId: file.id,
    name: file.name,
    columns,
    rowCount,
    metadata: {
      processedAt: new Date(),
      fileType: file.fileType
    },
    geoDetection: file.deepAnalysis?.geoDetection,
    arrowTableWithMetadata,
    geoArrowMetadata: geoArrowMetadata ?? undefined
  };

  logDatasetReady('GeoPackage', dataset, start);
  return dataset;
}

export async function processGeoParquet(
  file: UploadedFile,
  tableName: string,
  Duck: DuckDBClientForFileProcessing,
  callbacks: FileProcessorCallbacks
): Promise<DuckDBDataset> {
  const start = performance.now();
  logger.debug('Processing GeoParquet file', LogCategory.DUCKDB, {
    fileId: file.id,
    tableName
  });

  const buffer = await getArrayBufferFromUploadedFile(file);
  const arrowTable = await geoParquetReader.readGeoParquet(buffer);
  const geoMetadata = geoParquetReader.extractMetadata(arrowTable);

  await insertArrowTableIntoDuckDB(arrowTable, tableName);

  if (geoMetadata) {
    const geomColumn = geoMetadata.primary_column;
    try {
      await Duck.query(`
          CREATE OR REPLACE TABLE "${tableName}" AS
        SELECT * REPLACE (
          ST_GeomFromWKB("${geomColumn}")::GEOMETRY AS "${geomColumn}"
        )
          FROM "${tableName}"
        `);
    } catch (error) {
      logger.warn(
        'Failed to convert GeoParquet geometry column',
        LogCategory.DUCKDB,
        error
      );
    }
  }

  const safeSeqName = tableName.replace(/[^a-zA-Z0-9_]/g, '_');
  await Duck.query(`
    CREATE OR REPLACE SEQUENCE "id_${safeSeqName}" START 1;
    ALTER TABLE "${tableName}" ADD COLUMN __id INTEGER DEFAULT nextval('id_${safeSeqName}');
  `);

  const [columns, rowCount] = await Promise.all([
    Duck.analyse(tableName),
    callbacks.getRowCount(tableName)
  ]);

  const dataset: DuckDBDataset = {
    id: crypto.randomUUID(),
    tableName,
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

  logDatasetReady('GeoParquet', dataset, start);
  return dataset;
}

export async function processShapefile(
  file: UploadedFile,
  tableName: string,
  Duck: DuckDBClientForFileProcessing,
  callbacks: FileProcessorCallbacks
): Promise<DuckDBDataset> {
  const start = performance.now();
  logger.debug('Processing Shapefile', LogCategory.DUCKDB, {
    fileId: file.id,
    tableName
  });

  const shpFile = await ensureFileObject(file, 'application/x-shapefile');

  const companionFiles =
    file.relatedFileObjects?.filter(
      (f) => f.name.toLowerCase() !== shpFile.name.toLowerCase()
    ) ?? [];

  logger.debug('Shapefile registration details', LogCategory.DUCKDB, {
    shpFileName: shpFile.name,
    shpFileSize: shpFile.size,
    relatedFiles: companionFiles.map((f) => ({
      name: f.name,
      size: f.size
    }))
  });

  const shapefileComponents = [shpFile, ...companionFiles];

  await Duck.register_files(shapefileComponents, { shapefile: true });

  if (companionFiles.length === 0) {
    logger.warn(
      'No companion files found for Shapefile - ingestion may fail',
      LogCategory.DUCKDB
    );
  } else {
    logger.debug(
      `Registered ${companionFiles.length} companion files for Shapefile`,
      LogCategory.DUCKDB
    );
  }

  const resultTableName = await Duck.read_geofile(shpFile, {
    tablename: tableName,
    shapefile: true
  });

  const actualTableName =
    typeof resultTableName === 'string' ? resultTableName : tableName;

  const [columns, rowCount] = await Promise.all([
    Duck.analyse(actualTableName),
    callbacks.getRowCount(actualTableName)
  ]);

  const dataset: DuckDBDataset = {
    id: crypto.randomUUID(),
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

  logDatasetReady('Shapefile', dataset, start);
  return dataset;
}
