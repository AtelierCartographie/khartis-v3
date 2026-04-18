import type {
  CsvImportOptions,
  DatasetResult
} from '$lib/features/data-pipeline';
import { duckDBOrchestrator } from '$lib/features/duckdb/orchestrator/orchestrator.svelte';
import type { DatasetsState, DatasetsInternals } from './datasets-state.svelte';
import type { VisualizationStoreOperations } from './datasets-processing';
import { LogCategory, logger } from '../../utils/logger';
import { sanitizeTextInput } from '../../utils/sanitize.utils';
import { projectStore } from '../project.store.svelte';
import { dataTabActions } from '../data-tab.store.svelte';
import {
  findById,
  removeById,
  updateById,
  replaceAtIndex
} from '../../utils/array-helpers';

export function addProcessedDataset(
  state: DatasetsState,
  dataset: DatasetResult
): void {
  state.datasets = [...state.datasets, dataset];
  state.enabledDatasetIds.add(dataset.id);
  if (!state.selectedDatasetId) {
    state.selectedDatasetId = dataset.id;
  }
}

export function removeDataset(state: DatasetsState, datasetId: string): void {
  const filteredDatasets = removeById(state.datasets, datasetId);

  if (state.selectedDatasetId === datasetId) {
    const newSelectedId = filteredDatasets[0]?.id;
    state.selectedDatasetId = newSelectedId;
  }

  state.enabledDatasetIds.delete(datasetId);
  state.datasets = filteredDatasets;
}

export async function deleteDataset(
  state: DatasetsState,
  datasetId: string,
  vizOps?: VisualizationStoreOperations | null
): Promise<boolean> {
  const dataset = findById(state.datasets, datasetId);
  if (!dataset) {
    return false;
  }

  if (vizOps) {
    const vizs = vizOps.getVisualizationsByDataset(datasetId);
    for (const viz of vizs) {
      vizOps.removeVisualization(viz.id);
    }
  }

  await duckDBOrchestrator.dropTable(dataset.tableName);

  removeDataset(state, datasetId);

  dataTabActions.setEnrichDataState({
    enrichmentDatasetId: undefined,
    enrichmentColumn: undefined,
    targetColumn: undefined,
    isEnrichmentActive: false
  });

  return true;
}

export function updateDataset(
  state: DatasetsState,
  datasetId: string,
  updates: Partial<
    Pick<
      DatasetResult,
      'tableName' | 'columns' | 'simplificationApplied' | 'metadata'
    >
  >
): void {
  const datasetIndex = state.datasets.findIndex((d) => d.id === datasetId);

  if (datasetIndex === -1) {
    logger.warn('Dataset not found for update', LogCategory.STORE, {
      datasetId
    });
    return;
  }

  const updatedDataset = {
    ...state.datasets[datasetIndex],
    ...updates
  };

  state.datasets = replaceAtIndex(state.datasets, datasetIndex, updatedDataset);
}

export function updateDatasetRowCount(
  state: DatasetsState,
  datasetId: string,
  rowCount: number
): void {
  if (!findById(state.datasets, datasetId)) {
    logger.warn('Dataset not found for row count update', LogCategory.STORE, {
      datasetId
    });
    return;
  }
  state.datasets = updateById(state.datasets, datasetId, { rowCount });
}

export function updateDatasetTableName(
  state: DatasetsState,
  datasetId: string,
  tableName: string
): void {
  state.datasets = state.datasets.map((dataset) =>
    dataset.id === datasetId ? { ...dataset, tableName } : dataset
  );
}

export function updateDatasetCsvOptions(
  state: DatasetsState,
  datasetId: string,
  csvOptions: CsvImportOptions
): void {
  const dataset = findById(state.datasets, datasetId);
  if (!dataset) {
    logger.warn('Dataset not found for CSV options update', LogCategory.STORE, {
      datasetId
    });
    return;
  }
  state.datasets = updateById(state.datasets, datasetId, {
    metadata: { ...dataset.metadata, csvOptions }
  });
}

export async function renameDataset(
  state: DatasetsState,
  datasetId: string,
  newName: string
): Promise<boolean> {
  const dataset = findById(state.datasets, datasetId);
  if (!dataset) {
    return false;
  }

  const sanitizedName = sanitizeTextInput(newName);
  if (!sanitizedName) {
    return false;
  }

  state.datasets = updateById(state.datasets, datasetId, {
    name: sanitizedName
  });

  if (dataset.sourceFileId) {
    await projectStore.renameFile(dataset.sourceFileId, sanitizedName);
  }

  return true;
}

export function renameDatasetOnly(
  state: DatasetsState,
  datasetId: string,
  newName: string
): boolean {
  const dataset = findById(state.datasets, datasetId);
  if (!dataset) {
    return false;
  }

  const sanitizedName = sanitizeTextInput(newName);
  if (!sanitizedName) {
    return false;
  }

  state.datasets = updateById(state.datasets, datasetId, {
    name: sanitizedName
  });
  return true;
}

export function hasModifications(
  state: DatasetsState,
  datasetId: string
): boolean {
  const dataset = findById(state.datasets, datasetId);
  if (!dataset) {
    return false;
  }

  if ((dataset.metadata.transformations?.length ?? 0) > 0) {
    return true;
  }

  const sourceFile = dataset.sourceFileId
    ? projectStore.currentProject?.data?.sourceFiles?.find(
        (file) => file.id === dataset.sourceFileId
      )
    : undefined;

  return Boolean(
    sourceFile &&
    ((sourceFile.columnTransformations?.length ?? 0) > 0 ||
      (sourceFile.deletedRowIds?.length ?? 0) > 0)
  );
}

export function recordTransformation(
  state: DatasetsState,
  datasetId: string,
  description: string
): void {
  const dataset = findById(state.datasets, datasetId);
  if (!dataset) {
    return;
  }

  const entry = `${new Date().toISOString()} - ${description}`;
  const updatedTransformations = [
    ...(dataset.metadata.transformations ?? []),
    entry
  ];

  state.datasets = updateById(state.datasets, datasetId, {
    metadata: {
      ...dataset.metadata,
      transformations: updatedTransformations
    }
  });
}

export function waitForDatasetBySourceFile(
  state: DatasetsState,
  internals: DatasetsInternals,
  sourceFileId: string
): Promise<string> {
  const existing = state.datasets.find((d) => d.sourceFileId === sourceFileId);
  if (existing) {
    return Promise.resolve(existing.id);
  }

  return new Promise((resolve) => {
    const resolvers = internals.pendingDatasetResolvers.get(sourceFileId) ?? [];
    resolvers.push(resolve);
    internals.pendingDatasetResolvers.set(sourceFileId, resolvers);
  });
}
