import type { DatasetsState } from './datasets-state.svelte';
import { SvelteSet } from 'svelte/reactivity';
import { LogCategory, logger } from '../../utils/logger';

export function hideColumn(
  state: DatasetsState,
  datasetId: string,
  columnName: string
): void {
  const hiddenSet =
    state.hiddenColumns.get(datasetId) ?? new SvelteSet<string>();
  hiddenSet.add(columnName);
  state.hiddenColumns.set(datasetId, hiddenSet);
  state.hiddenColumns = new Map(state.hiddenColumns);
  logger.debug('Column hidden', LogCategory.STORE, { datasetId, columnName });
}

export function showColumn(
  state: DatasetsState,
  datasetId: string,
  columnName: string
): void {
  const hiddenSet = state.hiddenColumns.get(datasetId);
  if (hiddenSet) {
    hiddenSet.delete(columnName);
    if (hiddenSet.size === 0) {
      state.hiddenColumns.delete(datasetId);
    }
    state.hiddenColumns = new Map(state.hiddenColumns);
  }
  logger.debug('Column shown', LogCategory.STORE, { datasetId, columnName });
}

export function toggleColumnHidden(
  state: DatasetsState,
  datasetId: string,
  columnName: string
): void {
  if (isColumnHidden(state, datasetId, columnName)) {
    showColumn(state, datasetId, columnName);
  } else {
    hideColumn(state, datasetId, columnName);
  }
}

export function isColumnHidden(
  state: DatasetsState,
  datasetId: string,
  columnName: string
): boolean {
  return state.hiddenColumns.get(datasetId)?.has(columnName) ?? false;
}

export function getHiddenColumns(
  state: DatasetsState,
  datasetId: string
): string[] {
  return Array.from(state.hiddenColumns.get(datasetId) ?? []);
}

export function getVisibleColumns(
  state: DatasetsState,
  datasetId: string
): string[] {
  const dataset = state.datasets.find((d) => d.id === datasetId);
  if (!dataset) return [];

  const hiddenSet = state.hiddenColumns.get(datasetId) ?? new Set();
  return dataset.columns
    .map((c) => c.name)
    .filter((name) => !hiddenSet.has(name));
}

export function renameDatasetColumn(
  state: DatasetsState,
  datasetId: string,
  oldName: string,
  newName: string
): void {
  state.datasets = state.datasets.map((d) => {
    if (d.id !== datasetId) return d;

    const updatedColumns = d.columns.map((col) =>
      col.name === oldName ? { ...col, name: newName } : col
    );

    const updatedAnalysisColumns = d.analysis?.columns?.map((col) =>
      col.name === oldName ? { ...col, name: newName } : col
    );

    return {
      ...d,
      columns: updatedColumns,
      analysis: d.analysis
        ? { ...d.analysis, columns: updatedAnalysisColumns ?? [] }
        : undefined
    };
  });
}
