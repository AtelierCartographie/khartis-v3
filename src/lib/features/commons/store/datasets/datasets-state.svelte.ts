import type { DatasetResult } from '$lib/features/data-pipeline';
import { SvelteSet } from 'svelte/reactivity';
import {
  createProcessingSemaphore,
  type ProcessingSemaphore
} from '../../utils/processing-semaphore';

export interface DatasetsState {
  datasets: DatasetResult[];
  selectedDatasetId?: string;
  enabledDatasetIds: SvelteSet<string>;
  isProcessing: boolean;
  error?: string;
  hiddenColumns: Map<string, Set<string>>;
}

export interface DatasetsInternals {
  activeOperations: number;
  pendingDatasetResolvers: Map<string, Array<(datasetId: string) => void>>;
  processingSemaphore: ProcessingSemaphore;
}

function createInitialState(): DatasetsState {
  return {
    datasets: [],
    enabledDatasetIds: new SvelteSet<string>(),
    isProcessing: false,
    hiddenColumns: new Map()
  };
}

function createInternals(): DatasetsInternals {
  return {
    activeOperations: 0,
    pendingDatasetResolvers: new Map(),
    processingSemaphore: createProcessingSemaphore(2)
  };
}

export const datasetsState = $state<DatasetsState>(createInitialState());
export const datasetsInternals: DatasetsInternals = createInternals();

export function startProcessing(): void {
  datasetsInternals.activeOperations++;
  datasetsState.isProcessing = true;
}

export function endProcessing(): void {
  datasetsInternals.activeOperations = Math.max(
    0,
    datasetsInternals.activeOperations - 1
  );
  if (datasetsInternals.activeOperations === 0) {
    datasetsState.isProcessing = false;
  }
}

export function clearState(): void {
  datasetsState.datasets = [];
  datasetsState.selectedDatasetId = undefined;
  datasetsState.enabledDatasetIds.clear();
  datasetsState.error = undefined;
  datasetsState.hiddenColumns.clear();
  datasetsInternals.pendingDatasetResolvers.clear();
}
