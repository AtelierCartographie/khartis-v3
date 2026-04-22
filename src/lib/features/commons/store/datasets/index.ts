export {
  datasetsState,
  datasetsInternals,
  startProcessing,
  endProcessing,
  clearState,
  type DatasetsState,
  type DatasetsInternals
} from './datasets-state.svelte';

export {
  getSelectedDataset,
  selectDataset,
  getDatasetBySourceFile,
  getDatasetsByType,
  getAllDatasets
} from './datasets-selection';

export {
  isDatasetEnabled,
  toggleDatasetVisibility,
  enableDataset,
  disableDataset,
  getEnabledDatasets
} from './datasets-visibility';

export {
  hideColumn,
  showColumn,
  toggleColumnHidden,
  isColumnHidden,
  getHiddenColumns,
  getVisibleColumns,
  renameDatasetColumn
} from './datasets-columns';

export {
  getColumnValues,
  getUniqueValues,
  getColumnStatistics,
  type NumericStatistics,
  type CategoricalStatistics,
  type ColumnStatistics
} from './datasets-statistics';

export {
  createDatasetFromPreprocessedFile,
  createVisualizationsForGeoDatasets,
  processFiles,
  addFile,
  VisualizationType,
  type VisualizationConfig,
  type VisualizationStoreOperations
} from './datasets-processing';

export {
  addProcessedDataset,
  removeDataset,
  deleteDataset,
  updateDataset,
  updateDatasetRowCount,
  updateDatasetTableName,
  updateDatasetCsvOptions,
  renameDataset,
  hasModifications,
  recordTransformation,
  waitForDatasetBySourceFile
} from './datasets-crud';

export { resetDataset, duplicateDataset } from './datasets-operations';
