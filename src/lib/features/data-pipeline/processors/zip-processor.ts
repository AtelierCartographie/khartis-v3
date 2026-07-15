import * as m from '$lib/paraglide/messages';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { FileType } from '$lib/features/commons/utils/file-import.utils';
import { ParseError } from '$lib/features/commons/pipeline.errors';
import type { DatasetResult, ZipDatasetResult } from '../types';
import {
  createFileFromExtracted,
  extractZip,
  type ExtractedFile,
  getNonShapefileFilesFromArchive,
  getShapefileBundlesFromArchive,
  getSupportedFilesFromArchive,
  type ShapefileBundle
} from '../utils/zip-handler';
import { getFileExtensionWithDot } from '$lib/features/commons/utils/file.utils';
import { processFileInternal } from './file-processor';

export async function processZipFile(
  file: File
): Promise<DatasetResult | ZipDatasetResult> {
  const extraction = await extractZip(file);

  if (extraction.isShapefileArchive && extraction.shapefileBaseName) {
    return processShapefileArchive(file, extraction);
  }

  return processGenericZip(file, extraction);
}

async function processShapefileBundle(
  zipFile: File,
  bundle: ShapefileBundle
): Promise<DatasetResult> {
  const shpFile = createFileFromExtracted(bundle.shp);
  const companionFiles = bundle.companions.map((f) =>
    createFileFromExtracted(f)
  );

  const dataset = await processFileInternal(shpFile, {
    originalName: `${bundle.baseName}.shp`,
    companionFiles
  });

  dataset.sourceFileId = zipFile.name;
  dataset.name = bundle.baseName;

  return dataset;
}

async function processShapefileArchive(
  file: File,
  extraction: Awaited<ReturnType<typeof extractZip>>
): Promise<DatasetResult | ZipDatasetResult> {
  const bundle = getShapefileBundlesFromArchive(extraction.files).find(
    (candidate) => candidate.baseName === extraction.shapefileBaseName
  );
  if (!bundle) {
    throw new ParseError(m.pipeline_error_shp_not_found(), FileType.SHAPEFILE, {
      fileName: file.name
    });
  }

  const dataset = await processShapefileBundle(file, bundle);

  const otherFiles = getNonShapefileFilesFromArchive(
    extraction.files,
    extraction.shapefileBaseName!
  );

  if (otherFiles.length === 0) {
    return dataset;
  }

  return processAdditionalFiles(file, dataset, otherFiles);
}

async function processAdditionalFiles(
  file: File,
  shapefileDataset: DatasetResult,
  otherFiles: Awaited<ReturnType<typeof extractZip>>['files']
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
      logger.error(
        'Failed to process additional file from shapefile archive',
        LogCategory.DATA,
        error
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
  extraction: Awaited<ReturnType<typeof extractZip>>
): Promise<DatasetResult | ZipDatasetResult> {
  const shapefileBundles = getShapefileBundlesFromArchive(extraction.files);
  const standaloneFiles = getSupportedFilesFromArchive(extraction.files).filter(
    (extracted) => getFileExtensionWithDot(extracted.name) !== '.shp'
  );
  const totalUnits = shapefileBundles.length + standaloneFiles.length;

  if (totalUnits === 0) {
    throw new ParseError(m.pipeline_error_no_supported_files(), FileType.ZIP, {
      fileName: file.name
    });
  }

  if (totalUnits === 1) {
    return shapefileBundles.length === 1
      ? processShapefileBundle(file, shapefileBundles[0])
      : processSingleFileFromZip(file, standaloneFiles[0]);
  }

  return processMultipleUnitsFromZip(
    file,
    shapefileBundles,
    standaloneFiles,
    totalUnits
  );
}

async function processSingleFileFromZip(
  zipFile: File,
  extractedFileInfo: ExtractedFile
): Promise<DatasetResult> {
  const extractedFile = createFileFromExtracted(extractedFileInfo);

  const dataset = await processFileInternal(extractedFile, {
    originalName: extractedFileInfo.name
  });

  dataset.sourceFileId = zipFile.name;
  dataset.name = extractedFileInfo.name;

  return dataset;
}

async function processMultipleUnitsFromZip(
  zipFile: File,
  shapefileBundles: ShapefileBundle[],
  standaloneFiles: ExtractedFile[],
  totalUnits: number
): Promise<ZipDatasetResult> {
  const datasets: DatasetResult[] = [];
  const skippedFiles: string[] = [];

  for (const bundle of shapefileBundles) {
    try {
      datasets.push(await processShapefileBundle(zipFile, bundle));
    } catch (error) {
      logger.error(
        'Failed to process shapefile bundle from ZIP archive',
        LogCategory.DATA,
        error
      );
      skippedFiles.push(bundle.shp.name);
    }
  }

  for (const extractedFileInfo of standaloneFiles) {
    try {
      const extractedFile = createFileFromExtracted(extractedFileInfo);
      const dataset = await processFileInternal(extractedFile, {
        originalName: extractedFileInfo.name
      });

      dataset.sourceFileId = zipFile.name;
      dataset.name = extractedFileInfo.name;
      datasets.push(dataset);
    } catch (error) {
      logger.error(
        'Failed to process file from ZIP archive',
        LogCategory.DATA,
        error
      );
      skippedFiles.push(extractedFileInfo.name);
    }
  }

  if (datasets.length === 0) {
    throw new ParseError(m.pipeline_error_no_supported_files(), FileType.ZIP, {
      fileName: zipFile.name,
      skippedFiles
    });
  }

  const result: ZipDatasetResult = {
    datasets,
    sourceZipName: zipFile.name,
    totalFiles: totalUnits,
    processedFiles: datasets.length,
    skippedFiles
  };

  return result;
}
