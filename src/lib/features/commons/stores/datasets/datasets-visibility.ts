import type { DatasetResult } from '$lib/features/data-pipeline';
import type { DatasetsState } from './datasets-state.svelte';

export function isDatasetEnabled(
  state: DatasetsState,
  datasetId: string
): boolean {
  return state.enabledDatasetIds.has(datasetId);
}

export function toggleDatasetVisibility(
  state: DatasetsState,
  datasetId: string
): void {
  if (state.enabledDatasetIds.has(datasetId)) {
    state.enabledDatasetIds.delete(datasetId);
  } else {
    state.enabledDatasetIds.add(datasetId);
  }
}

export function enableDataset(state: DatasetsState, datasetId: string): void {
  state.enabledDatasetIds.add(datasetId);
}

export function disableDataset(state: DatasetsState, datasetId: string): void {
  state.enabledDatasetIds.delete(datasetId);
}

export function getEnabledDatasets(state: DatasetsState): DatasetResult[] {
  return state.datasets.filter((d) => state.enabledDatasetIds.has(d.id));
}
