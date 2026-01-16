import { visualizationStore } from '$lib/features/commons/store/visualization.store.svelte';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import * as m from '$lib/paraglide/messages';
import { SvelteSet } from 'svelte/reactivity';
import type { Layer, LayersState } from './layers.types';

const FIXTURE_LAYERS: Layer[] = [
  {
    id: 'texts',
    name: m.layers_texts(),
    visible: true,
    type: 'visualization',
    color: '#22c55e',
    opacity: 100,
    order: 0
  },
  {
    id: 'symbols',
    name: m.layers_symbols(),
    visible: true,
    type: 'visualization',
    color: '#22c55e',
    opacity: 100,
    order: 1
  },
  {
    id: 'borders',
    name: m.layers_borders(),
    visible: true,
    type: 'geographic',
    color: '#dc2626',
    opacity: 100,
    order: 0
  },
  {
    id: 'equator',
    name: m.layers_equator(),
    visible: false,
    type: 'geographic',
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

type LayersActions = {
  addLayer: (layer: Omit<Layer, 'id' | 'order'>) => Layer;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  setLayerColor: (id: string, color: string) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  toggleSectionExpanded: (section: string) => void;
  duplicateLayer: (id: string) => Layer | null;
  setDragState: (dragState: Partial<LayersState['dragState']>) => void;
  startDragging: (index: number) => void;
  endDragging: () => void;
  syncWithVisualizations: () => void;
  createLayerFromVisualization: (vizId: string) => Layer | null;
};

const { state, actions } = createToolStore<LayersState, LayersActions>(
  DEFAULT_STATE,
  (s) => {
    const getLayersByType = (type: 'visualization' | 'geographic'): Layer[] => {
      return s.layers
        .filter((l) => l.type === type)
        .sort((a, b) => a.order - b.order);
    };

    const reorderLayersOfType = (type: 'visualization' | 'geographic') => {
      const layers = getLayersByType(type);
      layers.forEach((layer, index) => {
        layer.order = index;
      });
    };

    const updateLayerOrders = () => {
      const visualizationLayers = getLayersByType('visualization');
      const geographicLayers = getLayersByType('geographic');

      visualizationLayers.forEach((layer, index) => {
        layer.order = index;
      });
      geographicLayers.forEach((layer, index) => {
        layer.order = index;
      });
    };

    const addLayer = (layer: Omit<Layer, 'id' | 'order'>): Layer => {
      const layersOfType = s.layers.filter((l) => l.type === layer.type);
      const maxOrder = Math.max(-1, ...layersOfType.map((l) => l.order));

      const newLayer: Layer = {
        ...layer,
        id: `layer-${Date.now()}`,
        order: maxOrder + 1
      };

      s.layers.push(newLayer);
      return newLayer;
    };

    const reorderLayers = (fromIndex: number, toIndex: number) => {
      const layers = [...s.layers];
      const [removed] = layers.splice(fromIndex, 1);
      layers.splice(toIndex, 0, removed);
      s.layers = layers;
      updateLayerOrders();
    };

    return {
      addLayer,
      updateLayer: (id: string, updates: Partial<Layer>) => {
        const index = s.layers.findIndex((layer) => layer.id === id);
        if (index !== -1) {
          s.layers[index] = { ...s.layers[index], ...updates };
        }
      },
      removeLayer: (id: string) => {
        const layer = s.layers.find((l) => l.id === id);
        if (layer) {
          s.layers = s.layers.filter((l) => l.id !== id);
          reorderLayersOfType(layer.type);
        }
      },
      toggleLayerVisibility: (id: string) => {
        const layer = s.layers.find((l) => l.id === id);
        if (layer) {
          layer.visible = !layer.visible;
        }
      },
      setLayerOpacity: (id: string, opacity: number) => {
        const layer = s.layers.find((l) => l.id === id);
        if (layer) {
          layer.opacity = Math.max(0, Math.min(100, opacity));
        }
      },
      setLayerColor: (id: string, color: string) => {
        const layer = s.layers.find((l) => l.id === id);
        if (layer) {
          layer.color = color;
        }
      },
      reorderLayers,
      toggleSectionExpanded: (section: string) => {
        s.expandedSections[section] = !s.expandedSections[section];
      },
      duplicateLayer: (id: string): Layer | null => {
        const layer = s.layers.find((l) => l.id === id);
        if (layer) {
          return addLayer({
            ...layer,
            name: `${layer.name} (copie)`
          });
        }
        return null;
      },
      setDragState: (dragState: Partial<LayersState['dragState']>) => {
        s.dragState = { ...s.dragState, ...dragState };
      },
      startDragging: (index: number) => {
        s.dragState = {
          dragIndex: index,
          dragOverIndex: null,
          isDragging: true
        };
      },
      endDragging: () => {
        const { dragIndex, dragOverIndex } = s.dragState;

        if (
          dragIndex !== null &&
          dragOverIndex !== null &&
          dragIndex !== dragOverIndex
        ) {
          reorderLayers(dragIndex, dragOverIndex);
        }

        s.dragState = {
          dragIndex: null,
          dragOverIndex: null,
          isDragging: false
        };
      },
      syncWithVisualizations: () => {
        const visualizations = visualizationStore.visualizations;
        const existingIds = new SvelteSet(s.layers.map((l) => l.id));

        visualizations.forEach((viz) => {
          if (!existingIds.has(viz.id)) {
            addLayer({
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

        const vizIds = new SvelteSet(visualizations.map((v) => v.id));
        s.layers = s.layers.filter(
          (layer) => layer.type === 'geographic' || vizIds.has(layer.id)
        );
      },
      createLayerFromVisualization: (vizId: string): Layer | null => {
        const visualization = visualizationStore.visualizations.find(
          (v) => v.id === vizId
        );
        if (!visualization) return null;

        return addLayer({
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
  }
);

export const layersState = state;
export const layersActions = actions;
