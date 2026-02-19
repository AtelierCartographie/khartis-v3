import type { DatasetResult } from '$lib/features/data-pipeline';
import type { DatasetsState } from './datasets-state.svelte';
import { dataTabActions } from '../data-tab.store.svelte';
import { findById } from '../../utils/array-helpers';

export function getSelectedDataset(
  state: DatasetsState
): DatasetResult | undefined {
  if (!state.selectedDatasetId) return undefined;
  return findById(state.datasets, state.selectedDatasetId);
}

export function selectDataset(state: DatasetsState, datasetId: string): void {
  const dataset = findById(state.datasets, datasetId);

  if (!dataset) return;

  if (state.selectedDatasetId === datasetId) {
    state.selectedDatasetId = datasetId;
    return;
  }

  const previousDataset = state.selectedDatasetId
    ? findById(state.datasets, state.selectedDatasetId)
    : undefined;
  const isSameSourceFile =
    previousDataset?.sourceFileId === dataset.sourceFileId;

  state.selectedDatasetId = datasetId;

  // Keep data-tab state when a dataset gets replaced but still points to the same source file.
  if (!isSameSourceFile) {
    dataTabActions.reset();
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
