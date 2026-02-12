import type {
  DatasetResult,
  EnrichedColumn,
  ZipDatasetResult
} from '$lib/features/data-pipeline';
import {
  ColumnType,
  dataPipeline,
  isZipDatasetResult
} from '$lib/features/data-pipeline';
import type { UploadedFile } from '../create-project.types';
import type { DatasetsState, DatasetsInternals } from './datasets-state.svelte';
import { startProcessing, endProcessing } from './datasets-state.svelte';
import { LogCategory, logger } from '../../utils/logger';
import { DuplicateFileError } from '../../errors/pipeline.errors';
import * as m from '$lib/paraglide/messages';
import { showWarning } from '../../utils/notification.utils.svelte';

export interface VisualizationConfig {
  id: string;
  datasetId: string;
}

export enum VisualizationType {
  CHOROPLETH = 'choropleth',
  PROPORTIONAL = 'proportional',
  CATEGORICAL = 'categorical',
  BIVARIATE = 'bivariate'
}

export interface VisualizationStoreOperations {
  getVisualizationsByDataset: (datasetId: string) => VisualizationConfig[];
  removeVisualization: (id: string) => void;
  createVisualization: (
    type: VisualizationType,
    datasetId: string,
    name: string
  ) => void;
}

export function createDatasetFromPreprocessedFile(
  file: UploadedFile
): DatasetResult {
  const statistics = file.statistics as Record<
    string,
    {
      type?: string;
      count?: number;
      nullCount?: number;
      unique?: number;
      min?: unknown;
      max?: unknown;
      mean?: number;
    }
  >;

  const columns: EnrichedColumn[] = Object.entries(statistics || {}).map(
    ([name, stats]) => ({
      name,
      values: [],
      type: (stats.type as ColumnType) || ColumnType.TEXT,
      stats: {
        name,
        type: (stats.type as ColumnType) || ColumnType.TEXT,
        count: stats.count ?? 0,
        nulls: stats.nullCount ?? 0,
        uniques: stats.unique ?? 0,
        min: stats.min,
        max: stats.max,
        mean: stats.mean
      }
    })
  );

  const data = file.parsedData as Record<string, unknown>[] | undefined;
  const firstColStats = Object.values(statistics)[0];
  const actualRowCount = firstColStats?.count ?? data?.length ?? 0;

  const tableName =
    file.duckdbTableName ??
    `legacy_${file.name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;

  return {
    id: crypto.randomUUID(),
    name: file.name,
    sourceFileId: file.id,
    tableName,
    columns,
    rowCount: actualRowCount,
    metadata: {
      processedAt: new Date(),
      fileType: file.fileType,
      parserUsed: file.duckdbTableName ? 'zip-preprocessed' : 'legacy-parsed'
    },
    data,
    fileSize: file.size,
    geoDetection: file.deepAnalysis?.geoDetection,
    createdAt: new Date()
  };
}

export function createVisualizationsForGeoDatasets(
  datasets: DatasetResult[],
  ops?: VisualizationStoreOperations | null
): void {
  if (!ops) {
    logger.warn(
      'Visualization store not injected, skipping auto-visualization creation',
      LogCategory.STORE
    );
    return;
  }

  for (const dataset of datasets) {
    if (dataset.geometry) {
      const existingViz = ops.getVisualizationsByDataset(dataset.id);
      if (existingViz.length === 0) {
        ops.createVisualization(
          VisualizationType.CHOROPLETH,
          dataset.id,
          dataset.name
        );
        logger.debug(
          `Created visualization for geo dataset: ${dataset.name}`,
          LogCategory.STORE
        );
      }
    }
  }
}

function notifySkippedFiles(
  results: (DatasetResult | ZipDatasetResult)[]
): void {
  const allSkippedFiles: string[] = [];

  for (const result of results) {
    if (isZipDatasetResult(result) && result.skippedFiles.length > 0) {
      allSkippedFiles.push(...result.skippedFiles);
    }
  }

  if (allSkippedFiles.length > 0) {
    showWarning(
      m.warning_zip_files_skipped_title(),
      m.warning_zip_files_skipped_message({
        files: allSkippedFiles.join(', ')
      })
    );
    logger.warn('Some files from ZIP were skipped', LogCategory.STORE, {
      skippedFiles: allSkippedFiles
    });
  }
}

export async function processFiles(
  state: DatasetsState,
  internals: DatasetsInternals,
  files: UploadedFile[],
  vizOps?: VisualizationStoreOperations | null
): Promise<void> {
  startProcessing();
  state.error = undefined;

  try {
    logger.info(
      `Processing ${files.length} files with semaphore (max 2 concurrent)`,
      LogCategory.STORE
    );

    const results = await Promise.all(
      files.map(async (file) => {
        return internals.processingSemaphore.run(async () => {
          logger.debug(
            `Processing file: ${file.name} (active: ${internals.processingSemaphore.activeCount}, queued: ${internals.processingSemaphore.queuedCount})`,
            LogCategory.STORE
          );

          if (file.duckdbTableName) {
            logger.debug(
              `Using pre-processed data for: ${file.name} (table: ${file.duckdbTableName})`,
              LogCategory.STORE
            );
            return createDatasetFromPreprocessedFile(file);
          }

          if (
            !file.content &&
            !file.originalFile &&
            file.parsedData &&
            file.statistics
          ) {
            logger.warn(
              `File ${file.name} has parsed data but no DuckDB table - creating from parsed data`,
              LogCategory.STORE
            );
            return createDatasetFromPreprocessedFile(file);
          }

          if (!file.content && !file.originalFile) {
            throw new Error(`File ${file.name} has no content or originalFile`);
          }

          const result = await dataPipeline.processUploadedFile(
            file,
            file.originalFile
          );

          logger.debug(`Completed processing: ${file.name}`, LogCategory.STORE);
          return result;
        });
      })
    );

    const newDatasets: DatasetResult[] = results.flatMap((result) =>
      isZipDatasetResult(result) ? result.datasets : [result]
    );

    state.datasets = [...state.datasets, ...newDatasets];

    for (const dataset of newDatasets) {
      state.enabledDatasetIds.add(dataset.id);
    }

    if (newDatasets.length > 0 && !state.selectedDatasetId) {
      state.selectedDatasetId = newDatasets[0].id;
    }

    const geoDatasets = newDatasets.filter((d) => d.geometry);
    if (geoDatasets.length > 0) {
      createVisualizationsForGeoDatasets(geoDatasets, vizOps);
    }

    notifySkippedFiles(results);

    logger.success(
      `All ${files.length} files processed successfully`,
      LogCategory.STORE
    );
  } catch (error) {
    logger.error('Files processing failed', LogCategory.STORE, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    state.error = error instanceof Error ? error.message : 'Processing failed';
    throw error;
  } finally {
    endProcessing();
  }
}

export async function addFile(
  state: DatasetsState,
  internals: DatasetsInternals,
  file: UploadedFile,
  vizOps?: VisualizationStoreOperations | null,
  autoEnable = true
): Promise<DatasetResult | null> {
  const startTime = performance.now();

  startProcessing();
  state.error = undefined;
  let addedDataset: DatasetResult | null = null;

  try {
    const result = await internals.processingSemaphore.run(async () => {
      if (file.duckdbTableName) {
        logger.debug(
          `Using pre-processed data for: ${file.name} (table: ${file.duckdbTableName})`,
          LogCategory.STORE
        );
        return createDatasetFromPreprocessedFile(file);
      }

      if (
        !file.content &&
        !file.originalFile &&
        file.parsedData &&
        file.statistics
      ) {
        logger.warn(
          `File ${file.name} has parsed data but no DuckDB table - creating from parsed data`,
          LogCategory.STORE
        );
        return createDatasetFromPreprocessedFile(file);
      }

      if (!file.content && !file.originalFile) {
        throw new Error(`File ${file.name} has no content or originalFile`);
      }

      logger.debug(
        `Processing single file: ${file.name} (active: ${internals.processingSemaphore.activeCount})`,
        LogCategory.STORE
      );

      return await dataPipeline.processUploadedFile(file, file.originalFile);
    });

    const datasets: DatasetResult[] = isZipDatasetResult(result)
      ? result.datasets
      : [result];

    for (const dataset of datasets) {
      const existingDataset = state.datasets.find(
        (d) => d.sourceFileId === dataset.sourceFileId
      );

      if (existingDataset) {
        state.datasets = state.datasets.map((d) =>
          d.sourceFileId === dataset.sourceFileId ? dataset : d
        );
        if (state.selectedDatasetId === existingDataset.id) {
          state.selectedDatasetId = dataset.id;
        }

        if (!addedDataset) addedDataset = dataset;
        throw new DuplicateFileError(
          `Le fichier "${file.name}" existe déjà et a été remplacé`,
          file.name,
          {
            existingDatasetId: existingDataset.id,
            newDatasetId: dataset.id
          }
        );
      } else {
        state.datasets = [...state.datasets, dataset];
        if (autoEnable) {
          state.enabledDatasetIds.add(dataset.id);
        }
      }

      if (!state.selectedDatasetId) {
        state.selectedDatasetId = dataset.id;
      }

      if (!addedDataset) addedDataset = dataset;

      const pendingResolvers = internals.pendingDatasetResolvers.get(
        dataset.sourceFileId
      );
      if (pendingResolvers?.length) {
        pendingResolvers.forEach((resolve) => resolve(dataset.id));
        internals.pendingDatasetResolvers.delete(dataset.sourceFileId);
      }
    }

    const geoDatasets = datasets.filter((d) => d.geometry);
    if (geoDatasets.length > 0) {
      createVisualizationsForGeoDatasets(geoDatasets, vizOps);
    }

    return addedDataset;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error(
      `Failed to add file to datasets store (duration: ${duration.toFixed(2)}ms)`,
      LogCategory.DATA,
      error
    );

    state.error = error instanceof Error ? error.message : 'Processing failed';
    throw error;
  } finally {
    endProcessing();
  }
}
