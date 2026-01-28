import type { DatasetResult } from '$lib/features/data-pipeline';
import type { DatasetsState } from './datasets-state.svelte';
import { dataTabActions } from '../data-tab.store.svelte';

export function getSelectedDataset(
  state: DatasetsState
): DatasetResult | undefined {
  return state.datasets.find((d) => d.id === state.selectedDatasetId);
}

export function selectDataset(state: DatasetsState, datasetId: string): void {
  const dataset = state.datasets.find((d) => d.id === datasetId);

  if (dataset && state.selectedDatasetId !== datasetId) {
    state.selectedDatasetId = datasetId;
    dataTabActions.reset();
  } else if (dataset) {
    state.selectedDatasetId = datasetId;
  }
}

export function getDatasetBySourceFile(
  state: DatasetsState,
  sourceFileId: string
): DatasetResult | undefined {
  return state.datasets.find((d) => d.sourceFileId === sourceFileId);
}

export function getDatasetsByType(
  state: DatasetsState,
  hasGeometry: boolean
): DatasetResult[] {
  return state.datasets.filter((d) =>
    hasGeometry ? !!d.geometry : !d.geometry
  );
}

export function getAllDatasets(state: DatasetsState): DatasetResult[] {
  return state.datasets;
}
