import {
  createUploadedFile,
  DataSourceType,
  FileType
} from '$lib/features/commons/utils/file-import.utils';
import { ParseError } from '$lib/features/commons/pipeline.errors';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck } from '$lib/features/duckdb';
import {
  createCompanionFilesFromAssetRefs,
  createFileFromAssetRef
} from '$lib/features/project-management/services/asset-store.service';
import * as m from '$lib/paraglide/messages';
import { isGeospatialFile } from '../constants';
import { FileFormatEnum } from '../enums';
import { detectFileFormat, generateTableName } from '../core/format-detector';
import { buildDatasetFromDuckTable } from '../operations/analysis';
import { normalizeFormattedNumericColumns } from '../operations/tabular-numeric-normalization';
import { gpxProcessor } from './strategies';
import { applyTabularGeoDetection } from './tabular-geo-detection';
import type {
  CsvImportOptions,
  DatasetResult,
  FileFormat,
  FileInfo,
  UploadedFilePayload
} from '../types';
import { detectCsvHeader } from '../utils/csv-header-detector';
import {
  detectDecimalSeparator,
  readFileHead
} from '../utils/decimal-detector';
import { MIME } from '$lib/features/commons/constants';
import type { UploadedFile } from '$lib/features/commons/types/create-project.types';

export interface ProcessFileOptions {
  originalName?: string;
  companionFiles?: File[];
  sourceFileId?: string;
}

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

async function processGpxFile(
  fileInfo: FileInfo,
  uploadedFile: UploadedFile,
  options: {
    tableName: string;
    format: FileFormat;
  }
): Promise<DatasetResult> {
  const processorDataset = await gpxProcessor.process(
    {
      Duck,
      callbacks: {
        getRowCount: (tableName: string) => Duck.get_row_count(tableName)
      },
      tableName: options.tableName
    },
    uploadedFile
  );

  return buildDatasetFromDuckTable({
    file: fileInfo,
    tableName: processorDataset.tableName,
    isGeoFile: true,
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

  const tableName = generateTableName(fileInfo.name, options.sourceFileId);
  const isGeoFile = isGeospatialFile(fileInfo.name);
  const isShapefile = fileInfo.name.toLowerCase().endsWith('.shp');
  const format = detectFileFormat(fileInfo.name);

  if (
    isShapefile &&
    (!options.companionFiles || options.companionFiles.length === 0)
  ) {
    throw new ParseError(
      m.pipeline_error_shp_standalone(),
      FileType.SHAPEFILE,
      {
        fileName: fileInfo.name
      }
    );
  }

  let detectedCsvOptions: CsvImportOptions | undefined;
  const uploadedFile = createProcessorFilePayload(
    file,
    fileInfo,
    options.companionFiles
  );

  let dataset: DatasetResult;

  if (isGeoFile && gpxProcessor.canHandle(uploadedFile)) {
    dataset = await processGpxFile(fileInfo, uploadedFile, {
      tableName,
      format
    });
  } else if (isGeoFile) {
    await registerFilesForDuckDB(file, isShapefile, options.companionFiles);
    const isPlainJson = fileInfo.name.toLowerCase().endsWith('.json');
    let geoReadError: unknown = null;
    try {
      await Duck.read_geofile(file, {
        tablename: tableName,
        shapefile: isShapefile
      });
    } catch (error) {
      if (!isPlainJson) {
        throw error;
      }
      geoReadError = error;
    }
    if (geoReadError === null) {
      dataset = await buildDatasetFromDuckTable({
        file: fileInfo,
        tableName,
        isGeoFile,
        format
      });
    } else {
      // A .json defaults to GeoJSON; plain JSON records fall back to a
      // tabular read (team decision on P10).
      try {
        await Duck.read_json_tabular(file, { tablename: tableName });
      } catch {
        throw new ParseError(
          m.pipeline_error_json_unreadable(),
          FileType.GEOJSON,
          { fileName: fileInfo.name, geoReadError: String(geoReadError) }
        );
      }
      dataset = await buildDatasetFromDuckTable({
        file: fileInfo,
        tableName,
        isGeoFile: false,
        format: FileFormatEnum.JSON
      });
    }
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

  await applyTabularGeoDetection(dataset);

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

  if (isParquet) {
    await Duck.read_tabular(file, {
      tablename: tableName,
      format: 'parquet'
    });
    return undefined;
  }

  // Read file head once, share between decimal and header detection (avoids double file.slice + decode)
  const cachedHead = await readFileHead(file, 20);
  const detection = await detectDecimalSeparator(file, { cachedHead });
  const headerDetection = await detectCsvHeader(file, detection.delimiter, {
    cachedHead
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
  if (uploadedFile.assetRef) {
    return createFileFromAssetRef(uploadedFile.assetRef);
  }

  if (!uploadedFile.content) {
    logger.error('Uploaded file is missing inline content', LogCategory.DATA, {
      fileId: uploadedFile.id,
      fileName: uploadedFile.name
    });
    throw new ParseError(
      m.pipeline_error_no_content(),
      uploadedFile.fileType ?? FileType.UNKNOWN,
      {
        fileId: uploadedFile.id,
        fileName: uploadedFile.name
      }
    );
  }
  return createFileFromUploadContent(
    uploadedFile.content,
    uploadedFile.name,
    uploadedFile.type
  );
}

export function createCompanionFilesFromUpload(
  uploadedFile: UploadedFilePayload
): File[] | undefined | Promise<File[] | undefined> {
  if (uploadedFile.companionAssetRefs?.length) {
    return createCompanionFilesFromAssetRefs(uploadedFile.companionAssetRefs);
  }

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
