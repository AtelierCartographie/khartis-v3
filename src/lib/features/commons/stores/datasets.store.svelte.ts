import type {
  CsvImportOptions,
  DatasetResult
} from '$lib/features/data-pipeline';
import {
  SavePriority,
  persistenceRegistry
} from '$lib/features/project-management/core';
import type { SerializedDatasetsViewState } from '$lib/types/serialization.types';
import { LogCategory, logger } from '../utils/logger';
import type { UploadedFile } from '../types/create-project.types';
import { deserializeDatasetsViewState } from '../utils/datasets-view-state.utils';
import {
  datasetsState,
  datasetsInternals,
  clearState,
  getSelectedDataset,
  selectDataset as selectDatasetFn,
  getDatasetBySourceFile as getDatasetBySourceFileFn,
  getDatasetsByType as getDatasetsByTypeFn,
  getAllDatasets as getAllDatasetsFn,
  isDatasetEnabled as isDatasetEnabledFn,
  toggleDatasetVisibility as toggleDatasetVisibilityFn,
  enableDataset as enableDatasetFn,
  disableDataset as disableDatasetFn,
  getEnabledDatasets,
  hideColumn as hideColumnFn,
  showColumn as showColumnFn,
  toggleColumnHidden as toggleColumnHiddenFn,
  isColumnHidden as isColumnHiddenFn,
  getHiddenColumns as getHiddenColumnsFn,
  getVisibleColumns as getVisibleColumnsFn,
  renameDatasetColumn as renameDatasetColumnFn,
  getColumnValues as getColumnValuesFn,
  getUniqueValues as getUniqueValuesFn,
  getColumnStatistics as getColumnStatisticsFn,
  processFiles as processFilesFn,
  addFile as addFileFn,
  addProcessedDataset as addProcessedDatasetFn,
  removeDataset as removeDatasetFn,
  deleteDataset as deleteDatasetFn,
  updateDataset as updateDatasetFn,
  updateDatasetJoinBasemap as updateDatasetJoinBasemapFn,
  updateDatasetRowCount as updateDatasetRowCountFn,
  updateDatasetTableName as updateDatasetTableNameFn,
  updateDatasetCsvOptions as updateDatasetCsvOptionsFn,
  renameDataset as renameDatasetFn,
  hasModifications as hasModificationsFn,
  recordTransformation as recordTransformationFn,
  waitForDatasetBySourceFile as waitForDatasetBySourceFileFn,
  resetDataset as resetDatasetFn,
  duplicateDataset as duplicateDatasetFn,
  createVisualizationsForGeoDatasets,
  VisualizationType,
  type VisualizationConfig,
  type VisualizationStoreOperations
} from './datasets';

export { VisualizationType };
export type { VisualizationConfig, VisualizationStoreOperations };

function createDatasetsStore() {
  let visualizationStoreOps: VisualizationStoreOperations | null = null;
  let pendingPersistedViewState: SerializedDatasetsViewState | null = null;

  function notifyPersistence(
    priority: keyof typeof SavePriority = 'DEBOUNCED'
  ): void {
    persistenceRegistry.notifyChange('datasetsView', SavePriority[priority]);
  }

  function serializeViewState(): SerializedDatasetsViewState {
    if (datasetsState.datasets.length === 0 && pendingPersistedViewState) {
      return {
        enabledSourceFileIds: [
          ...(pendingPersistedViewState.enabledSourceFileIds ?? [])
        ],
        hiddenColumnsBySourceFileId: {
          ...(pendingPersistedViewState.hiddenColumnsBySourceFileId ?? {})
        },
        simplificationBySourceFileId: {
          ...(pendingPersistedViewState.simplificationBySourceFileId ?? {})
        }
      };
    }

    const enabledSourceFileIds = datasetsState.datasets.flatMap((dataset) =>
      dataset.sourceFileId && datasetsState.enabledDatasetIds.has(dataset.id)
        ? [dataset.sourceFileId]
        : []
    );

    const hiddenColumnsBySourceFileId = Object.fromEntries(
      datasetsState.datasets.flatMap((dataset) => {
        if (!dataset.sourceFileId) {
          return [];
        }

        const hiddenColumns = getHiddenColumnsFn(datasetsState, dataset.id);
        return hiddenColumns.length > 0
          ? [[dataset.sourceFileId, hiddenColumns]]
          : [];
      })
    );

    const simplificationBySourceFileId = Object.fromEntries(
      datasetsState.datasets.flatMap((dataset) =>
        dataset.sourceFileId && dataset.simplificationApplied
          ? [[dataset.sourceFileId, dataset.simplificationApplied]]
          : []
      )
    );

    return {
      enabledSourceFileIds,
      hiddenColumnsBySourceFileId,
      simplificationBySourceFileId
    };
  }

  function restorePersistedViewState(data: unknown): void {
    pendingPersistedViewState = deserializeDatasetsViewState(data);
  }

  function applyPersistedViewState(): void {
    if (!pendingPersistedViewState) {
      return;
    }

    const enabledSourceFileIds = new Set(
      pendingPersistedViewState.enabledSourceFileIds ?? []
    );
    const hiddenColumnsBySourceFileId =
      pendingPersistedViewState.hiddenColumnsBySourceFileId ?? {};
    const simplificationBySourceFileId =
      pendingPersistedViewState.simplificationBySourceFileId ?? {};

    datasetsState.enabledDatasetIds.clear();
    datasetsState.hiddenColumns = new Map();

    for (const dataset of datasetsState.datasets) {
      if (!dataset.sourceFileId) {
        continue;
      }

      if (enabledSourceFileIds.has(dataset.sourceFileId)) {
        enableDatasetFn(datasetsState, dataset.id);
      }

      const hiddenColumns = hiddenColumnsBySourceFileId[dataset.sourceFileId];
      for (const columnName of hiddenColumns ?? []) {
        hideColumnFn(datasetsState, dataset.id, columnName);
      }

      updateDatasetFn(datasetsState, dataset.id, {
        simplificationApplied:
          simplificationBySourceFileId[dataset.sourceFileId] ?? undefined
      });
    }

    if (
      datasetsState.enabledDatasetIds.size === 0 &&
      datasetsState.datasets.length === 1
    ) {
      const fallbackDataset =
        datasetsState.datasets.find(
          (dataset) => dataset.id === datasetsState.selectedDatasetId
        ) ?? datasetsState.datasets[0];

      if (fallbackDataset) {
        enableDatasetFn(datasetsState, fallbackDataset.id);
        logger.warn(
          'Persisted datasets view restored with no visible dataset, re-enabling the only dataset',
          LogCategory.STORE,
          {
            datasetId: fallbackDataset.id,
            sourceFileId: fallbackDataset.sourceFileId
          }
        );
      }
    }

    pendingPersistedViewState = serializeViewState();
  }

  function injectVisualizationStore(ops: VisualizationStoreOperations): void {
    visualizationStoreOps = ops;
  }

  function isDatasetEnabled(datasetId: string): boolean {
    return isDatasetEnabledFn(datasetsState, datasetId);
  }

  function toggleDatasetVisibility(datasetId: string): void {
    toggleDatasetVisibilityFn(datasetsState, datasetId);
    notifyPersistence('IMMEDIATE');
  }

  function enableDataset(datasetId: string): void {
    enableDatasetFn(datasetsState, datasetId);
    notifyPersistence('IMMEDIATE');
  }

  function disableDataset(datasetId: string): void {
    disableDatasetFn(datasetsState, datasetId);
    notifyPersistence('IMMEDIATE');
  }

  function syncMapVisibilityWithSourceFile(sourceFileId: string): void {
    let didUpdateVisibility = false;

    for (const dataset of datasetsState.datasets) {
      const shouldBeEnabled = dataset.sourceFileId === sourceFileId;
      const isEnabled = isDatasetEnabledFn(datasetsState, dataset.id);

      if (shouldBeEnabled && !isEnabled) {
        enableDatasetFn(datasetsState, dataset.id);
        didUpdateVisibility = true;
      } else if (!shouldBeEnabled && isEnabled) {
        disableDatasetFn(datasetsState, dataset.id);
        didUpdateVisibility = true;
      }
    }

    if (didUpdateVisibility) {
      notifyPersistence('IMMEDIATE');
    }
  }

  function addProcessedDataset(dataset: DatasetResult): void {
    addProcessedDatasetFn(datasetsState, dataset);
  }

  async function processFiles(files: UploadedFile[]): Promise<void> {
    return processFilesFn(datasetsState, datasetsInternals, files);
  }

  async function addFile(
    file: UploadedFile,
    autoEnable = true
  ): Promise<DatasetResult | null> {
    return addFileFn(datasetsState, datasetsInternals, file, autoEnable);
  }

  function selectDataset(datasetId: string): void {
    selectDatasetFn(datasetsState, datasetId);
  }

  function removeDataset(datasetId: string): void {
    removeDatasetFn(datasetsState, datasetId);
  }

  async function deleteDataset(datasetId: string): Promise<boolean> {
    return deleteDatasetFn(datasetsState, datasetId, visualizationStoreOps);
  }

  function updateDataset(
    datasetId: string,
    updates: Partial<
      Pick<
        DatasetResult,
        'tableName' | 'columns' | 'simplificationApplied' | 'metadata'
      >
    >
  ): void {
    updateDatasetFn(datasetsState, datasetId, updates);
    if ('simplificationApplied' in updates) {
      notifyPersistence('IMMEDIATE');
    }
  }

  function updateDatasetJoinBasemap(
    datasetId: string,
    joinedBasemap: string
  ): void {
    updateDatasetJoinBasemapFn(datasetsState, datasetId, joinedBasemap);
  }

  function getAllDatasets(): DatasetResult[] {
    return getAllDatasetsFn(datasetsState);
  }

  function getDatasetBySourceFile(
    sourceFileId: string
  ): DatasetResult | undefined {
    return getDatasetBySourceFileFn(datasetsState, sourceFileId);
  }

  function waitForDatasetBySourceFile(
    sourceFileId: string,
    timeoutMs?: number
  ): Promise<string> {
    return waitForDatasetBySourceFileFn(
      datasetsState,
      datasetsInternals,
      sourceFileId,
      timeoutMs
    );
  }

  function getDatasetsByType(hasGeometry: boolean): DatasetResult[] {
    return getDatasetsByTypeFn(datasetsState, hasGeometry);
  }

  function getColumnValues(datasetId: string, columnName: string): unknown[] {
    return getColumnValuesFn(datasetsState, datasetId, columnName);
  }

  function getUniqueValues(datasetId: string, columnName: string): unknown[] {
    return getUniqueValuesFn(datasetsState, datasetId, columnName);
  }

  function getColumnStatistics(datasetId: string, columnName: string) {
    return getColumnStatisticsFn(datasetsState, datasetId, columnName);
  }

  async function resetDataset(datasetId: string): Promise<boolean> {
    return resetDatasetFn(datasetsState, datasetId, visualizationStoreOps);
  }

  function hasModifications(datasetId: string): boolean {
    return hasModificationsFn(datasetsState, datasetId);
  }

  function recordTransformation(datasetId: string, description: string): void {
    recordTransformationFn(datasetsState, datasetId, description);
  }

  function updateDatasetRowCount(datasetId: string, rowCount: number): void {
    updateDatasetRowCountFn(datasetsState, datasetId, rowCount);
  }

  function renameDatasetColumn(
    datasetId: string,
    oldName: string,
    newName: string
  ): void {
    renameDatasetColumnFn(datasetsState, datasetId, oldName, newName);
  }

  async function renameDataset(
    datasetId: string,
    newName: string
  ): Promise<boolean> {
    return renameDatasetFn(datasetsState, datasetId, newName);
  }

  function updateDatasetTableName(datasetId: string, tableName: string): void {
    updateDatasetTableNameFn(datasetsState, datasetId, tableName);
  }

  function updateDatasetCsvOptions(
    datasetId: string,
    csvOptions: CsvImportOptions
  ): void {
    updateDatasetCsvOptionsFn(datasetsState, datasetId, csvOptions);
  }

  function hideColumn(datasetId: string, columnName: string): void {
    hideColumnFn(datasetsState, datasetId, columnName);
    notifyPersistence('IMMEDIATE');
  }

  function showColumn(datasetId: string, columnName: string): void {
    showColumnFn(datasetsState, datasetId, columnName);
    notifyPersistence('IMMEDIATE');
  }

  function toggleColumnHidden(datasetId: string, columnName: string): void {
    toggleColumnHiddenFn(datasetsState, datasetId, columnName);
    notifyPersistence('IMMEDIATE');
  }

  function isColumnHidden(datasetId: string, columnName: string): boolean {
    return isColumnHiddenFn(datasetsState, datasetId, columnName);
  }

  function getHiddenColumns(datasetId: string): string[] {
    return getHiddenColumnsFn(datasetsState, datasetId);
  }

  function getVisibleColumns(datasetId: string): string[] {
    return getVisibleColumnsFn(datasetsState, datasetId);
  }

  async function duplicateDataset(datasetId: string): Promise<string | null> {
    return duplicateDatasetFn(datasetsState, datasetId);
  }

  function clear(): void {
    clearState();
  }

  function createVisualizationsForGeoDatasetsFn(
    datasets: DatasetResult[]
  ): void {
    createVisualizationsForGeoDatasets(datasets, visualizationStoreOps);
  }

  return {
    get datasets() {
      return datasetsState.datasets;
    },
    get selectedDataset() {
      return getSelectedDataset(datasetsState);
    },
    get selectedDatasetId() {
      return datasetsState.selectedDatasetId;
    },
    get isProcessing() {
      return datasetsState.isProcessing;
    },
    get enabledDatasets(): DatasetResult[] {
      return getEnabledDatasets(datasetsState);
    },
    get enabledDatasetIds(): Set<string> {
      return datasetsState.enabledDatasetIds;
    },
    get error() {
      return datasetsState.error;
    },
    injectVisualizationStore,
    isDatasetEnabled,
    toggleDatasetVisibility,
    enableDataset,
    disableDataset,
    syncMapVisibilityWithSourceFile,
    addProcessedDataset,
    processFiles,
    addFile,
    selectDataset,
    removeDataset,
    deleteDataset,
    updateDataset,
    updateDatasetJoinBasemap,
    getAllDatasets,
    getDatasetBySourceFile,
    waitForDatasetBySourceFile,
    getDatasetsByType,
    getColumnValues,
    getUniqueValues,
    getColumnStatistics,
    resetDataset,
    hasModifications,
    recordTransformation,
    updateDatasetRowCount,
    renameDatasetColumn,
    renameDataset,
    updateDatasetTableName,
    updateDatasetCsvOptions,
    hideColumn,
    showColumn,
    toggleColumnHidden,
    isColumnHidden,
    getHiddenColumns,
    getVisibleColumns,
    duplicateDataset,
    clear,
    createVisualizationsForGeoDatasets: createVisualizationsForGeoDatasetsFn,
    applyPersistedViewState,
    serializePersistedViewState: serializeViewState,
    restorePersistedViewState
  };
}

export const datasetsStore = createDatasetsStore();

persistenceRegistry.register({
  key: 'datasetsView',
  serialize: () => datasetsStore.serializePersistedViewState(),
  deserialize: (data: unknown) => datasetsStore.restorePersistedViewState(data),
  reset: () => datasetsStore.restorePersistedViewState(undefined),
  priority: 'debounced'
});
