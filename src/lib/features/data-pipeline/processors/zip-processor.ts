import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import * as m from '$lib/paraglide/messages';
import type { DatasetResult, ZipDatasetResult } from '../types';
import {
  createFileFromExtracted,
  extractZip,
  type ExtractedFile,
  getNonShapefileFilesFromArchive,
  getShapefileFilesFromArchive,
  getSupportedFilesFromArchive
} from '../utils/zip-handler';
import { processFileInternal } from './file-processor';

export async function processZipFile(
  file: File
): Promise<DatasetResult | ZipDatasetResult> {
  const start = performance.now();

  try {
    const extraction = await extractZip(file);

    if (extraction.isShapefileArchive && extraction.shapefileBaseName) {
      return processShapefileArchive(file, extraction, start);
    }

    return processGenericZip(file, extraction, start);
  } catch (error) {
    logger.error('Failed to process ZIP archive', LogCategory.DATA, {
      fileName: file.name,
      error
    });
    throw error;
  }
}

async function processShapefileArchive(
  file: File,
  extraction: Awaited<ReturnType<typeof extractZip>>,
  start: number
): Promise<DatasetResult | ZipDatasetResult> {
  const shapefileFiles = getShapefileFilesFromArchive(
    extraction.files,
    extraction.shapefileBaseName!
  );

  const shpExtracted = shapefileFiles.find((f) =>
    f.name.toLowerCase().endsWith('.shp')
  );
  if (!shpExtracted) {
    throw new Error(m.pipeline_error_shp_not_found());
  }

  const shpFile = createFileFromExtracted(shpExtracted);
  const companionFiles = shapefileFiles
    .filter((f) => !f.name.toLowerCase().endsWith('.shp'))
    .map((f) => createFileFromExtracted(f));

  const dataset = await processFileInternal(shpFile, {
    originalName: `${extraction.shapefileBaseName}.shp`,
    companionFiles
  });

  dataset.sourceFileId = file.name;
  dataset.name = extraction.shapefileBaseName!;

  logger.success('Shapefile from ZIP processed', LogCategory.DATA, {
    datasetId: dataset.id,
    baseName: extraction.shapefileBaseName,
    durationMs: (performance.now() - start).toFixed(2)
  });

  const otherFiles = getNonShapefileFilesFromArchive(
    extraction.files,
    extraction.shapefileBaseName!
  );

  if (otherFiles.length === 0) {
    return dataset;
  }

  return processAdditionalFiles(file, dataset, otherFiles, start);
}

async function processAdditionalFiles(
  file: File,
  shapefileDataset: DatasetResult,
  otherFiles: Awaited<ReturnType<typeof extractZip>>['files'],
  _start: number
): Promise<DatasetResult | ZipDatasetResult> {
  const additionalDatasets: DatasetResult[] = [];
  const skippedOtherFiles: string[] = [];

  for (const extractedFileInfo of otherFiles) {
    try {
      const extractedFile = createFileFromExtracted(extractedFileInfo);
      const additionalDataset = await processFileInternal(extractedFile, {
        originalName: extractedFileInfo.name
      });

      additionalDataset.sourceFileId = file.name;
      additionalDataset.name = extractedFileInfo.name;

      additionalDatasets.push(additionalDataset);
    } catch (error) {
      logger.warn(
        'Failed to process additional file from ZIP',
        LogCategory.DATA,
        {
          fileName: extractedFileInfo.name,
          error
        }
      );
      skippedOtherFiles.push(extractedFileInfo.name);
    }
  }

  if (additionalDatasets.length === 0) {
    return shapefileDataset;
  }

  const allDatasets = [shapefileDataset, ...additionalDatasets];
  return {
    datasets: allDatasets,
    sourceZipName: file.name,
    totalFiles: otherFiles.length + 1,
    processedFiles: allDatasets.length,
    skippedFiles: skippedOtherFiles
  } satisfies ZipDatasetResult;
}

async function processGenericZip(
  file: File,
  extraction: Awaited<ReturnType<typeof extractZip>>,
  start: number
): Promise<DatasetResult | ZipDatasetResult> {
  const supportedFiles = getSupportedFilesFromArchive(extraction.files);

  if (supportedFiles.length === 0) {
    throw new Error(m.pipeline_error_no_supported_files());
  }

  if (supportedFiles.length === 1) {
    return processSingleFileFromZip(file, supportedFiles[0], start);
  }

  return processMultipleFilesFromZip(file, supportedFiles, start);
}

async function processSingleFileFromZip(
  zipFile: File,
  extractedFileInfo: ExtractedFile,
  start: number
): Promise<DatasetResult> {
  const extractedFile = createFileFromExtracted(extractedFileInfo);

  const dataset = await processFileInternal(extractedFile, {
    originalName: extractedFileInfo.name
  });

  dataset.sourceFileId = zipFile.name;
  dataset.name = extractedFileInfo.name;

  logger.success('File from ZIP processed', LogCategory.DATA, {
    datasetId: dataset.id,
    extractedFile: extractedFileInfo.name,
    durationMs: (performance.now() - start).toFixed(2)
  });

  return dataset;
}

async function processMultipleFilesFromZip(
  zipFile: File,
  supportedFiles: ExtractedFile[],
  start: number
): Promise<ZipDatasetResult> {
  const datasets: DatasetResult[] = [];
  const skippedFiles: string[] = [];

  for (const extractedFileInfo of supportedFiles) {
    try {
      const extractedFile = createFileFromExtracted(extractedFileInfo);
      const dataset = await processFileInternal(extractedFile, {
        originalName: extractedFileInfo.name
      });

      dataset.sourceFileId = zipFile.name;
      dataset.name = extractedFileInfo.name;
      datasets.push(dataset);
    } catch (error) {
      logger.warn(
        'Failed to process file from ZIP, skipping',
        LogCategory.DATA,
        {
          fileName: extractedFileInfo.name,
          error
        }
      );
      skippedFiles.push(extractedFileInfo.name);
    }
  }

  if (datasets.length === 0) {
    throw new Error(m.pipeline_error_no_supported_files());
  }

  const result: ZipDatasetResult = {
    datasets,
    sourceZipName: zipFile.name,
    totalFiles: supportedFiles.length,
    processedFiles: datasets.length,
    skippedFiles
  };

  logger.success('ZIP archive processed', LogCategory.DATA, {
    sourceZip: zipFile.name,
    processedCount: datasets.length,
    skippedCount: skippedFiles.length,
    durationMs: (performance.now() - start).toFixed(2)
  });

  return result;
}
