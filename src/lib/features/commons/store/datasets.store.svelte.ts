import type { DatasetResult } from '$lib/features/data-pipeline';
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

class DatasetsStore {
  private visualizationStoreOps: VisualizationStoreOperations | null = null;

  injectVisualizationStore(ops: VisualizationStoreOperations): void {
    this.visualizationStoreOps = ops;
  }

  get datasets() {
    return datasetsState.datasets;
  }

  get selectedDataset() {
    return getSelectedDataset(datasetsState);
  }

  get selectedDatasetId() {
    return datasetsState.selectedDatasetId;
  }

  get isProcessing() {
    return datasetsState.isProcessing;
  }

  get enabledDatasets(): DatasetResult[] {
    return getEnabledDatasets(datasetsState);
  }

  get enabledDatasetIds(): Set<string> {
    return datasetsState.enabledDatasetIds;
  }

  get error() {
    return datasetsState.error;
  }

  isDatasetEnabled(datasetId: string): boolean {
    return isDatasetEnabledFn(datasetsState, datasetId);
  }

  toggleDatasetVisibility(datasetId: string): void {
    toggleDatasetVisibilityFn(datasetsState, datasetId);
  }

  enableDataset(datasetId: string): void {
    enableDatasetFn(datasetsState, datasetId);
  }

  disableDataset(datasetId: string): void {
    disableDatasetFn(datasetsState, datasetId);
  }

  addProcessedDataset(dataset: DatasetResult): void {
    addProcessedDatasetFn(datasetsState, dataset);
  }

  async processFiles(files: UploadedFile[]): Promise<void> {
    return processFilesFn(
      datasetsState,
      datasetsInternals,
      files,
      this.visualizationStoreOps
    );
  }

  async addFile(
    file: UploadedFile,
    autoEnable = true
  ): Promise<DatasetResult | null> {
    return addFileFn(
      datasetsState,
      datasetsInternals,
      file,
      this.visualizationStoreOps,
      autoEnable
    );
  }

  selectDataset(datasetId: string): void {
    selectDatasetFn(datasetsState, datasetId);
  }

  removeDataset(datasetId: string): void {
    removeDatasetFn(datasetsState, datasetId);
  }

  async deleteDataset(datasetId: string): Promise<boolean> {
    return deleteDatasetFn(
      datasetsState,
      datasetId,
      this.visualizationStoreOps
    );
  }

  updateDataset(
    datasetId: string,
    updates: Partial<
      Pick<DatasetResult, 'tableName' | 'columns' | 'simplificationApplied'>
    >
  ): void {
    updateDatasetFn(datasetsState, datasetId, updates);
  }

  getAllDatasets(): DatasetResult[] {
    return getAllDatasetsFn(datasetsState);
  }

  getDatasetBySourceFile(sourceFileId: string): DatasetResult | undefined {
    return getDatasetBySourceFileFn(datasetsState, sourceFileId);
  }

  waitForDatasetBySourceFile(sourceFileId: string): Promise<string> {
    return waitForDatasetBySourceFileFn(
      datasetsState,
      datasetsInternals,
      sourceFileId
    );
  }

  getDatasetsByType(hasGeometry: boolean): DatasetResult[] {
    return getDatasetsByTypeFn(datasetsState, hasGeometry);
  }

  getColumnValues(datasetId: string, columnName: string): unknown[] {
    return getColumnValuesFn(datasetsState, datasetId, columnName);
  }

  getUniqueValues(datasetId: string, columnName: string): unknown[] {
    return getUniqueValuesFn(datasetsState, datasetId, columnName);
  }

  getColumnStatistics(datasetId: string, columnName: string) {
    return getColumnStatisticsFn(datasetsState, datasetId, columnName);
  }

  async resetDataset(datasetId: string): Promise<boolean> {
    return resetDatasetFn(datasetsState, datasetId);
  }

  hasModifications(datasetId: string): boolean {
    return hasModificationsFn(datasetsState, datasetId);
  }

  recordTransformation(datasetId: string, description: string): void {
    recordTransformationFn(datasetsState, datasetId, description);
  }

  updateDatasetRowCount(datasetId: string, rowCount: number): void {
    updateDatasetRowCountFn(datasetsState, datasetId, rowCount);
  }

  renameDatasetColumn(
    datasetId: string,
    oldName: string,
    newName: string
  ): void {
    renameDatasetColumnFn(datasetsState, datasetId, oldName, newName);
  }

  async renameDataset(datasetId: string, newName: string): Promise<boolean> {
    return renameDatasetFn(datasetsState, datasetId, newName);
  }

  renameDatasetOnly(datasetId: string, newName: string): boolean {
    return renameDatasetOnlyFn(datasetsState, datasetId, newName);
  }

  updateDatasetTableName(datasetId: string, tableName: string): void {
    updateDatasetTableNameFn(datasetsState, datasetId, tableName);
  }

  hideColumn(datasetId: string, columnName: string): void {
    hideColumnFn(datasetsState, datasetId, columnName);
  }

  showColumn(datasetId: string, columnName: string): void {
    showColumnFn(datasetsState, datasetId, columnName);
  }

  toggleColumnHidden(datasetId: string, columnName: string): void {
    toggleColumnHiddenFn(datasetsState, datasetId, columnName);
  }

  isColumnHidden(datasetId: string, columnName: string): boolean {
    return isColumnHiddenFn(datasetsState, datasetId, columnName);
  }

  getHiddenColumns(datasetId: string): string[] {
    return getHiddenColumnsFn(datasetsState, datasetId);
  }

  getVisibleColumns(datasetId: string): string[] {
    return getVisibleColumnsFn(datasetsState, datasetId);
  }

  async duplicateDataset(datasetId: string): Promise<string | null> {
    return duplicateDatasetFn(datasetsState, datasetId);
  }

  clear(): void {
    clearState();
  }

  createVisualizationsForGeoDatasets(datasets: DatasetResult[]): void {
    createVisualizationsForGeoDatasets(datasets, this.visualizationStoreOps);
  }
}

export const datasetsStore = new DatasetsStore();
