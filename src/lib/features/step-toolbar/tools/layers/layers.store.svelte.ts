import {
  getEnabledPrimitiveFilters,
  getLinePrimitive,
  getPolygonPrimitive,
  getPrimitiveClassification,
  getSymbolFillClassification,
  getSymbolPrimitive,
  getTextPrimitive,
  PrimitiveFilterType,
  type PrimitiveFilter,
  visualizationStore,
  type VisualizationConfig
} from '$lib/features/commons/stores/visualization.store.svelte';
import { createToolStore } from '$lib/features/commons/utils/store.utils.svelte';
import {
  FillMode,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  basemapLayersStore,
  BASEMAP_LAYER_ID,
  getBasemapRenderGroup,
  type BasemapLayerConfig,
  type BasemapLayerId
} from '$lib/features/map/stores/basemap-layers.store.svelte';
import { basemapAuxLayersStore } from '$lib/features/map/stores/basemap-aux-layers.store.svelte';
import { SYNTHETIC_AUX_LAYER_KEY } from '$lib/features/commons/constants/basemap.constants';
import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import {
  BasemapStyle,
  DEFAULT_TILED_BASEMAP_STYLE
} from '$lib/features/map/constants/basemap-styles';
import {
  getStyleConfig,
  getToggleableGroups,
  type LayerGroupId,
  type StyleConfig
} from '$lib/features/map/constants/carte-facile-layer-groups';
import { osmBasemapStore } from '$lib/features/map/stores/osm-basemap.store.svelte';
import {
  basemapService,
  getPreferredBasemapFile
} from '$lib/features/map/services/basemap.service.svelte';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import { resolveActiveBasemapMetadata } from '$lib/features/map/utils/basemap-metadata-resolution.utils';
import { facetsStore } from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';
import * as m from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';
import { BASEMAP_SUBLAYER_COLOR, VIZ_SUBLAYER_COLOR } from './layers.constants';
import type {
  Layer,
  LayerReorderScope,
  LayersState
} from '../../types/layers.types';
import type {
  BasemapLayer,
  BasemapMetadata
} from '$lib/features/map/types/basemap.types';

const DEFAULT_STATE: LayersState = {
  layers: []
};

const VISUALIZATION_SUBLAYER_SEPARATOR = '::';
const BASEMAP_SUBLAYER_SEPARATOR = '::basemap::';
const TILED_BASEMAP_LAYER_SEPARATOR = 'tiled-basemap::';
const VISUALIZATION_SUBLAYER_ORDER: PrimitiveFilter[] = [
  PrimitiveFilterType.TEXT,
  PrimitiveFilterType.POINT,
  PrimitiveFilterType.LINE,
  PrimitiveFilterType.POLYGON
];
const BASEMAP_LAYER_DISPLAY_ORDER: BasemapLayerId[] = [
  BASEMAP_LAYER_ID.FRONTIERES,
  BASEMAP_LAYER_ID.EQUATEUR,
  BASEMAP_LAYER_ID.MERIDIENS,
  BASEMAP_LAYER_ID.VILLES,
  BASEMAP_LAYER_ID.RIVIERES,
  BASEMAP_LAYER_ID.LACS,
  BASEMAP_LAYER_ID.RELIEF,
  BASEMAP_LAYER_ID.TERRE,
  BASEMAP_LAYER_ID.MERS,
  BASEMAP_LAYER_ID.SPHERE
];

const TILED_LAYER_ITEMS: Array<{
  id: string;
  groupIds: LayerGroupId[];
  defaultVisible: boolean;
}> = [
  { id: 'hydro', groupIds: ['hydro'], defaultVisible: true },
  { id: 'landcover', groupIds: ['landcover'], defaultVisible: true },
  { id: 'buildings', groupIds: ['buildings'], defaultVisible: true },
  { id: 'streets', groupIds: ['streets'], defaultVisible: true },
  { id: 'boundaries', groupIds: ['boundaries'], defaultVisible: true },
  { id: 'labels', groupIds: ['labels'], defaultVisible: true },
  {
    id: 'admin-boundaries',
    groupIds: ['admin_boundaries'],
    defaultVisible: false
  },
  { id: 'cadastre', groupIds: ['cadastre'], defaultVisible: false }
];

let basemapLayerDisplayOrder: BasemapLayerId[] = [];
const subLayerDisplayOrderByParent = new Map<string, string[]>();

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

function getClassificationColor(
  classification: { colors?: string[] } | undefined
): string | null {
  if (!Array.isArray(classification?.colors)) {
    return null;
  }

  return (
    classification.colors.find(
      (color): color is string => typeof color === 'string' && color.length > 0
    ) ?? null
  );
}

export function getVisualizationColor(viz: VisualizationConfig): string {
  const polygon = getPolygonPrimitive(viz);
  const symbol = getSymbolPrimitive(viz);
  const line = getLinePrimitive(viz);
  const text = getTextPrimitive(viz);

  const polygonColor =
    getStyleColor(polygon?.fillColor) ??
    getClassificationColor(
      getPrimitiveClassification(viz, PrimitiveFilterType.POLYGON)
    );
  if (polygon?.enabled && polygon.fillMode !== FillMode.NONE && polygonColor) {
    return polygonColor;
  }

  const symbolColor =
    getStyleColor(symbol?.fillColor) ??
    getClassificationColor(
      symbol?.mode === SymbolMode.CATEGORIES
        ? getPrimitiveClassification(viz, PrimitiveFilterType.POINT)
        : getSymbolFillClassification(viz)
    );
  if (symbol?.enabled && symbolColor) {
    return symbolColor;
  }

  const lineColor =
    getStyleColor(line?.color) ??
    getClassificationColor(
      getPrimitiveClassification(viz, PrimitiveFilterType.LINE)
    );
  if (line?.enabled && lineColor) {
    return lineColor;
  }

  const textColor =
    getStyleColor(text?.color) ??
    getStyleColor(text?.secondaryLabels.color) ??
    getClassificationColor(
      getPrimitiveClassification(viz, PrimitiveFilterType.TEXT)
    );
  if (text?.enabled && textColor) {
    return textColor;
  }

  if (typeof polygon?.strokeColor === 'string' && polygon.strokeColor) {
    return polygon.strokeColor;
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
  switch (primitive) {
    case PrimitiveFilterType.LINE: {
      const line = getLinePrimitive(viz);
      const classificationColor = getClassificationColor(
        getPrimitiveClassification(viz, PrimitiveFilterType.LINE)
      );
      return (
        getStyleColor(line?.color) ??
        classificationColor ??
        getVisualizationColor(viz)
      );
    }
    case PrimitiveFilterType.POLYGON: {
      const polygon = getPolygonPrimitive(viz);
      const classificationColor = getClassificationColor(
        getPrimitiveClassification(viz, PrimitiveFilterType.POLYGON)
      );
      if (
        polygon?.fillMode === FillMode.NONE ||
        (polygon?.fillOpacity ?? 1) <= 0
      ) {
        return (
          (typeof polygon?.strokeColor === 'string'
            ? polygon.strokeColor
            : null) ??
          classificationColor ??
          getVisualizationColor(viz)
        );
      }

      return (
        getStyleColor(polygon?.fillColor) ??
        classificationColor ??
        (typeof polygon?.strokeColor === 'string'
          ? polygon.strokeColor
          : null) ??
        getVisualizationColor(viz)
      );
    }
    case PrimitiveFilterType.TEXT: {
      const text = getTextPrimitive(viz);
      const classificationColor = getClassificationColor(
        getPrimitiveClassification(viz, PrimitiveFilterType.TEXT)
      );
      return (
        getStyleColor(text?.color) ??
        getStyleColor(text?.secondaryLabels?.color) ??
        classificationColor ??
        getVisualizationColor(viz)
      );
    }
    case PrimitiveFilterType.POINT:
    default: {
      const symbol = getSymbolPrimitive(viz);
      const classificationColor = getClassificationColor(
        symbol?.mode === SymbolMode.CATEGORIES
          ? getPrimitiveClassification(viz, PrimitiveFilterType.POINT)
          : getSymbolFillClassification(viz)
      );
      return (
        getStyleColor(symbol?.fillColor) ??
        classificationColor ??
        (typeof symbol?.strokeColor === 'string' ? symbol.strokeColor : null) ??
        getVisualizationColor(viz)
      );
    }
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
  basemapLayerKey: string
): string {
  return `${visualizationId}${BASEMAP_SUBLAYER_SEPARATOR}${basemapLayerKey}`;
}

function buildTiledBasemapLayerId(layerId: string): string {
  return `${TILED_BASEMAP_LAYER_SEPARATOR}${layerId}`;
}

function getVisualizationPrimitiveName(primitive: PrimitiveFilter): string {
  switch (primitive) {
    case PrimitiveFilterType.POINT:
      return m.symbols_title();
    case PrimitiveFilterType.LINE:
      return m.lines_title();
    case PrimitiveFilterType.POLYGON:
      return m.polygons_title();
    case PrimitiveFilterType.TEXT:
      return m.texts_title();
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
      return Math.round((getSymbolPrimitive(viz)?.opacity ?? 1) * 100);
    case PrimitiveFilterType.LINE:
      return Math.round((getLinePrimitive(viz)?.opacity ?? 1) * 100);
    case PrimitiveFilterType.POLYGON:
      return Math.round((getPolygonPrimitive(viz)?.fillOpacity ?? 1) * 100);
    case PrimitiveFilterType.TEXT:
      return Math.round((getTextPrimitive(viz)?.opacity ?? 1) * 100);
    default:
      return 100;
  }
}

function getVisualizationOpacity(viz: VisualizationConfig): number {
  const polygon = getPolygonPrimitive(viz);
  if (polygon?.enabled && polygon.fillMode !== FillMode.NONE) {
    return Math.round((polygon.fillOpacity ?? 1) * 100);
  }

  const symbol = getSymbolPrimitive(viz);
  if (symbol?.enabled) {
    return Math.round((symbol.opacity ?? 1) * 100);
  }

  const line = getLinePrimitive(viz);
  if (line?.enabled) {
    return Math.round((line.opacity ?? 1) * 100);
  }

  const text = getTextPrimitive(viz);
  if (text?.enabled) {
    return Math.round((text.opacity ?? 1) * 100);
  }

  return 100;
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
    case BASEMAP_LAYER_ID.SPHERE:
      return m.basemap_layer_sphere();
    default:
      return layerId;
  }
}

function getTiledLayerName(layerId: string): string {
  switch (layerId) {
    case 'hydro':
      return m.carte_facile_group_hydro();
    case 'landcover':
      return m.carte_facile_group_landcover();
    case 'buildings':
      return m.carte_facile_group_buildings();
    case 'streets':
      return m.carte_facile_group_streets();
    case 'boundaries':
      return m.carte_facile_group_boundaries();
    case 'labels':
      return m.carte_facile_group_labels();
    case 'admin-boundaries':
      return m.carte_facile_group_admin_boundaries();
    case 'cadastre':
      return m.carte_facile_group_cadastre();
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

function applySubLayerDisplayOrder(
  parentId: string,
  subLayers: Layer[]
): Layer[] {
  const savedOrder = subLayerDisplayOrderByParent.get(parentId);
  if (!savedOrder) {
    return subLayers.map((layer, order) => ({ ...layer, order }));
  }

  const layerById = new Map(subLayers.map((layer) => [layer.id, layer]));
  const savedIds = savedOrder.filter((id) => layerById.has(id));
  const savedIdSet = new Set(savedIds);
  const missingLayers = subLayers.filter((layer) => !savedIdSet.has(layer.id));

  if (savedIds.length === 0) {
    subLayerDisplayOrderByParent.delete(parentId);
    return subLayers.map((layer, order) => ({ ...layer, order }));
  }

  const orderedLayers: Layer[] = [];
  for (const id of savedIds) {
    const layer = layerById.get(id);
    if (layer) {
      orderedLayers.push(layer);
    }
  }
  orderedLayers.push(...missingLayers);
  const nextOrder = orderedLayers.map((layer) => layer.id);
  subLayerDisplayOrderByParent.set(parentId, nextOrder);

  return orderedLayers.map((layer, order) => ({ ...layer, order }));
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

function getActiveReferenceBasemapMetadata(): BasemapMetadata | null {
  const referenceBasemapId = basemapStyleStore.referenceBasemapId;
  if (!referenceBasemapId) {
    return null;
  }

  const resolvedBasemapId = getPreferredBasemapFile(
    basemapService.availableBasemaps,
    referenceBasemapId
  );

  return resolveActiveBasemapMetadata({
    referenceBasemapId,
    resolvedBasemapId,
    availableBasemaps: basemapService.availableBasemaps,
    currentMetadata: basemapService.currentMetadata
  });
}

function pickMetadataLayerName(layer: BasemapLayer): string {
  const title = getLocale() === 'fr' ? layer.title_fr : layer.title_en;
  return title?.trim() || layer.title_fr?.trim() || layer.type;
}

function isBasemapLayersToolRenderableType(type: BasemapLayerType): boolean {
  return (
    type !== BasemapLayerType.CENTROID &&
    type !== BasemapLayerType.GEOGRAPHIC_LINES
  );
}

function isEntryScopedMetadataLayer(type: BasemapLayerType): boolean {
  return type !== BasemapLayerType.LAND;
}

function getCustomBaseLayerType(
  metadata: BasemapMetadata
): BasemapLayerType | undefined {
  return metadata.layers.find(
    (layer) =>
      layer.type === BasemapLayerType.POLYGON ||
      layer.type === BasemapLayerType.LINE ||
      layer.type === BasemapLayerType.POINT
  )?.type;
}

function mapMetadataLayerTypeToBasemapLayerId(
  type: BasemapLayerType,
  isCustom: boolean,
  isCustomLine: boolean
): BasemapLayerId | null {
  switch (type) {
    case BasemapLayerType.LAND:
      return isCustomLine ? null : BASEMAP_LAYER_ID.TERRE;
    case BasemapLayerType.LIMIT:
      return BASEMAP_LAYER_ID.FRONTIERES;
    case BasemapLayerType.CENTROID:
    case BasemapLayerType.POINT:
      return isCustom ? null : BASEMAP_LAYER_ID.VILLES;
    case BasemapLayerType.GRATICULE:
      return BASEMAP_LAYER_ID.MERIDIENS;
    case BasemapLayerType.GEOGRAPHIC_LINES:
      return BASEMAP_LAYER_ID.MERIDIENS;
    case BasemapLayerType.POLYGON:
      return isCustom ? BASEMAP_LAYER_ID.TERRE : BASEMAP_LAYER_ID.MERS;
    case BasemapLayerType.LINE:
      return isCustom ? BASEMAP_LAYER_ID.FRONTIERES : BASEMAP_LAYER_ID.RIVIERES;
    case BasemapLayerType.SPHERE:
      return BASEMAP_LAYER_ID.SPHERE;
    default:
      return null;
  }
}

interface BasemapDisplayEntry {
  layerId?: BasemapLayerId;
  file?: string;
  key?: string;
  name: string;
  visible: boolean;
  color: string;
  opacity: number;
  renderGroup: LayerReorderScope;
  primary: boolean;
  synthetic: boolean;
}

function buildSyntheticBasemapEntries(
  basemapFile: string | null
): BasemapDisplayEntry[] {
  const synthetics: { layerId: BasemapLayerId; key?: string }[] = [
    { layerId: BASEMAP_LAYER_ID.EQUATEUR },
    { layerId: BASEMAP_LAYER_ID.MERIDIENS },
    { layerId: BASEMAP_LAYER_ID.MERS, key: SYNTHETIC_AUX_LAYER_KEY.MERS },
    { layerId: BASEMAP_LAYER_ID.SPHERE, key: SYNTHETIC_AUX_LAYER_KEY.SPHERE }
  ];

  return synthetics.flatMap(({ layerId, key }): BasemapDisplayEntry[] => {
    const config = basemapLayersStore.getLayer(layerId);
    if (!config) return [];
    const auxVisible =
      basemapFile && key
        ? basemapAuxLayersStore.isVisible(basemapFile, key, true)
        : true;
    return [
      {
        layerId,
        file: basemapFile ?? undefined,
        key: basemapFile ? key : undefined,
        name: getBasemapLayerName(layerId),
        visible: config.visible && auxVisible,
        color: getBasemapLayerColor(config),
        opacity: getBasemapLayerOpacity(config),
        renderGroup: `geographic-${getBasemapRenderGroup(layerId)}`,
        primary: true,
        synthetic: true
      }
    ];
  });
}

function buildBasemapDisplayEntries(): BasemapDisplayEntry[] {
  const metadata = getActiveReferenceBasemapMetadata();
  if (!metadata) {
    return [];
  }

  const entries: BasemapDisplayEntry[] = buildSyntheticBasemapEntries(
    metadata.file
  );

  const isCustom = Boolean(metadata.isCustom);
  const isCustomLine =
    isCustom && getCustomBaseLayerType(metadata) === BasemapLayerType.LINE;
  const typeCounters = new Map<BasemapLayerType, number>();

  for (const layer of metadata.layers) {
    if (!isBasemapLayersToolRenderableType(layer.type)) continue;
    const instanceIndex = typeCounters.get(layer.type) ?? 0;
    typeCounters.set(layer.type, instanceIndex + 1);
    const usesEntryScopedVisibility = isEntryScopedMetadataLayer(layer.type);
    const layerKey = usesEntryScopedVisibility
      ? (layer.file ?? `${metadata.file}:${layer.type}`)
      : undefined;
    const basemapLayerId = mapMetadataLayerTypeToBasemapLayerId(
      layer.type,
      isCustom,
      isCustomLine
    );
    const config = basemapLayerId
      ? basemapLayersStore.getLayer(basemapLayerId)
      : undefined;
    const entryVisible = layerKey
      ? basemapAuxLayersStore.isVisible(metadata.file, layerKey, true)
      : true;

    entries.push({
      layerId: basemapLayerId ?? undefined,
      file: layerKey ? metadata.file : undefined,
      key: layerKey,
      name: pickMetadataLayerName(layer),
      visible: entryVisible && (config?.visible ?? true),
      color: config ? getBasemapLayerColor(config) : BASEMAP_SUBLAYER_COLOR,
      opacity: config ? getBasemapLayerOpacity(config) : 100,
      renderGroup: basemapLayerId
        ? `geographic-${getBasemapRenderGroup(basemapLayerId)}`
        : 'geographic-foreground',
      primary: instanceIndex === 0,
      synthetic: false
    });
  }

  return entries;
}

function orderBasemapEntriesForDisplay(
  entries: BasemapDisplayEntry[]
): BasemapDisplayEntry[] {
  const file = entries.find((entry) => entry.file)?.file;
  if (!file) {
    return entries;
  }

  const keyedEntries = entries.filter(
    (entry): entry is BasemapDisplayEntry & { key: string } =>
      typeof entry.key === 'string' && entry.key.length > 0
  );
  const orderedKeys = basemapAuxLayersStore.getOrderedLayerKeys(
    file,
    keyedEntries.map((entry) => entry.key)
  );
  const orderIndex = new Map(
    orderedKeys.map((key, index) => [key, index] as const)
  );

  return [...entries].sort((a, b) => {
    const aIndex = a.key
      ? (orderIndex.get(a.key) ?? Number.MAX_SAFE_INTEGER)
      : 0;
    const bIndex = b.key
      ? (orderIndex.get(b.key) ?? Number.MAX_SAFE_INTEGER)
      : 0;
    return aIndex - bIndex;
  });
}

function getBasemapDisplayOrder(layerId: BasemapLayerId | undefined): number {
  if (!layerId) return Number.MAX_SAFE_INTEGER;
  const order =
    basemapLayerDisplayOrder.length > 0
      ? basemapLayerDisplayOrder
      : BASEMAP_LAYER_DISPLAY_ORDER;
  const index = order.indexOf(layerId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function setBasemapLayerDisplayOrder(layerIds: BasemapLayerId[]): void {
  const uniqueIds = layerIds.filter(
    (layerId, index, order) => order.indexOf(layerId) === index
  );
  basemapLayerDisplayOrder = [
    ...uniqueIds,
    ...BASEMAP_LAYER_DISPLAY_ORDER.filter(
      (layerId) => !uniqueIds.includes(layerId)
    )
  ];
}

function buildVectorBasemapSubLayers(
  visualizationId: string,
  startOrder: number
): Layer[] {
  const entries = buildBasemapDisplayEntries();
  const grouped = new Map<string, BasemapDisplayEntry[]>();

  for (const entry of entries) {
    const groupKey = entry.layerId ?? entry.key ?? entry.name;
    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), entry]);
  }

  const rows: Array<{ layer: Layer; displayOrder: number }> = [];

  for (const [groupKey, groupEntries] of grouped) {
    const firstEntry = groupEntries[0];
    if (!firstEntry) continue;

    const layerId = firstEntry.layerId;
    const config = layerId ? basemapLayersStore.getLayer(layerId) : undefined;
    const orderedEntries = orderBasemapEntriesForDisplay(groupEntries);
    const keys = orderedEntries
      .map((entry) => entry.key)
      .filter((key): key is string => typeof key === 'string');
    const basemapFile = orderedEntries.find((entry) => entry.file)?.file;
    const visibleEntries = orderedEntries.some((entry) => entry.visible);
    const visible = config ? config.visible && visibleEntries : visibleEntries;

    rows.push({
      displayOrder: getBasemapDisplayOrder(layerId),
      layer: {
        id: buildBasemapSubLayerId(visualizationId, layerId ?? groupKey),
        parentId: visualizationId,
        isSubLayer: true,
        type: 'geographic',
        basemapLayerId: layerId,
        basemapFile,
        basemapLayerKey: keys.length === 1 ? keys[0] : undefined,
        basemapLayerKeys: keys.length > 0 ? keys : undefined,
        basemapLayerPrimary: orderedEntries.some((entry) => entry.primary),
        basemapRenderGroup: firstEntry.renderGroup.replace(
          'geographic-',
          ''
        ) as Layer['basemapRenderGroup'],
        name: layerId ? getBasemapLayerName(layerId) : firstEntry.name,
        visible,
        color: config ? getBasemapLayerColor(config) : firstEntry.color,
        opacity: config ? getBasemapLayerOpacity(config) : firstEntry.opacity,
        order: startOrder
      }
    });
  }

  return rows
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(({ layer }, index) => ({
      ...layer,
      order: startOrder + index
    }));
}

function resolveTiledStyleConfig(): StyleConfig | null {
  const hasTiledBasemap =
    basemapStyleStore.selectedStyle !== BasemapStyle.BLANK_WHITE ||
    osmBasemapStore.isActive;
  if (!hasTiledBasemap) {
    return null;
  }

  const style =
    basemapStyleStore.selectedStyle === BasemapStyle.BLANK_WHITE
      ? (basemapStyleStore.lastSelectedTiledStyle ??
        basemapStyleStore.preferredTiledStyle ??
        DEFAULT_TILED_BASEMAP_STYLE)
      : basemapStyleStore.selectedStyle;

  return getStyleConfig(style) ?? null;
}

function isTiledLayerVisible(
  config: StyleConfig,
  groupIds: readonly LayerGroupId[],
  fallbackVisible: boolean
): boolean {
  return groupIds.every(
    (groupId) =>
      basemapStyleStore.groupVisibility[groupId] ??
      config.groups.find((group) => group.id === groupId)?.defaultVisible ??
      fallbackVisible
  );
}

function buildTiledBasemapSubLayers(
  visualizationId: string,
  startOrder: number
): Layer[] {
  const config = resolveTiledStyleConfig();
  if (!config) {
    return [];
  }

  const visibleGroupIds = new Set(
    getToggleableGroups(config).map((group) => group.id)
  );

  return TILED_LAYER_ITEMS.filter((item) =>
    item.groupIds.every((groupId) => visibleGroupIds.has(groupId))
  ).map(
    (item, index): Layer => ({
      id: buildBasemapSubLayerId(
        visualizationId,
        buildTiledBasemapLayerId(item.id)
      ),
      parentId: visualizationId,
      isSubLayer: true,
      type: 'geographic',
      basemapRenderGroup: 'background',
      tiledLayerGroupIds: item.groupIds,
      tiledLayerDefaultVisible: item.defaultVisible,
      name: getTiledLayerName(item.id),
      visible: isTiledLayerVisible(config, item.groupIds, item.defaultVisible),
      color: BASEMAP_SUBLAYER_COLOR,
      opacity: 100,
      order: startOrder + index
    })
  );
}

function buildLayers(): Layer[] {
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

  const visualizationLayers = displayVisualizations.flatMap(
    (viz, vizOrder): Layer[] => {
      const primitiveFilters = getEnabledPrimitiveFilters(viz);
      const isFacetViz = facetsEnabled && facetVizIds.has(viz.id);

      let layerName: string;
      if (isFacetViz) {
        facetIndex += 1;
        layerName = `${m.layers_carte_title()} ${facetIndex} (${viz.name})`;
      } else {
        layerName = viz.name || m.viz_tab_label({ number: vizOrder + 1 });
      }

      const parentLayer: Layer = {
        id: viz.id,
        name: layerName,
        visible: isFacetViz || activeVisualizationIds.has(viz.id),
        type: 'visualization',
        color: getVisualizationColor(viz),
        opacity: getVisualizationOpacity(viz),
        order: vizOrder
      };

      const vizPrimitiveOrder = (
        viz.primitiveOrder ?? VISUALIZATION_SUBLAYER_ORDER
      ).filter((primitive, index, order) => order.indexOf(primitive) === index);

      const vizSubLayers = vizPrimitiveOrder.map(
        (primitive, i): Layer => ({
          id: buildVisualizationSubLayerId(viz.id, primitive),
          parentId: viz.id,
          isSubLayer: true,
          primitive,
          name: getVisualizationPrimitiveName(primitive),
          visible: primitiveFilters.includes(primitive),
          type: 'visualization',
          color: getVisualizationPrimitiveColor(viz, primitive),
          opacity: getVisualizationPrimitiveOpacity(viz, primitive),
          order: i
        })
      );

      const basemapSubLayers =
        resolveTiledStyleConfig() !== null
          ? buildTiledBasemapSubLayers(viz.id, vizSubLayers.length)
          : buildVectorBasemapSubLayers(viz.id, vizSubLayers.length);

      const subLayers = applySubLayerDisplayOrder(viz.id, [
        ...vizSubLayers,
        ...basemapSubLayers
      ]);

      return [parentLayer, ...subLayers];
    }
  );

  return visualizationLayers;
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
            visualizationStore.renameVisualization(id, updates.name);
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
          if (layer.tiledLayerGroupIds) {
            for (const groupId of layer.tiledLayerGroupIds) {
              basemapStyleStore.setGroupVisibility(groupId, !layer.visible);
            }
          }

          if (layer.basemapFile && layer.basemapLayerKeys?.length) {
            for (const layerKey of layer.basemapLayerKeys) {
              basemapAuxLayersStore.setVisible(
                layer.basemapFile,
                layerKey,
                !layer.visible
              );
            }
          } else if (layer.basemapFile && layer.basemapLayerKey) {
            basemapAuxLayersStore.setVisible(
              layer.basemapFile,
              layer.basemapLayerKey,
              !layer.visible
            );
          }

          if (layer.basemapLayerId) {
            basemapLayersStore.setLayerVisibility(
              layer.basemapLayerId as BasemapLayerId,
              !layer.visible
            );
          }
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
        subLayerDisplayOrderByParent.set(
          parentId,
          reordered.map((layer) => layer.id)
        );

        const vizPrimitives = reordered
          .filter((layer) => layer.type === 'visualization' && layer.primitive)
          .map((layer) => layer.primitive as PrimitiveFilter);

        if (vizPrimitives.length > 0) {
          visualizationStore.setPrimitiveFilterOrder(parentId, vizPrimitives);
        }

        const basemapLayers = reordered.filter(
          (layer) => layer.type === 'geographic' && layer.basemapLayerId
        );
        const basemapLayerIds = basemapLayers
          .map((layer) => layer.basemapLayerId)
          .filter(
            (layerId): layerId is BasemapLayerId => typeof layerId === 'string'
          );
        if (basemapLayerIds.length > 0) {
          setBasemapLayerDisplayOrder(basemapLayerIds);
        }

        const foreground = basemapLayers
          .filter((layer) => layer.basemapRenderGroup === 'foreground')
          .map((layer) => layer.basemapLayerId as BasemapLayerId);
        const background = basemapLayers
          .filter((layer) => layer.basemapRenderGroup === 'background')
          .map((layer) => layer.basemapLayerId as BasemapLayerId);

        if (foreground.length > 0) {
          basemapLayersStore.setLayerRenderGroupOrder('foreground', foreground);
        }
        if (background.length > 0) {
          basemapLayersStore.setLayerRenderGroupOrder('background', background);
        }

        const basemapEntryLayers = reordered.filter(
          (layer) => layer.type === 'geographic' && layer.basemapFile
        );
        const basemapFile = basemapEntryLayers[0]?.basemapFile;
        if (basemapFile && basemapEntryLayers.length > 0) {
          const orderedKeys = basemapEntryLayers.flatMap(
            (layer) =>
              layer.basemapLayerKeys ??
              (layer.basemapLayerKey ? [layer.basemapLayerKey] : [])
          );
          basemapAuxLayersStore.setOrder(
            basemapFile,
            orderedKeys.filter(
              (layerKey, index, keys) => keys.indexOf(layerKey) === index
            )
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
