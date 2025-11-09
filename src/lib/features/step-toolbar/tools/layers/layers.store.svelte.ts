import { createResetFunction } from '$lib/features/commons/utils/store.utils';
import type { Layer, LayersState } from './layers.types';
import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
import { datasetsStore } from '$lib/features/commons/store/datasets.store.svelte';

const FIXTURE_LAYERS = [
  {
    id: 'texts',
    name: 'Textes',
    visible: true,
    type: 'visualization' as const,
    color: '#22c55e',
    opacity: 100,
    order: 0
  },
  {
    id: 'symbols',
    name: 'Symboles',
    visible: true,
    type: 'visualization' as const,
    color: '#22c55e',
    opacity: 100,
    order: 1
  },
  {
    id: 'borders',
    name: 'Frontières',
    visible: true,
    type: 'geographic' as const,
    color: '#dc2626',
    opacity: 100,
    order: 0
  },
  {
    id: 'equator',
    name: 'Équateur',
    visible: false,
    type: 'geographic' as const,
    color: '#dc2626',
    opacity: 50,
    order: 1
  }
];

const DEFAULT_STATE: LayersState = {
  layers: [...FIXTURE_LAYERS],
  expandedSections: {
    visualization: true,
    geographic: false
  },
  dragState: {
    dragIndex: null,
    dragOverIndex: null,
    isDragging: false
  }
};

export const layersState = $state<LayersState>({ ...DEFAULT_STATE });

export const layersActions = {
  setState(newState: Partial<LayersState>): void {
    Object.assign(layersState, newState);
  },

  addLayer(layer: Omit<Layer, 'id' | 'order'>): Layer {
    const layersOfType = layersState.layers.filter(
      (l) => l.type === layer.type
    );
    const maxOrder = Math.max(-1, ...layersOfType.map((l) => l.order));

    const newLayer: Layer = {
      ...layer,
      id: `layer-${Date.now()}`,
      order: maxOrder + 1
    };

    layersState.layers.push(newLayer);
    return newLayer;
  },

  updateLayer(id: string, updates: Partial<Layer>): void {
    const index = layersState.layers.findIndex((layer) => layer.id === id);
    if (index !== -1) {
      layersState.layers[index] = { ...layersState.layers[index], ...updates };
    }
  },

  removeLayer(id: string): void {
    const layer = layersState.layers.find((l) => l.id === id);
    if (layer) {
      layersState.layers = layersState.layers.filter((l) => l.id !== id);
      this.reorderLayersOfType(layer.type);
    }
  },

  toggleLayerVisibility(id: string): void {
    const layer = layersState.layers.find((l) => l.id === id);
    if (layer) {
      layer.visible = !layer.visible;
    }
  },

  setLayerOpacity(id: string, opacity: number): void {
    const layer = layersState.layers.find((l) => l.id === id);
    if (layer) {
      layer.opacity = Math.max(0, Math.min(100, opacity));
    }
  },

  setLayerColor(id: string, color: string): void {
    const layer = layersState.layers.find((l) => l.id === id);
    if (layer) {
      layer.color = color;
    }
  },

  reorderLayers(fromIndex: number, toIndex: number): void {
    const layers = [...layersState.layers];
    const [removed] = layers.splice(fromIndex, 1);
    layers.splice(toIndex, 0, removed);

    layersState.layers = layers;
    this.updateLayerOrders();
  },

  toggleSectionExpanded(section: string): void {
    layersState.expandedSections[section] =
      !layersState.expandedSections[section];
  },

  duplicateLayer(id: string): Layer | null {
    const layer = layersState.layers.find((l) => l.id === id);
    if (layer) {
      const duplicate = this.addLayer({
        ...layer,
        name: `${layer.name} (copie)`
      });
      return duplicate;
    }
    return null;
  },

  updateLayerOrders(): void {
    const visualizationLayers = getLayersByType('visualization');
    const geographicLayers = getLayersByType('geographic');

    visualizationLayers.forEach((layer, index) => {
      layer.order = index;
    });

    geographicLayers.forEach((layer, index) => {
      layer.order = index;
    });
  },

  reorderLayersOfType(type: 'visualization' | 'geographic'): void {
    const layers = getLayersByType(type);
    layers.forEach((layer, index) => {
      layer.order = index;
    });
  },

  setDragState(dragState: Partial<LayersState['dragState']>): void {
    layersState.dragState = { ...layersState.dragState, ...dragState };
  },

  startDragging(index: number): void {
    layersState.dragState = {
      dragIndex: index,
      dragOverIndex: null,
      isDragging: true
    };
  },

  endDragging(): void {
    const { dragIndex, dragOverIndex } = layersState.dragState;

    if (
      dragIndex !== null &&
      dragOverIndex !== null &&
      dragIndex !== dragOverIndex
    ) {
      this.reorderLayers(dragIndex, dragOverIndex);
    }

    layersState.dragState = {
      dragIndex: null,
      dragOverIndex: null,
      isDragging: false
    };
  },

  reset: createResetFunction(layersState, DEFAULT_STATE),

  syncWithVisualizations(): void {
    const visualizations = visualizationStore.visualizations;

    const existingIds = new Set(layersState.layers.map((l) => l.id));

    visualizations.forEach((viz) => {
      if (!existingIds.has(viz.id)) {
        const dataset = datasetsStore.datasets.find(
          (d) => d.id === viz.datasetId
        );

        this.addLayer({
          name: viz.name,
          visible: viz.enabled,
          type: 'visualization',
          color: Array.isArray(viz.style.fillColor)
            ? viz.style.fillColor[0]
            : viz.style.fillColor || '#3b82f6',
          opacity: (viz.style.fillOpacity || 1) * 100
        });
      }
    });

    const vizIds = new Set(visualizations.map((v) => v.id));
    const filteredLayers = layersState.layers.filter(
      (layer) => layer.type === 'geographic' || vizIds.has(layer.id)
    );
    layersState.layers = filteredLayers;
  },

  createLayerFromVisualization(vizId: string): Layer | null {
    const visualization = visualizationStore.visualizations.find(
      (v) => v.id === vizId
    );
    if (!visualization) return null;

    return this.addLayer({
      name: visualization.name,
      visible: visualization.enabled,
      type: 'visualization',
      color: Array.isArray(visualization.style.fillColor)
        ? visualization.style.fillColor[0]
        : visualization.style.fillColor || '#3b82f6',
      opacity: (visualization.style.fillOpacity || 1) * 100
    });
  }
};

export function getLayersByType(type: 'visualization' | 'geographic'): Layer[] {
  return layersState.layers
    .filter((l) => l.type === type)
    .sort((a, b) => a.order - b.order);
}

export function getVisibleLayersByType(
  type: 'visualization' | 'geographic'
): Layer[] {
  return getLayersByType(type).filter((l) => l.visible);
}

export function getLayerById(id: string): Layer | undefined {
  return layersState.layers.find((l) => l.id === id);
}
