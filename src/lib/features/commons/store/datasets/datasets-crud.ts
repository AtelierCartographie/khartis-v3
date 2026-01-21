import type { DatasetResult } from '$lib/features/data-pipeline';
import { duckDBOrchestrator } from '$lib/features/duckdb';
import type { DatasetsState, DatasetsInternals } from './datasets-state.svelte';
import type { VisualizationStoreOperations } from './datasets-processing';
import { LogCategory, logger } from '../../utils/logger';
import { sanitizeTextInput } from '../../utils/sanitize.utils';
import { projectStore } from '../project.store.svelte';

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
  const filteredDatasets = state.datasets.filter((d) => d.id !== datasetId);

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
  const dataset = state.datasets.find((d) => d.id === datasetId);
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

  return true;
}

export function updateDataset(
  state: DatasetsState,
  datasetId: string,
  updates: Partial<Pick<DatasetResult, 'tableName' | 'columns'>>
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

  state.datasets = [
    ...state.datasets.slice(0, datasetIndex),
    updatedDataset,
    ...state.datasets.slice(datasetIndex + 1)
  ];

  logger.debug('Dataset updated', LogCategory.STORE, {
    datasetId,
    updates: Object.keys(updates)
  });
}

export function updateDatasetRowCount(
  state: DatasetsState,
  datasetId: string,
  rowCount: number
): void {
  state.datasets = state.datasets.map((d) =>
    d.id === datasetId
      ? {
          ...d,
          rowCount,
          metadata: { ...d.metadata }
        }
      : d
  );
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

export async function renameDataset(
  state: DatasetsState,
  datasetId: string,
  newName: string
): Promise<boolean> {
  const dataset = state.datasets.find((d) => d.id === datasetId);
  if (!dataset) {
    return false;
  }

  const sanitizedName = sanitizeTextInput(newName);
  if (!sanitizedName) {
    return false;
  }

  dataset.name = sanitizedName;

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
  const dataset = state.datasets.find((d) => d.id === datasetId);
  if (!dataset) {
    return false;
  }

  const sanitizedName = sanitizeTextInput(newName);
  if (!sanitizedName) {
    return false;
  }

  dataset.name = sanitizedName;
  return true;
}

export function hasModifications(
  state: DatasetsState,
  datasetId: string
): boolean {
  const dataset = state.datasets.find((d) => d.id === datasetId);
  return dataset ? (dataset.metadata.transformations?.length ?? 0) > 0 : false;
}

export function recordTransformation(
  state: DatasetsState,
  datasetId: string,
  description: string
): void {
  const dataset = state.datasets.find((d) => d.id === datasetId);
  if (!dataset) {
    return;
  }

  const entry = `${new Date().toISOString()} - ${description}`;
  const updatedTransformations = [
    ...(dataset.metadata.transformations ?? []),
    entry
  ];

  state.datasets = state.datasets.map((d) =>
    d.id === datasetId
      ? {
          ...d,
          metadata: {
            ...d.metadata,
            transformations: updatedTransformations
          }
        }
      : d
  );
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
