import type { UploadedFile } from '$lib/features/commons/types/create-project.types';
import type { GeoArrowMetadata } from '$lib/features/commons/types/geoarrow.types';
import type { GeoDetectionResult } from '$lib/features/commons/utils/geo-detector.utils';
import { LogCategory, logger } from '$lib/features/commons/utils/logger';
import { escapeSqlString } from '$lib/features/commons/utils/sanitize.utils';
import { generateTableName } from '$lib/features/data-pipeline';
import {
  getProcessor,
  hasProcessor,
  type ProcessContext
} from '$lib/features/data-pipeline/processors/processor-registry';
import { registerAllProcessors } from '$lib/features/data-pipeline/processors/register-processors';
import type { Table } from 'apache-arrow/Arrow';
import { FileType, type AnalysisResult, type DuckDBDataset } from '../types';
import * as datasetState from './dataset-state';
import type { DuckDBClientForFileProcessing } from './file-processors';
import {
  bumpDatasetsVersion,
  findDatasetByIdOrSourceFile,
  getState,
  setCurrentTableName,
  updateDatasets
} from './state.svelte';

export interface DuckDBClientForDataset {
  query(sql: string, options?: { format?: string }): Promise<unknown>;
  analyse(
    tableName: string,
    options?: { force?: boolean }
  ): Promise<AnalysisResult[]>;
  cleanupTableResources?(tableName: string): void;
}

export interface DatasetCallbacks {
  getRowCount: (tableName: string) => Promise<number>;
  createArrowTableWithMetadata: (tableName: string) => Promise<{
    arrowTableWithMetadata: Table;
    geoArrowMetadata: GeoArrowMetadata | null;
  }>;
  prefetchArrowMetadata: (dataset: DuckDBDataset) => Promise<void> | undefined;
}

function scheduleArrowMetadataPrefetch(
  dataset: DuckDBDataset,
  callbacks: DatasetCallbacks
): void {
  const prefetchPromise = callbacks.prefetchArrowMetadata(dataset);
  if (!prefetchPromise) {
    return;
  }

  void prefetchPromise.catch((error) => {
    logger.debug(
      'Arrow metadata prefetch failed after dataset registration',
      LogCategory.DUCKDB,
      {
        datasetId: dataset.id,
        tableName: dataset.tableName,
        error
      }
    );
  });
}

export async function registerExistingTable(
  tableName: string,
  sourceFileId: string,
  fileName: string,
  Duck: DuckDBClientForDataset,
  callbacks: DatasetCallbacks,
  options?: {
    geoDetection?: GeoDetectionResult;
    preserveExistingJoinState?: boolean;
    preferredDatasetId?: string;
  }
): Promise<DuckDBDataset | null> {
  const start = performance.now();

  try {
    const escapedTableNameForCheck = escapeSqlString(tableName);
    const tableCheck = (await Duck.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = '${escapedTableNameForCheck}'`,
      { format: 'array' }
    )) as Array<{ table_name: string }>;

    if (!tableCheck || tableCheck.length === 0) {
      logger.warn(
        'Table does not exist in DuckDB, needs re-processing',
        LogCategory.DUCKDB,
        { tableName, sourceFileId }
      );
      return null;
    }

    const columns = await Duck.analyse(tableName);
    const rowCount = await callbacks.getRowCount(tableName);
    const existingDataset = findDatasetByIdOrSourceFile(sourceFileId);
    const preservedDataset =
      options?.preserveExistingJoinState === false ? null : existingDataset;

    const dataset: DuckDBDataset = {
      id:
        options?.preferredDatasetId ??
        existingDataset?.id ??
        crypto.randomUUID(),
      tableName,
      sourceFileId,
      name: fileName,
      columns,
      rowCount,
      metadata: {
        processedAt: new Date(),
        fileType: FileType.CSV
      },
      geoDetection: options?.geoDetection,
      joinedBasemap: preservedDataset?.joinedBasemap,
      geoColumn: preservedDataset?.geoColumn,
      gpsMode: preservedDataset?.gpsMode,
      gpsColumns: preservedDataset?.gpsColumns
    };

    updateDatasets((datasets) => {
      for (const [id, existing] of datasets.entries()) {
        if (existing.sourceFileId === sourceFileId && id !== dataset.id) {
          datasets.delete(id);
        }
      }
      datasets.set(dataset.id, dataset);
    });

    scheduleArrowMetadataPrefetch(dataset, callbacks);

    bumpDatasetsVersion();
    setCurrentTableName(tableName);

    logger.info('DuckDB table registered', LogCategory.DUCKDB, {
      tableName,
      datasetId: dataset.id,
      durationMs: (performance.now() - start).toFixed(2)
    });
    return dataset;
  } catch (error) {
    logger.error(
      'Failed to register existing table',
      LogCategory.DUCKDB,
      error
    );
    return null;
  }
}

export async function processFile(
  file: UploadedFile,
  Duck: DuckDBClientForDataset & DuckDBClientForFileProcessing,
  callbacks: DatasetCallbacks
): Promise<DuckDBDataset | null> {
  const startTime = performance.now();

  if (!file.parsedData || file.status !== 'complete') {
    return null;
  }

  registerAllProcessors();

  try {
    const tableName = generateTableName(file.name);

    if (!hasProcessor(file)) {
      logger.warn(
        'Unsupported file type for DuckDB ingestion',
        LogCategory.DUCKDB,
        { fileId: file.id, fileType: file.fileType }
      );
      return null;
    }

    const processor = getProcessor(file);
    if (!processor) {
      return null;
    }

    const ctx: ProcessContext = {
      Duck,
      callbacks: {
        getRowCount: callbacks.getRowCount,
        createArrowTableWithMetadata: callbacks.createArrowTableWithMetadata
      },
      tableName
    };

    const processorResult = await processor.process(ctx, file);

    const result: DuckDBDataset = {
      id: processorResult.id,
      tableName: processorResult.tableName,
      sourceFileId: processorResult.sourceFileId,
      name: processorResult.name,
      columns: processorResult.columns as AnalysisResult[],
      rowCount: processorResult.rowCount,
      metadata: processorResult.metadata,
      geoDetection:
        processorResult.geoDetection as DuckDBDataset['geoDetection'],
      arrowTableWithMetadata: processorResult.arrowTableWithMetadata,
      geoArrowMetadata: processorResult.geoArrowMetadata
    };

    updateDatasets((datasets) => {
      datasets.set(result.id, result);
    });
    scheduleArrowMetadataPrefetch(result, callbacks);
    bumpDatasetsVersion();
    setCurrentTableName(result.tableName);

    restoreJoinState(result, file);

    const totalDuration = performance.now() - startTime;
    logger.success('File processed via DuckDB', LogCategory.DUCKDB, {
      fileId: file.id,
      datasetId: result.id,
      fileType: file.fileType,
      durationMs: totalDuration.toFixed(2)
    });

    return result;
  } catch (error) {
    const errorDuration = performance.now() - startTime;
    logger.error(
      `[DuckDB:processFile] ERROR After ${errorDuration.toFixed(2)}ms`,
      LogCategory.DUCKDB,
      error
    );
    throw error;
  }
}

function restoreJoinState(dataset: DuckDBDataset, file: UploadedFile): void {
  const updates = datasetState.restoreJoinStateFromFile(dataset, file);
  if (!updates) return;

  updateDatasets((datasets) => {
    const ds = datasets.get(dataset.id);
    if (ds) {
      Object.assign(ds, updates);
    }
  });
  bumpDatasetsVersion();
}

export async function dropTable(
  tableName: string,
  Duck: DuckDBClientForDataset
): Promise<void> {
  const start = performance.now();
  const state = getState();

  try {
    await Duck.query(`DROP TABLE IF EXISTS "${tableName}"`);

    let idToDelete: string | undefined;
    for (const [id, dataset] of state.datasets.entries()) {
      if (dataset.tableName === tableName) {
        idToDelete = id;
        break;
      }
    }

    if (idToDelete) {
      updateDatasets((datasets) => {
        datasets.delete(idToDelete!);
      });
      bumpDatasetsVersion();
    }

    if (state.currentTableName === tableName) {
      setCurrentTableName(null);
    }

    // Clear cached metadata for the dropped table (prevents reference leaks)
    Duck.cleanupTableResources?.(tableName);

    logger.info('Dropped DuckDB table', LogCategory.DUCKDB, {
      tableName,
      durationMs: (performance.now() - start).toFixed(2)
    });
  } catch (error) {
    logger.error(
      '[duckDBOrchestrator:dropTable] ERROR',
      LogCategory.DUCKDB,
      error
    );
  }
}

export function updateDatasetColumns(
  datasetId: string,
  columns: AnalysisResult[]
): void {
  updateDatasets((datasets) => {
    const ds = datasets.get(datasetId);
    if (ds) {
      ds.columns = columns;
    }
  });
  bumpDatasetsVersion();
}

export function updateDatasetJoinInfo(
  datasetId: string,
  joinInfo: Partial<
    Pick<
      DuckDBDataset,
      'joinedBasemap' | 'geoColumn' | 'gpsMode' | 'gpsColumns'
    >
  >
): void {
  updateDatasets((datasets) => {
    const ds = datasets.get(datasetId);
    if (ds) {
      if ('joinedBasemap' in joinInfo) {
        ds.joinedBasemap = joinInfo.joinedBasemap;
      }
      if ('geoColumn' in joinInfo) {
        ds.geoColumn = joinInfo.geoColumn;
      }
      if ('gpsMode' in joinInfo) {
        ds.gpsMode = joinInfo.gpsMode;
      }
      if ('gpsColumns' in joinInfo) {
        ds.gpsColumns = joinInfo.gpsColumns;
      }

      if (joinInfo.gpsMode === false) {
        ds.gpsColumns = undefined;
      }

      if (joinInfo.gpsMode === true) {
        ds.geoColumn = undefined;
      }

      ds.arrowTableWithMetadata = undefined;
    }
  });
  bumpDatasetsVersion();
}

export async function updateDatasetTableName(
  sourceFileId: string,
  newTableName: string,
  Duck: DuckDBClientForDataset,
  callbacks: DatasetCallbacks
): Promise<DuckDBDataset | null> {
  const existing = findDatasetByIdOrSourceFile(sourceFileId);
  if (!existing) {
    logger.warn(
      'Cannot update table name: dataset not found in orchestrator',
      LogCategory.DUCKDB,
      { sourceFileId, newTableName }
    );
    return null;
  }

  try {
    const columns = await Duck.analyse(newTableName);
    const rowCount = await callbacks.getRowCount(newTableName);

    updateDatasets((datasets) => {
      const ds = datasets.get(existing.id);
      if (ds) {
        ds.tableName = newTableName;
        ds.columns = columns;
        ds.rowCount = rowCount;
        ds.arrowTableWithMetadata = undefined;
      }
    });

    bumpDatasetsVersion();
    setCurrentTableName(newTableName);

    logger.info(
      'Updated dataset table name in orchestrator',
      LogCategory.DUCKDB,
      {
        datasetId: existing.id,
        oldTableName: existing.tableName,
        newTableName,
        rowCount
      }
    );

    return findDatasetByIdOrSourceFile(sourceFileId) ?? null;
  } catch (error) {
    logger.error(
      'Failed to update dataset table name',
      LogCategory.DUCKDB,
      error
    );
    return null;
  }
}

export { findDatasetByIdOrSourceFile };
