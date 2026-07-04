import {
  datasetsStore,
  type VisualizationStoreOperations
} from './datasets.store.svelte';
import { injectProjectionContext } from './map-instance.store.svelte';
import { visualizationStore } from './visualization.store.svelte';
import { projectionStore } from '$lib/features/map/stores/projection.store.svelte';
import '$lib/features/map/stores/basemap-aux-layers.store.svelte';
import '$lib/features/map/services/basemap-projection-sync.svelte';

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
      visualizationStore.createVisualization(type, datasetId, name)
  };

  datasetsStore.injectVisualizationStore(visualizationOps);

  injectProjectionContext(() => ({
    referenceBbox: projectionStore.referenceBbox,
    canvasSize: projectionStore.canvasSize,
    fitPaddingPx: projectionStore.fitPaddingPx,
    renderScale: projectionStore.renderScale,
    isProjectedCoordinates: projectionStore.isProjectedCoordinates
  }));

  initialized = true;
}
