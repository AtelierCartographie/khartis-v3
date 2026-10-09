import { ParseError } from '$lib/features/commons/pipeline.errors';
import { FileType } from '$lib/features/commons/utils/file-import.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { Duck } from '$lib/features/duckdb';
import * as m from '$lib/paraglide/messages';
import type { DatasetResult, ZipDatasetResult } from '../types';
import { processFileInternal } from './file-processor';

/**
 * Reads every spatial layer of a GeoPackage into its own table, the way a ZIP
 * holding several files is read. Returns null when the file has at most one
 * spatial layer, so the caller keeps the single-dataset path.
 */
export async function processGeoPackageLayers(
  file: File,
  options: { sourceFileId?: string } = {}
): Promise<ZipDatasetResult | null> {
  const layers = await Duck.list_geofile_layers(file);
  if (layers.length <= 1) {
    return null;
  }

  const datasets: DatasetResult[] = [];
  const skippedFiles: string[] = [];

  for (const [index, layer] of layers.entries()) {
    // Each layer becomes its own pending file, and a restore rebuilds the
    // table as generateTableName(layer, fileId): name it that way now so the
    // table, and every reference to it, keeps its name across a reload.
    const layerFileId =
      index === 0 && options.sourceFileId
        ? options.sourceFileId
        : crypto.randomUUID();
    try {
      const dataset = await processFileInternal(file, {
        layer,
        sourceFileId: layerFileId
      });
      dataset.id = layerFileId;
      dataset.sourceFileId = file.name;
      dataset.name = layer;
      datasets.push(dataset);
    } catch (error) {
      logger.error(
        'Failed to read a GeoPackage layer',
        LogCategory.DATA,
        error
      );
      skippedFiles.push(layer);
    }
  }

  if (datasets.length === 0) {
    throw new ParseError(
      m.pipeline_error_file_unreadable(),
      FileType.GEOPACKAGE,
      { fileName: file.name, skippedFiles }
    );
  }

  return {
    datasets,
    sourceZipName: file.name,
    totalFiles: layers.length,
    processedFiles: datasets.length,
    skippedFiles
  };
}
