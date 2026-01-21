import {
  datasetsStore,
  type VisualizationStoreOperations
} from './datasets.store.svelte';
import {
  visualizationStore,
  VisualizationType
} from './visualization.store.svelte';

let initialized = false;

export function initializeStores(): void {
  if (initialized) {
    return;
  }

  const visualizationOps: VisualizationStoreOperations = {
    getVisualizationsByDataset: (datasetId: string) =>
      visualizationStore.getVisualizationsByDataset(datasetId),
    removeVisualization: (id: string) =>
      visualizationStore.removeVisualization(id),
    createVisualization: (type, datasetId, name) =>
      visualizationStore.createVisualization(
        type as VisualizationType,
        datasetId,
        name
      )
  };

  datasetsStore.injectVisualizationStore(visualizationOps);

  initialized = true;
}
