import type {
  CsvImportOptions,
  DatasetResult
} from '$lib/features/data-pipeline';
import type { UploadedFile } from './create-project.types';
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
  updateDatasetRowCount as updateDatasetRowCountFn,
  updateDatasetTableName as updateDatasetTableNameFn,
  updateDatasetCsvOptions as updateDatasetCsvOptionsFn,
  renameDataset as renameDatasetFn,
  renameDatasetOnly as renameDatasetOnlyFn,
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

  function injectVisualizationStore(ops: VisualizationStoreOperations): void {
    visualizationStoreOps = ops;
  }

  function isDatasetEnabled(datasetId: string): boolean {
    return isDatasetEnabledFn(datasetsState, datasetId);
  }

  function toggleDatasetVisibility(datasetId: string): void {
    toggleDatasetVisibilityFn(datasetsState, datasetId);
  }

  function enableDataset(datasetId: string): void {
    enableDatasetFn(datasetsState, datasetId);
  }

  function disableDataset(datasetId: string): void {
    disableDatasetFn(datasetsState, datasetId);
  }

  function addProcessedDataset(dataset: DatasetResult): void {
    addProcessedDatasetFn(datasetsState, dataset);
  }

  async function processFiles(files: UploadedFile[]): Promise<void> {
    return processFilesFn(
      datasetsState,
      datasetsInternals,
      files,
      visualizationStoreOps
    );
  }

  async function addFile(
    file: UploadedFile,
    autoEnable = true
  ): Promise<DatasetResult | null> {
    return addFileFn(
      datasetsState,
      datasetsInternals,
      file,
      visualizationStoreOps,
      autoEnable
    );
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
      Pick<DatasetResult, 'tableName' | 'columns' | 'simplificationApplied'>
    >
  ): void {
    updateDatasetFn(datasetsState, datasetId, updates);
  }

  function getAllDatasets(): DatasetResult[] {
    return getAllDatasetsFn(datasetsState);
  }

  function getDatasetBySourceFile(
    sourceFileId: string
  ): DatasetResult | undefined {
    return getDatasetBySourceFileFn(datasetsState, sourceFileId);
  }

  function waitForDatasetBySourceFile(sourceFileId: string): Promise<string> {
    return waitForDatasetBySourceFileFn(
      datasetsState,
      datasetsInternals,
      sourceFileId
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
    return resetDatasetFn(datasetsState, datasetId);
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

  function renameDatasetOnly(datasetId: string, newName: string): boolean {
    return renameDatasetOnlyFn(datasetsState, datasetId, newName);
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
  }

  function showColumn(datasetId: string, columnName: string): void {
    showColumnFn(datasetsState, datasetId, columnName);
  }

  function toggleColumnHidden(datasetId: string, columnName: string): void {
    toggleColumnHiddenFn(datasetsState, datasetId, columnName);
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
    addProcessedDataset,
    processFiles,
    addFile,
    selectDataset,
    removeDataset,
    deleteDataset,
    updateDataset,
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
    renameDatasetOnly,
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
    createVisualizationsForGeoDatasets: createVisualizationsForGeoDatasetsFn
  };
}

export const datasetsStore = createDatasetsStore();
