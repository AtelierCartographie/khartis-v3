import { MIME } from '$lib/features/commons/constants';
import type { UploadedFile } from '$lib/features/commons/store/create-project.types';
import {
  createUploadedFile,
  DataSourceType,
  FileType
} from '$lib/features/commons/utils/file-import.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck } from '$lib/features/duckdb';
import { createArrowTableWithMetadata } from '$lib/features/duckdb/orchestrator/arrow-ops';
import * as m from '$lib/paraglide/messages';
import { isGeospatialFile } from '../constants';
import { detectFileFormat, generateTableName } from '../core/format-detector';
import { extractGeoArrowMetadata } from '../io/geoarrow-metadata';
import { buildDatasetFromDuckTable } from '../operations/analysis';
import { normalizeFormattedNumericColumns } from '../operations/tabular-numeric-normalization';
import { getProcessor } from './processor-registry';
import { registerAllProcessors } from './register-processors';
import { applyTabularGeoDetection } from './tabular-geo-detection';
import type {
  CsvImportOptions,
  DatasetResult,
  FileFormat,
  FileInfo,
  RawDataset,
  UploadedFilePayload
} from '../types';
import { detectCsvHeader } from '../utils/csv-header-detector';
import {
  detectDecimalSeparator,
  readFileHead
} from '../utils/decimal-detector';

export interface ProcessFileOptions {
  originalName?: string;
  rawDataset?: RawDataset;
  companionFiles?: File[];
}
const RAW_FILE_PROCESSOR_TYPES = new Set<FileType>([FileType.GPX]);

function createProcessorFilePayload(
  file: File,
  fileInfo: FileInfo,
  companionFiles?: File[]
): UploadedFile {
  const uploadedFile = createUploadedFile(file, DataSourceType.FILE_UPLOAD);

  uploadedFile.name = fileInfo.name;
  uploadedFile.originalFile = file;

  if (companionFiles?.length) {
    uploadedFile.relatedFileObjects = companionFiles;
    uploadedFile.relatedFiles = companionFiles.map(
      (companion) => companion.name
    );
  }

  return uploadedFile;
}

async function tryProcessWithRegisteredProcessor(
  fileInfo: FileInfo,
  uploadedFile: UploadedFile,
  options: {
    tableName: string;
    format: FileFormat;
    isGeoFile: boolean;
  }
): Promise<DatasetResult | null> {
  if (
    !options.isGeoFile ||
    !RAW_FILE_PROCESSOR_TYPES.has(uploadedFile.fileType)
  ) {
    return null;
  }

  registerAllProcessors();

  const processor = getProcessor(uploadedFile);
  if (!processor) {
    return null;
  }

  const processorDataset = await processor.process(
    {
      Duck,
      callbacks: {
        getRowCount: (tableName: string) => Duck.get_row_count(tableName),
        createArrowTableWithMetadata: (tableName: string) =>
          createArrowTableWithMetadata(tableName, Duck, (table) =>
            extractGeoArrowMetadata(table)
          )
      },
      tableName: options.tableName
    },
    uploadedFile
  );

  return buildDatasetFromDuckTable({
    file: fileInfo,
    tableName: processorDataset.tableName,
    isGeoFile: options.isGeoFile,
    format: options.format
  });
}

export async function processFileInternal(
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

  if (
    isShapefile &&
    (!options.companionFiles || options.companionFiles.length === 0)
  ) {
    throw new Error(m.pipeline_error_shp_standalone());
  }

  let detectedCsvOptions: CsvImportOptions | undefined;
  const uploadedFile = createProcessorFilePayload(
    file,
    fileInfo,
    options.companionFiles
  );

  const processorDataset = await tryProcessWithRegisteredProcessor(
    fileInfo,
    uploadedFile,
    {
      tableName,
      format,
      isGeoFile
    }
  );

  let dataset: DatasetResult;

  if (processorDataset) {
    dataset = processorDataset;
  } else if (isGeoFile) {
    await registerFilesForDuckDB(file, isShapefile, options.companionFiles);
    await Duck.read_geofile(file, {
      tablename: tableName,
      shapefile: isShapefile
    });
    dataset = await buildDatasetFromDuckTable({
      file: fileInfo,
      tableName,
      isGeoFile,
      format
    });
  } else {
    await registerFilesForDuckDB(file, isShapefile, options.companionFiles);
    detectedCsvOptions = await readTabularFile(file, tableName, fileInfo.name);
    dataset = await buildDatasetFromDuckTable({
      file: fileInfo,
      tableName,
      isGeoFile,
      format
    });
  }

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
    await applyTabularGeoDetection(dataset);
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

  // Read file head once, share between decimal and header detection (avoids double file.slice + decode)
  const cachedHead = await readFileHead(file, 20);
  const detection = await detectDecimalSeparator(file, { cachedHead });
  if (detection.separator === ',') {
    logger.debug('European decimal format detected', LogCategory.DATA, {
      confidence: detection.confidence,
      sampleSize: detection.sampleSize,
      delimiter: detection.delimiter,
      thousandsSeparator: detection.thousandsSeparator
    });
  }
  const headerDetection = await detectCsvHeader(file, detection.delimiter, {
    cachedHead
  });
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

  await normalizeFormattedNumericColumns(tableName, Duck);

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
