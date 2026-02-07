import {
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/store/visualization.store.svelte';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import {
  basemapLayersStore,
  type BasemapLayerId
} from '$lib/features/map/stores/basemap-layers.store.svelte';
import * as m from '$lib/paraglide/messages';
import type { Layer, LayersState } from './layers.types';

const DEFAULT_STATE: LayersState = {
  layers: [],
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

const VISUALIZATION_FALLBACK_COLOR = '#3b82f6';
const GEOGRAPHIC_FALLBACK_COLOR = '#8d8d8d';

type LayersActions = {
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  reorderLayers: (
    type: 'visualization' | 'geographic',
    fromIndex: number,
    toIndex: number
  ) => void;
  duplicateLayer: (id: string) => Layer | null;
  syncWithVisualizations: () => void;
};

function getVisualizationColor(viz: VisualizationConfig): string {
  if (typeof viz.style.fillColor === 'string' && viz.style.fillColor) {
    return viz.style.fillColor;
  }

  if (typeof viz.style.strokeColor === 'string' && viz.style.strokeColor) {
    return viz.style.strokeColor;
  }

  if (typeof viz.style.lineColor === 'string' && viz.style.lineColor) {
    return viz.style.lineColor;
  }

  if (typeof viz.style.textColor === 'string' && viz.style.textColor) {
    return viz.style.textColor;
  }

  return VISUALIZATION_FALLBACK_COLOR;
}

function getBasemapLayerColor(layerId: string): string {
  const layer = basemapLayersStore.getLayer(layerId as BasemapLayerId);
  if (!layer) {
    return GEOGRAPHIC_FALLBACK_COLOR;
  }

  switch (layer.id) {
    case 'terre':
      return layer.fillColor;
    case 'mers':
    case 'lacs':
    case 'rivieres':
    case 'relief':
    case 'equateur':
    case 'meridiens':
    case 'frontieres':
    case 'villes':
      return layer.color;
    default:
      return GEOGRAPHIC_FALLBACK_COLOR;
  }
}

function getBasemapLayerName(layerId: string): string {
  switch (layerId) {
    case 'terre':
      return m.basemap_layer_terre();
    case 'mers':
      return m.basemap_layer_mers();
    case 'lacs':
      return m.basemap_layer_lacs();
    case 'rivieres':
      return m.basemap_layer_rivieres();
    case 'relief':
      return m.basemap_layer_relief();
    case 'equateur':
      return m.basemap_layer_equateur();
    case 'meridiens':
      return m.basemap_layer_meridiens();
    case 'frontieres':
      return m.basemap_layer_frontieres();
    case 'villes':
      return m.basemap_layer_villes();
    default:
      return layerId;
  }
}

function reorderIds<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function buildLayers(): Layer[] {
  const activeVisualizationIds = new Set(
    visualizationStore.activeVisualizations.map(
      (visualization) => visualization.id
    )
  );

  const visualizationLayers = visualizationStore.visualizations.map(
    (viz, order) => ({
      id: viz.id,
      name: viz.name,
      visible: activeVisualizationIds.has(viz.id),
      type: 'visualization' as const,
      color: getVisualizationColor(viz),
      opacity: Math.round((viz.style.fillOpacity ?? 1) * 100),
      order
    })
  );

  const geographicLayers = basemapLayersStore.layers.map((layer, order) => ({
    id: layer.id,
    name: getBasemapLayerName(layer.id),
    visible: layer.visible,
    type: 'geographic' as const,
    color: getBasemapLayerColor(layer.id),
    opacity:
      'opacity' in layer && typeof layer.opacity === 'number'
        ? layer.opacity
        : 100,
    order
  }));

  return [...visualizationLayers, ...geographicLayers];
}

const { state, actions } = createToolStore<LayersState, LayersActions>(
  DEFAULT_STATE,
  (s) => {
    const syncFromSources = (): void => {
      s.layers = buildLayers();
    };

    syncFromSources();

    const findLayer = (id: string): Layer | undefined =>
      s.layers.find((layer) => layer.id === id);

    return {
      updateLayer: (id: string, updates: Partial<Layer>) => {
        const layer = findLayer(id);
        if (!layer) return;

        if (layer.type === 'visualization') {
          const visualization = visualizationStore.visualizations.find(
            (v) => v.id === id
          );
          if (!visualization) return;

          const nextStyle = { ...visualization.style };

          if (updates.color) {
            nextStyle.fillColor = updates.color;
          }

          if (typeof updates.opacity === 'number') {
            nextStyle.fillOpacity =
              Math.max(0, Math.min(100, updates.opacity)) / 100;
          }

          visualizationStore.updateVisualization(id, {
            name: updates.name ?? visualization.name,
            style: nextStyle
          });
        }

        syncFromSources();
      },
      removeLayer: (id: string) => {
        const layer = findLayer(id);
        if (!layer || layer.type !== 'visualization') return;

        visualizationStore.removeVisualization(id);
        syncFromSources();
      },
      toggleLayerVisibility: (id: string) => {
        const layer = findLayer(id);
        if (!layer) return;

        if (layer.type === 'visualization') {
          visualizationStore.toggleVisualization(id);
        } else {
          basemapLayersStore.setLayerVisibility(
            layer.id as BasemapLayerId,
            !layer.visible
          );
        }

        syncFromSources();
      },
      reorderLayers: (
        type: 'visualization' | 'geographic',
        fromIndex: number,
        toIndex: number
      ) => {
        const typedLayers = s.layers
          .filter((layer) => layer.type === type)
          .sort((a, b) => a.order - b.order);

        const reordered = reorderIds(typedLayers, fromIndex, toIndex);

        if (type === 'visualization') {
          visualizationStore.setVisualizationOrder(
            reordered.map((layer) => layer.id)
          );
        } else {
          basemapLayersStore.setLayerOrder(
            reordered.map((layer) => layer.id as BasemapLayerId)
          );
        }

        syncFromSources();
      },
      duplicateLayer: (id: string): Layer | null => {
        const layer = findLayer(id);
        if (!layer || layer.type !== 'visualization') {
          return null;
        }

        const duplicated = visualizationStore.duplicateVisualization(id);
        syncFromSources();

        if (!duplicated) {
          return null;
        }

        return s.layers.find((entry) => entry.id === duplicated.id) ?? null;
      },
      syncWithVisualizations: () => {
        syncFromSources();
      }
    };
  }
);

export const layersState = state;
export const layersActions = actions;
