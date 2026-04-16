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
  getBasemapRenderGroup,
  type BasemapLayerConfig,
  type BasemapLayerId
} from '$lib/features/map/stores/basemap-layers.store.svelte';
import { facetsStore } from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';
import * as m from '$lib/paraglide/messages';
import { BASEMAP_SUBLAYER_COLOR, VIZ_SUBLAYER_COLOR } from './layers.constants';
import type { Layer, LayerReorderScope, LayersState } from './layers.types';

const DEFAULT_STATE: LayersState = {
  layers: []
};

const VISUALIZATION_SUBLAYER_SEPARATOR = '::';
const BASEMAP_SUBLAYER_SEPARATOR = '::basemap::';
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
    scope: LayerReorderScope,
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

function getClassificationColor(viz: VisualizationConfig): string | null {
  if (!Array.isArray(viz.classification?.colors)) {
    return null;
  }

  return (
    viz.classification.colors.find(
      (color): color is string => typeof color === 'string' && color.length > 0
    ) ?? null
  );
}

export function getVisualizationColor(viz: VisualizationConfig): string {
  const fillColor = getStyleColor(viz.style.fillColor);
  if (fillColor) return fillColor;

  const lineColor = getStyleColor(viz.style.lineColor);
  if (lineColor) return lineColor;

  const classificationColor = getClassificationColor(viz);
  if (classificationColor) return classificationColor;

  const textColor = getStyleColor(viz.style.textColor);
  if (textColor) return textColor;

  const labelColor = getStyleColor(viz.style.labelColor);
  if (labelColor) return labelColor;

  if (typeof viz.style.strokeColor === 'string' && viz.style.strokeColor) {
    return viz.style.strokeColor;
  }

  return VIZ_SUBLAYER_COLOR;
}

export function getStyleColor(color?: string | string[]): string | null {
  if (typeof color === 'string' && color) {
    return color;
  }

  if (Array.isArray(color) && typeof color[0] === 'string' && color[0]) {
    return color[0];
  }

  return null;
}

export function getVisualizationPrimitiveColor(
  viz: VisualizationConfig,
  primitive: PrimitiveFilter
): string {
  const classificationColor = getClassificationColor(viz);

  switch (primitive) {
    case PrimitiveFilterType.LINE:
      return (
        getStyleColor(viz.style.lineColor) ??
        classificationColor ??
        (typeof viz.style.strokeColor === 'string' && viz.style.strokeColor
          ? viz.style.strokeColor
          : getVisualizationColor(viz))
      );
    case PrimitiveFilterType.POLYGON:
      if ((viz.style.fillOpacity ?? 1) <= 0) {
        return (
          (typeof viz.style.strokeColor === 'string' &&
            viz.style.strokeColor) ||
          getVisualizationColor(viz)
        );
      }

      return (
        getStyleColor(viz.style.fillColor) ??
        classificationColor ??
        (typeof viz.style.strokeColor === 'string' && viz.style.strokeColor
          ? viz.style.strokeColor
          : getVisualizationColor(viz))
      );
    case PrimitiveFilterType.POINT:
    default:
      return (
        getStyleColor(viz.style.fillColor) ??
        classificationColor ??
        (typeof viz.style.strokeColor === 'string' && viz.style.strokeColor
          ? viz.style.strokeColor
          : getVisualizationColor(viz))
      );
  }
}

export function getBasemapLayerColor(layer: BasemapLayerConfig): string {
  if (layer.id === BASEMAP_LAYER_ID.TERRE) {
    return layer.strokeColor || layer.fillColor || BASEMAP_SUBLAYER_COLOR;
  }

  if ('color' in layer && typeof layer.color === 'string' && layer.color) {
    return layer.color;
  }

  return BASEMAP_SUBLAYER_COLOR;
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
  return `${visualizationId}${BASEMAP_SUBLAYER_SEPARATOR}${basemapLayerId}`;
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
      return Math.round(
        (viz.symbols?.opacity ?? viz.style.fillOpacity ?? 1) * 100
      );
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
  const basemapLayers = basemapLayersStore.layers;
  const activeVisualizationIds = new Set(
    visualizationStore.activeVisualizations.map((v) => v.id)
  );

  const facetsEnabled = facetsStore.enabled;
  const facetBaseVizId = facetsStore.baseVisualizationId;
  const facetVizIds = new Set(facetsStore.generatedVisualizationIds);

  const displayVisualizations = facetsEnabled
    ? visualizationStore.visualizations.filter((v) => v.id !== facetBaseVizId)
    : visualizationStore.visualizations;

  let facetIndex = 0;

  return displayVisualizations.flatMap((viz, vizOrder): Layer[] => {
    const primitiveFilters = viz.primitiveFilters ?? ALL_PRIMITIVE_FILTERS;
    const isFacetViz = facetsEnabled && facetVizIds.has(viz.id);

    let layerName: string;
    if (isFacetViz) {
      facetIndex += 1;
      layerName = `${m.tool_facets()} ${facetIndex} — ${viz.name}`;
    } else {
      layerName = `${m.viz_tab_label()} (${vizOrder + 1})`;
    }

    const parentLayer: Layer = {
      id: viz.id,
      name: layerName,
      visible: isFacetViz || activeVisualizationIds.has(viz.id),
      type: 'visualization',
      color: getVisualizationColor(viz),
      opacity: Math.round((viz.style.fillOpacity ?? 1) * 100),
      order: vizOrder
    };

    const vizPrimitiveOrder = (
      viz.primitiveOrder ?? VISUALIZATION_SUBLAYER_ORDER
    ).filter((primitive) => primitiveFilters.includes(primitive));

    const vizSubLayers = vizPrimitiveOrder.map(
      (primitive, i): Layer => ({
        id: buildVisualizationSubLayerId(viz.id, primitive),
        parentId: viz.id,
        isSubLayer: true,
        primitive,
        name: getVisualizationPrimitiveName(primitive),
        visible: true,
        type: 'visualization',
        color: getVisualizationPrimitiveColor(viz, primitive),
        opacity: getVisualizationPrimitiveOpacity(viz, primitive),
        order: i
      })
    );

    const basemapSubLayers = basemapLayers.map(
      (bmLayer, bmIndex): Layer => ({
        id: buildBasemapSubLayerId(viz.id, bmLayer.id),
        parentId: viz.id,
        isSubLayer: true,
        type: 'geographic',
        basemapLayerId: bmLayer.id,
        basemapRenderGroup: getBasemapRenderGroup(bmLayer.id),
        name: getBasemapLayerName(bmLayer.id),
        visible: bmLayer.visible,
        color: getBasemapLayerColor(bmLayer),
        opacity: getBasemapLayerOpacity(bmLayer),
        order: vizSubLayers.length + bmIndex
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

        if (layer.type === 'visualization' && !layer.isSubLayer) {
          const visualization = visualizationStore.visualizations.find(
            (v) => v.id === id
          );
          if (!visualization) return;

          if (updates.name !== undefined) {
            visualizationStore.updateVisualization(id, { name: updates.name });
          }
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
        _scope: LayerReorderScope,
        fromIndex: number,
        toIndex: number
      ) => {
        const vizParents = s.layers.filter(isVisualizationParentLayer);
        const reordered = reorderIds(vizParents, fromIndex, toIndex);
        visualizationStore.setVisualizationOrder(
          reordered.map((layer) => layer.id)
        );
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

        const basemapSubs = reordered.filter(
          (layer) => layer.type === 'geographic' && layer.basemapLayerId
        );
        const foreground = basemapSubs
          .filter((l) => l.basemapRenderGroup === 'foreground')
          .map((l) => l.basemapLayerId as BasemapLayerId);
        const background = basemapSubs
          .filter((l) => l.basemapRenderGroup === 'background')
          .map((l) => l.basemapLayerId as BasemapLayerId);

        if (foreground.length > 0) {
          basemapLayersStore.setLayerRenderGroupOrder('foreground', foreground);
        }
        if (background.length > 0) {
          basemapLayersStore.setLayerRenderGroupOrder('background', background);
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
