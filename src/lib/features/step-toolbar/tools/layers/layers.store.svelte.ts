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
  BASEMAP_LAYER_ID,
  type BasemapLayerConfig,
  type BasemapLayerId
} from '$lib/features/map/stores/basemap-layers.store.svelte';
import * as m from '$lib/paraglide/messages';
import { BASEMAP_SUBLAYER_COLOR, VIZ_SUBLAYER_COLOR } from './layers.constants';
import type { Layer, LayersState } from './layers.types';

const DEFAULT_STATE: LayersState = {
  layers: []
};

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
  reorderSubLayers: (
    parentId: string,
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

  return VIZ_SUBLAYER_COLOR;
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

function buildBasemapSubLayerId(
  visualizationId: string,
  basemapLayerId: BasemapLayerId
): string {
  return `${visualizationId}${VISUALIZATION_SUBLAYER_SEPARATOR}basemap${VISUALIZATION_SUBLAYER_SEPARATOR}${basemapLayerId}`;
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

function getBasemapLayerName(layerId: BasemapLayerId): string {
  switch (layerId) {
    case BASEMAP_LAYER_ID.TERRE:
      return m.basemap_layer_terre();
    case BASEMAP_LAYER_ID.MERS:
      return m.basemap_layer_mers();
    case BASEMAP_LAYER_ID.LACS:
      return m.basemap_layer_lacs();
    case BASEMAP_LAYER_ID.RIVIERES:
      return m.basemap_layer_rivieres();
    case BASEMAP_LAYER_ID.RELIEF:
      return m.basemap_layer_relief();
    case BASEMAP_LAYER_ID.EQUATEUR:
      return m.basemap_layer_equateur();
    case BASEMAP_LAYER_ID.MERIDIENS:
      return m.basemap_layer_meridiens();
    case BASEMAP_LAYER_ID.FRONTIERES:
      return m.basemap_layer_frontieres();
    case BASEMAP_LAYER_ID.VILLES:
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

function getBasemapLayerOpacity(layer: BasemapLayerConfig): number {
  if (layer.id === 'terre') {
    return layer.fillOpacity;
  }
  if ('opacity' in layer && typeof layer.opacity === 'number') {
    return layer.opacity;
  }
  return 100;
}

function buildLayers(): Layer[] {
  const activeVisualizationIds = new Set(
    visualizationStore.activeVisualizations.map((v) => v.id)
  );

  if (visualizationStore.visualizations.length === 0) {
    return basemapLayersStore.layers.map((layer, order) => ({
      id: layer.id,
      name: getBasemapLayerName(layer.id),
      visible: layer.visible,
      type: 'geographic' as const,
      color: BASEMAP_SUBLAYER_COLOR,
      opacity: getBasemapLayerOpacity(layer),
      order,
      basemapLayerId: layer.id
    }));
  }

  return visualizationStore.visualizations.flatMap((viz, vizOrder): Layer[] => {
    const primitiveFilters = viz.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;

    const parentLayer: Layer = {
      id: viz.id,
      name: viz.name,
      visible: activeVisualizationIds.has(viz.id),
      type: 'visualization',
      color: getVisualizationColor(viz),
      opacity: Math.round((viz.style.fillOpacity ?? 1) * 100),
      order: vizOrder
    };

    const vizPrimitiveOrder =
      viz.primitiveOrder ?? VISUALIZATION_SUBLAYER_ORDER;
    const vizSubLayers = vizPrimitiveOrder.map(
      (primitive, i): Layer => ({
        id: buildVisualizationSubLayerId(viz.id, primitive),
        parentId: viz.id,
        isSubLayer: true,
        primitive,
        name: getVisualizationPrimitiveName(primitive),
        visible: primitiveFilters.includes(primitive),
        type: 'visualization',
        color: VIZ_SUBLAYER_COLOR,
        opacity: getVisualizationPrimitiveOpacity(viz, primitive),
        order: vizOrder * 100 + i
      })
    );

    const basemapSubLayers = basemapLayersStore.layers.map(
      (layer, i): Layer => ({
        id: buildBasemapSubLayerId(viz.id, layer.id),
        parentId: viz.id,
        isSubLayer: true,
        name: getBasemapLayerName(layer.id),
        visible: layer.visible,
        type: 'geographic',
        color: BASEMAP_SUBLAYER_COLOR,
        opacity:
          'opacity' in layer && typeof layer.opacity === 'number'
            ? layer.opacity
            : 100,
        order: vizOrder * 100 + vizSubLayers.length + i,
        basemapLayerId: layer.id
      })
    );

    return [parentLayer, ...vizSubLayers, ...basemapSubLayers];
  });
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

        if (layer.type === 'geographic') {
          const bmId = (layer.basemapLayerId ?? layer.id) as BasemapLayerId;
          basemapLayersStore.setLayerVisibility(bmId, !layer.visible);
        } else if (layer.type === 'visualization') {
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
            reordered.map(
              (layer) => (layer.basemapLayerId ?? layer.id) as BasemapLayerId
            )
          );
        }

        syncFromSources();
      },
      reorderSubLayers: (
        parentId: string,
        fromIndex: number,
        toIndex: number
      ) => {
        const subLayers = s.layers
          .filter((layer) => layer.isSubLayer && layer.parentId === parentId)
          .sort((a, b) => a.order - b.order);

        const reordered = reorderIds(subLayers, fromIndex, toIndex);

        const vizPrimitives = reordered
          .filter((layer) => layer.type === 'visualization' && layer.primitive)
          .map((layer) => layer.primitive as PrimitiveFilter);

        if (vizPrimitives.length > 0) {
          visualizationStore.setPrimitiveFilterOrder(parentId, vizPrimitives);
        }

        const basemapIds = reordered
          .filter((layer) => layer.basemapLayerId)
          .map((layer) => layer.basemapLayerId as BasemapLayerId);

        if (basemapIds.length > 0) {
          basemapLayersStore.setLayerOrder(basemapIds);
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
