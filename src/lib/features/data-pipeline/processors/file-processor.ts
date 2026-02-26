import { MIME } from '$lib/features/commons/constants';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import { GeoColumnDetector } from '$lib/features/commons/utils/geo-detector.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeIdentifier } from '$lib/features/commons/utils/sanitize.utils';
import { Duck } from '$lib/features/duckdb';
import * as m from '$lib/paraglide/messages';
import { isGeospatialFile } from '../constants';
import { detectFileFormat, generateTableName } from '../core/format-detector';
import { buildDatasetFromDuckTable } from '../operations/analysis';
import type {
  CsvImportOptions,
  DatasetResult,
  FileInfo,
  PipelineContext,
  RawDataset,
  UploadedFilePayload
} from '../types';
import { detectCsvHeader } from '../utils/csv-header-detector';
import { detectDecimalSeparator } from '../utils/decimal-detector';

export interface ProcessFileOptions {
  originalName?: string;
  rawDataset?: RawDataset;
  companionFiles?: File[];
}

const GEO_DETECTION_SAMPLE_LIMIT = 200;

function applyGeoDetection(
  dataset: DatasetResult,
  geoDetection?: GeoDetectionResult
): void {
  if (!geoDetection) return;

  dataset.geoDetection = geoDetection;
  dataset.analysis = {
    columns: dataset.analysis?.columns ?? dataset.columns,
    hasGeoData:
      geoDetection.hasGeoColumns ?? dataset.analysis?.hasGeoData ?? false,
    geoColumns: geoDetection.geoColumns,
    rowCount: dataset.rowCount,
    warnings: [...(dataset.analysis?.warnings ?? []), ...geoDetection.warnings]
  };
}

async function detectGeoColumnsFromTable(
  tableName: string,
  columns: string[]
): Promise<GeoDetectionResult | undefined> {
  if (columns.length === 0) return undefined;

  const escapedTable = escapeIdentifier(tableName);
  const escapedColumns = columns
    .map((column) => `"${escapeIdentifier(column)}"`)
    .join(', ');

  const sampleRows = (await Duck.query(
    `SELECT ${escapedColumns} FROM "${escapedTable}" LIMIT ${GEO_DETECTION_SAMPLE_LIMIT}`,
    { format: 'array' }
  )) as Array<Record<string, unknown>>;

  if (!sampleRows.length) return undefined;

  const matrix = sampleRows.map((row) => columns.map((column) => row[column]));

  return GeoColumnDetector.detectGeoColumns(columns, matrix, {
    sampleSize: Math.min(GEO_DETECTION_SAMPLE_LIMIT, matrix.length)
  });
}

export async function processFileInternal(
  ctx: PipelineContext,
  file: File,
  options: ProcessFileOptions = {}
): Promise<DatasetResult> {
  const fileInfo: FileInfo = {
    name: options.originalName ?? file.name,
    size: file.size,
    type: file.type
  };

  const tableName = generateTableName(fileInfo.name);
  const isGeoFile = isGeospatialFile(fileInfo.name);
  const isShapefile = fileInfo.name.toLowerCase().endsWith('.shp');
  const format = detectFileFormat(fileInfo.name);

  const start = performance.now();
  logger.debug('Reading file into DuckDB via pipeline', LogCategory.DATA, {
    fileName: fileInfo.name,
    tableName,
    isGeoFile,
    isShapefile,
    hasCompanionFiles: Boolean(options.companionFiles?.length)
  });

  if (isShapefile && (!options.companionFiles || options.companionFiles.length === 0)) {
    throw new Error(m.pipeline_error_shp_standalone());
  }

  await registerFilesForDuckDB(file, isShapefile, options.companionFiles);

  let detectedCsvOptions: CsvImportOptions | undefined;

  if (isGeoFile) {
    await Duck.read_geofile(file, {
      tablename: tableName,
      shapefile: isShapefile
    });
  } else {
    detectedCsvOptions = await readTabularFile(file, tableName, fileInfo.name);
  }

  const dataset = await buildDatasetFromDuckTable(ctx, {
    file: fileInfo,
    tableName,
    isGeoFile,
    format
  });

  if (detectedCsvOptions) {
    dataset.metadata.csvOptions = detectedCsvOptions;
  }

  if (options.rawDataset) {
    dataset.originalData = buildOriginalData(
      dataset.columns,
      options.rawDataset
    );
  }

  if (!isGeoFile) {
    try {
      const geoDetection = await detectGeoColumnsFromTable(
        dataset.tableName,
        dataset.columns.map((column) => column.name)
      );
      applyGeoDetection(dataset, geoDetection);
    } catch (error) {
      logger.warn(
        'Failed to compute geo detection for tabular dataset',
        LogCategory.DATA,
        { tableName: dataset.tableName, error }
      );
    }
  }

  logger.success('DuckDB dataset built', LogCategory.DATA, {
    tableName,
    rowCount: dataset.rowCount,
    durationMs: (performance.now() - start).toFixed(2)
  });

  return dataset;
}

async function registerFilesForDuckDB(
  file: File,
  isShapefile: boolean,
  companionFiles?: File[]
): Promise<void> {
  if (isShapefile) {
    const allShapefileFiles = companionFiles?.length
      ? [file, ...companionFiles]
      : [file];
    await Duck.register_files(allShapefileFiles, { shapefile: true });
  } else {
    await Duck.register_files([file]);
  }
}

function buildOriginalData(
  columns: DatasetResult['columns'],
  rawDataset: RawDataset
): DatasetResult['originalData'] {
  return {
    columns,
    data: rawDataset.rows.map((row) => {
      const record: Record<string, unknown> = {};
      rawDataset.headers?.forEach((header, index) => {
        record[header] = row[index];
      });
      return record;
    }),
    rowCount: rawDataset.rows.length
  };
}

async function readTabularFile(
  file: File,
  tableName: string,
  fileName: string
): Promise<CsvImportOptions | undefined> {
  const lowerFileName = fileName.toLowerCase();
  const isParquet =
    lowerFileName.endsWith('.parquet') ||
    lowerFileName.endsWith('.geoparquet') ||
    lowerFileName.endsWith('.gpq');
  const isArrow = lowerFileName.endsWith('.arrow');

  if (isParquet || isArrow) {
    await Duck.read_tabular(file, {
      tablename: tableName,
      format: 'parquet'
    });
    return undefined;
  }

  const detection = await detectDecimalSeparator(file);
  if (detection.separator === ',') {
    logger.info('European decimal format detected', LogCategory.DATA, {
      confidence: detection.confidence,
      sampleSize: detection.sampleSize,
      delimiter: detection.delimiter,
      thousandsSeparator: detection.thousandsSeparator
    });
  }
  const headerDetection = await detectCsvHeader(file, detection.delimiter);
  logger.debug('CSV header detection completed', LogCategory.DATA, {
    hasHeader: headerDetection.hasHeader,
    confidence: headerDetection.confidence,
    comparedColumns: headerDetection.comparedColumns,
    delimiter: detection.delimiter,
    fileName
  });

  await Duck.read_tabular(file, {
    tablename: tableName,
    header: headerDetection.hasHeader,
    decimal_separator: detection.separator,
    delimiter: detection.delimiter,
    thousands_separator: detection.thousandsSeparator
  });

  return {
    header: headerDetection.hasHeader,
    decimalSeparator: detection.separator,
    thousandsSeparator: detection.thousandsSeparator,
    delimiter: detection.delimiter
  };
}

export async function createFileFromUploadContent(
  content: string | ArrayBuffer,
  name: string,
  type: string
): Promise<File> {
  const resolvedType = type || MIME.BINARY;
  if (typeof content === 'string') {
    return new File([content], name, { type: resolvedType });
  }
  const blob = new Blob([content], { type: resolvedType });
  return new File([blob], name, { type: resolvedType });
}

export async function createFileFromUpload(
  uploadedFile: UploadedFilePayload
): Promise<File> {
  if (!uploadedFile.content) {
    logger.error('Uploaded file is missing inline content', LogCategory.DATA, {
      fileId: uploadedFile.id,
      fileName: uploadedFile.name
    });
    throw new Error(m.pipeline_error_no_content());
  }
  return createFileFromUploadContent(
    uploadedFile.content,
    uploadedFile.name,
    uploadedFile.type
  );
}

export function createCompanionFilesFromUpload(
  uploadedFile: UploadedFilePayload
): File[] | undefined {
  if (!uploadedFile.relatedFilesData) {
    return undefined;
  }

  const mainFileName = uploadedFile.name.toLowerCase();
  const companionFiles: File[] = [];

  for (const [fileName, data] of Object.entries(
    uploadedFile.relatedFilesData
  )) {
    if (fileName.toLowerCase() === mainFileName) continue;

    const buffer =
      data instanceof ArrayBuffer
        ? data
        : new Uint8Array(data as number[]).buffer;
    const blob = new Blob([buffer], { type: MIME.BINARY });
    companionFiles.push(new File([blob], fileName));
  }

  return companionFiles.length > 0 ? companionFiles : undefined;
}
