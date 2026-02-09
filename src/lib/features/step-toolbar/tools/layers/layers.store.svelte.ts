import {
  ALL_PRIMITIVE_FILTERS,
  PrimitiveFilterType,
  type PrimitiveFilter,
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
const VISUALIZATION_SUBLAYER_SEPARATOR = '::';
const VISUALIZATION_SUBLAYER_ORDER: PrimitiveFilter[] = [
  PrimitiveFilterType.POINT,
  PrimitiveFilterType.LINE,
  PrimitiveFilterType.POLYGON
];

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
  const fillColor = getStyleColor(viz.style.fillColor);
  if (fillColor) return fillColor;

  if (typeof viz.style.strokeColor === 'string' && viz.style.strokeColor) {
    return viz.style.strokeColor;
  }

  const lineColor = getStyleColor(viz.style.lineColor);
  if (lineColor) return lineColor;

  const textColor = getStyleColor(viz.style.textColor);
  if (textColor) return textColor;

  return VISUALIZATION_FALLBACK_COLOR;
}

function getStyleColor(color?: string | string[]): string | null {
  if (typeof color === 'string' && color) {
    return color;
  }

  if (Array.isArray(color) && typeof color[0] === 'string' && color[0]) {
    return color[0];
  }

  return null;
}

function buildVisualizationSubLayerId(
  visualizationId: string,
  primitive: PrimitiveFilter
): string {
  return `${visualizationId}${VISUALIZATION_SUBLAYER_SEPARATOR}${primitive}`;
}

function getVisualizationPrimitiveName(primitive: PrimitiveFilter): string {
  switch (primitive) {
    case PrimitiveFilterType.POINT:
      return m.symbols_title();
    case PrimitiveFilterType.LINE:
      return m.lines_title();
    case PrimitiveFilterType.POLYGON:
      return m.polygons_title();
    default:
      return primitive;
  }
}

function getVisualizationPrimitiveColor(
  viz: VisualizationConfig,
  primitive: PrimitiveFilter
): string {
  switch (primitive) {
    case PrimitiveFilterType.POINT:
      return (
        getStyleColor(viz.style.fillColor) ??
        viz.style.strokeColor ??
        VISUALIZATION_FALLBACK_COLOR
      );
    case PrimitiveFilterType.LINE:
      return (
        getStyleColor(viz.style.lineColor) ??
        viz.style.strokeColor ??
        getStyleColor(viz.style.fillColor) ??
        VISUALIZATION_FALLBACK_COLOR
      );
    case PrimitiveFilterType.POLYGON:
      return (
        getStyleColor(viz.style.fillColor) ??
        viz.style.strokeColor ??
        VISUALIZATION_FALLBACK_COLOR
      );
    default:
      return VISUALIZATION_FALLBACK_COLOR;
  }
}

function getVisualizationPrimitiveOpacity(
  viz: VisualizationConfig,
  primitive: PrimitiveFilter
): number {
  switch (primitive) {
    case PrimitiveFilterType.POINT:
      return Math.round((viz.style.fillOpacity ?? 1) * 100);
    case PrimitiveFilterType.LINE:
      return Math.round((viz.style.lineOpacity ?? 1) * 100);
    case PrimitiveFilterType.POLYGON:
      return Math.round((viz.style.fillOpacity ?? 1) * 100);
    default:
      return 100;
  }
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

function isVisualizationLayer(layer: Layer): boolean {
  return layer.type === 'visualization';
}

function isVisualizationParentLayer(layer: Layer): boolean {
  return isVisualizationLayer(layer) && !layer.isSubLayer;
}

function buildLayers(): Layer[] {
  const activeVisualizationIds = new Set(
    visualizationStore.activeVisualizations.map(
      (visualization) => visualization.id
    )
  );

  const visualizationLayers = visualizationStore.visualizations.flatMap(
    (viz, order): Layer[] => {
      const primitiveFilters = viz.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
      const parentLayer: Layer = {
        id: viz.id,
        name: viz.name,
        visible: activeVisualizationIds.has(viz.id),
        type: 'visualization',
        color: getVisualizationColor(viz),
        opacity: Math.round((viz.style.fillOpacity ?? 1) * 100),
        order
      };

      const subLayers = VISUALIZATION_SUBLAYER_ORDER.map(
        (primitive, primitiveIndex): Layer => ({
          id: buildVisualizationSubLayerId(viz.id, primitive),
          parentId: viz.id,
          isSubLayer: true,
          primitive,
          name: getVisualizationPrimitiveName(primitive),
          visible: primitiveFilters.includes(primitive),
          type: 'visualization',
          color: getVisualizationPrimitiveColor(viz, primitive),
          opacity: getVisualizationPrimitiveOpacity(viz, primitive),
          order: order * 10 + primitiveIndex
        })
      );

      return [parentLayer, ...subLayers];
    }
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
          if (layer.isSubLayer) {
            return;
          }

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
        if (!layer || !isVisualizationParentLayer(layer)) return;

        visualizationStore.removeVisualization(id);
        syncFromSources();
      },
      toggleLayerVisibility: (id: string) => {
        const layer = findLayer(id);
        if (!layer) return;

        if (layer.type === 'visualization') {
          if (layer.isSubLayer) {
            if (layer.parentId && layer.primitive) {
              visualizationStore.togglePrimitiveFilter(
                layer.parentId,
                layer.primitive
              );
            }
          } else {
            visualizationStore.toggleVisualization(id);
          }
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
          .filter((layer) =>
            type === 'visualization'
              ? isVisualizationParentLayer(layer)
              : layer.type === type
          )
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
        if (!layer || !isVisualizationParentLayer(layer)) {
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
