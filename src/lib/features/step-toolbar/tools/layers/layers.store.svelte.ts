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
const GLOBAL_BASEMAP_LAYER_PREFIX = 'basemap';
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

type LayersActions = {
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  toggleLayerVisibility: (id: string) => void;
  /**
   * Single flat reorder action (#182): moves a row in the flattened panel list
   * and back-projects the resulting absolute order onto the three render
   * stores (visualization order, primitive order, basemap render-group order,
   * above/below-thematic flag, aux-key order). The render-store semantics —
   * `getMapLayerRenderOrder` / `getVisualizationRenderOrder` — never change, so
   * `buildLayers` re-clamps the result to the back→thematic→front invariant.
   */
  reorderLayers: (fromIndex: number, toIndex: number) => void;
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

// Basemap auxiliary layers are deduplicated globally in the flattened panel
// (#182): a single row drives the one shared GPU basemap stack, so its id no
// longer carries a per-visualization prefix.
function buildBasemapSubLayerId(basemapLayerKey: string): string {
  return `${GLOBAL_BASEMAP_LAYER_PREFIX}${VISUALIZATION_SUBLAYER_SEPARATOR}${basemapLayerKey}`;
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

// Flattened panel rows have no parent header, so each primitive row carries its
// visualization name: "<primitive> · <visualization>".
function getPrimitiveLayerName(
  primitive: PrimitiveFilter,
  visualizationLabel: string
): string {
  return m.layers_primitive_of_visualization({
    primitive: getVisualizationPrimitiveName(primitive),
    visualization: visualizationLabel
  });
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

/**
 * Recovers the single (from → to) move that turns `current` into `next` when
 * `next` is a one-element reordering of the same set. Used to translate a flat
 * drag of facet rows into `facetsStore.reorderVariables(from, to)`. Returns
 * `null` when the orders are equal, differ in membership, or differ by more
 * than a single move (in which case the caller leaves the facet order alone).
 */
function deriveSingleMove(
  current: readonly string[],
  next: readonly string[]
): { from: number; to: number } | null {
  if (
    current.length !== next.length ||
    current.length === 0 ||
    arraysShallowEqual(current, next)
  ) {
    return null;
  }
  if (new Set(current).size !== current.length) {
    return null;
  }
  const sameMembers =
    new Set(current).size === new Set([...current, ...next]).size;
  if (!sameMembers) {
    return null;
  }

  for (let from = 0; from < current.length; from += 1) {
    for (let to = 0; to < current.length; to += 1) {
      if (from === to) continue;
      if (arraysShallowEqual(reorderIds([...current], from, to), next)) {
        return { from, to };
      }
    }
  }
  return null;
}

function arraysShallowEqual(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function withFlatOrder(layers: Layer[]): Layer[] {
  return layers.map((layer, order) => ({ ...layer, order }));
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

// Intra-group ordering of basemap auxiliary rows is read straight from the
// store (the single source of truth, reordered by `setLayerRenderGroupOrder`),
// falling back to the canonical order for layers the store doesn't carry. The
// inter-group placement (foreground/background vs thematic) is owned by
// `buildLayers`, so there is no separate module-level order to keep in sync.
function getBasemapDisplayOrder(layerId: BasemapLayerId | undefined): number {
  if (!layerId) return Number.MAX_SAFE_INTEGER;
  const storeIndex = basemapLayersStore.layers.findIndex(
    (layer) => layer.id === layerId
  );
  if (storeIndex !== -1) {
    return storeIndex;
  }
  const fallbackIndex = BASEMAP_LAYER_DISPLAY_ORDER.indexOf(layerId);
  return fallbackIndex === -1 ? Number.MAX_SAFE_INTEGER : fallbackIndex;
}

function buildVectorBasemapSubLayers(): Layer[] {
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
        id: buildBasemapSubLayerId(layerId ?? groupKey),
        isSubLayer: true,
        kind: 'basemap-aux',
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
        basemapRenderBelowThematic: config?.renderBelowThematic ?? false,
        name: layerId ? getBasemapLayerName(layerId) : firstEntry.name,
        visible,
        color: config ? getBasemapLayerColor(config) : firstEntry.color,
        opacity: config ? getBasemapLayerOpacity(config) : firstEntry.opacity,
        order: 0
      }
    });
  }

  return rows
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(({ layer }, index) => ({ ...layer, order: index }));
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

function buildTiledBasemapSubLayers(): Layer[] {
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
      id: buildBasemapSubLayerId(buildTiledBasemapLayerId(item.id)),
      isSubLayer: true,
      kind: 'basemap-aux',
      type: 'geographic',
      basemapRenderGroup: 'background',
      tiledLayerGroupIds: item.groupIds,
      tiledLayerDefaultVisible: item.defaultVisible,
      name: getTiledLayerName(item.id),
      visible: isTiledLayerVisible(config, item.groupIds, item.defaultVisible),
      color: BASEMAP_SUBLAYER_COLOR,
      opacity: 100,
      order: index
    })
  );
}

// Top→bottom of the flattened panel maps to front→back of the render. Within
// the global thematic block the foreground-below basemap layers insert after
// the last marker (non-polygon) primitive in panel order — which is the first
// marker in the reversed Deck array, matching `getMapLayerRenderOrder`.
function isMarkerPrimitiveLayer(layer: Layer): boolean {
  return (
    layer.kind === 'viz-primitive' &&
    layer.primitive !== undefined &&
    layer.primitive !== PrimitiveFilterType.POLYGON
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

  // Global thematic block: every active primitive of every visualization, in
  // visualization order (viz[0] is front = top of the panel) then primitive
  // order within each. No separate parent row — each line is a primitive·viz.
  const thematicLayers = displayVisualizations.flatMap(
    (viz, vizOrder): Layer[] => {
      const primitiveFilters = getEnabledPrimitiveFilters(viz);
      const isFacetViz = facetsEnabled && facetVizIds.has(viz.id);

      let vizLabel: string;
      if (isFacetViz) {
        facetIndex += 1;
        vizLabel = `${m.layers_carte_title()} ${facetIndex} (${viz.name})`;
      } else {
        vizLabel = viz.name || m.viz_tab_label({ number: vizOrder + 1 });
      }

      const vizVisible = isFacetViz || activeVisualizationIds.has(viz.id);

      const vizPrimitiveOrder = (
        viz.primitiveOrder ?? VISUALIZATION_SUBLAYER_ORDER
      ).filter((primitive, index, order) => order.indexOf(primitive) === index);

      return vizPrimitiveOrder.map(
        (primitive, i): Layer => ({
          id: buildVisualizationSubLayerId(viz.id, primitive),
          parentId: viz.id,
          isSubLayer: true,
          kind: 'viz-primitive',
          primitive,
          name: getPrimitiveLayerName(primitive, vizLabel),
          visible: vizVisible && primitiveFilters.includes(primitive),
          type: 'visualization',
          color: getVisualizationPrimitiveColor(viz, primitive),
          opacity: getVisualizationPrimitiveOpacity(viz, primitive),
          order: i
        })
      );
    }
  );

  // Global, deduplicated basemap auxiliary block (one row per shared layer).
  const basemapLayers =
    resolveTiledStyleConfig() !== null
      ? buildTiledBasemapSubLayers()
      : buildVectorBasemapSubLayers();

  const foregroundAboveLayers = basemapLayers.filter(
    (layer) =>
      layer.basemapRenderGroup === 'foreground' &&
      !layer.basemapRenderBelowThematic
  );
  const foregroundBelowLayers = basemapLayers.filter(
    (layer) =>
      layer.basemapRenderGroup === 'foreground' &&
      layer.basemapRenderBelowThematic
  );
  const backgroundLayers = basemapLayers.filter(
    (layer) => layer.basemapRenderGroup === 'background'
  );

  const lastMarkerIndex = thematicLayers.reduce(
    (last, layer, index) => (isMarkerPrimitiveLayer(layer) ? index : last),
    -1
  );
  const thematicWithForegroundBelow = [
    ...thematicLayers.slice(0, lastMarkerIndex + 1),
    ...foregroundBelowLayers,
    ...thematicLayers.slice(lastMarkerIndex + 1)
  ];

  return withFlatOrder([
    ...foregroundAboveLayers,
    ...thematicWithForegroundBelow,
    ...backgroundLayers
  ]);
}

/**
 * Back-projects a reordered flat panel list onto the three render stores.
 *
 * The flat list is the single source the user drags; this re-derives the five
 * ordering dimensions the render path actually consumes. `buildLayers` then
 * re-clamps to the back→thematic→front invariant on the next sync, so an
 * impossible drop (e.g. a background layer dropped between two primitives)
 * snaps back without ever corrupting the GPU stack.
 */
function backProjectFlatOrder(reordered: Layer[]): void {
  // Each setter is only called when its own dimension actually changed, so a
  // drag that only moves a primitive (or a basemap row) never writes the
  // visualization order, and vice-versa — matching the pre-flatten behaviour
  // and avoiding parasitic re-renders / saves.

  // 1. Visualization order: first appearance of each parent visualization,
  //    top→bottom (= front→back). Reversed nowhere — viz[0] stays in front.
  const seenVizIds = new Set<string>();
  const orderedVizIds: string[] = [];
  for (const layer of reordered) {
    if (
      layer.kind === 'viz-primitive' &&
      typeof layer.parentId === 'string' &&
      !seenVizIds.has(layer.parentId)
    ) {
      seenVizIds.add(layer.parentId);
      orderedVizIds.push(layer.parentId);
    }
  }
  if (orderedVizIds.length > 0) {
    // When facets are active the displayed visualizations are the generated
    // facets; their order must flow through `facetsStore.reorderVariables` so
    // the facet `variables` and `generatedVisualizationIds` stay in lockstep —
    // never a raw `setVisualizationOrder` (which would desync the collection).
    if (facetsStore.enabled) {
      const facetMove = deriveSingleMove(
        facetsStore.generatedVisualizationIds,
        orderedVizIds
      );
      if (facetMove) {
        void facetsStore.reorderVariables(facetMove.from, facetMove.to);
      }
    } else {
      const currentVizOrder = visualizationStore.visualizations.map(
        (v) => v.id
      );
      if (!arraysShallowEqual(currentVizOrder, orderedVizIds)) {
        visualizationStore.setVisualizationOrder(orderedVizIds);
      }
    }
  }

  // 2. Primitive order within each visualization, top→bottom.
  const primitivesByViz = new Map<string, PrimitiveFilter[]>();
  for (const layer of reordered) {
    if (
      layer.kind === 'viz-primitive' &&
      typeof layer.parentId === 'string' &&
      layer.primitive
    ) {
      const list = primitivesByViz.get(layer.parentId) ?? [];
      list.push(layer.primitive);
      primitivesByViz.set(layer.parentId, list);
    }
  }
  for (const [vizId, primitives] of primitivesByViz) {
    if (primitives.length === 0) continue;
    const currentOrder = (
      visualizationStore.visualizations.find((v) => v.id === vizId)
        ?.primitiveOrder ?? []
    ).filter((primitive) => primitives.includes(primitive));
    if (!arraysShallowEqual(currentOrder, primitives)) {
      visualizationStore.setPrimitiveFilterOrder(vizId, primitives);
    }
  }

  // 3. Basemap render-group order (deduplicated global layers). The store is
  //    the single source of intra-group order, so this is all that is needed —
  //    no separate module-level display order to update.
  const basemapLayers = reordered.filter(
    (layer) => layer.kind === 'basemap-aux' && layer.basemapLayerId
  );

  const foreground = basemapLayers
    .filter((layer) => layer.basemapRenderGroup === 'foreground')
    .map((layer) => layer.basemapLayerId as BasemapLayerId);
  const background = basemapLayers
    .filter((layer) => layer.basemapRenderGroup === 'background')
    .map((layer) => layer.basemapLayerId as BasemapLayerId);
  // `setLayerRenderGroupOrder` is idempotent and group-scoped, so it is safe to
  // call unconditionally — it never touches the visualization order.
  if (foreground.length > 0) {
    basemapLayersStore.setLayerRenderGroupOrder('foreground', foreground);
  }
  if (background.length > 0) {
    basemapLayersStore.setLayerRenderGroupOrder('background', background);
  }

  // 4. Above/below-thematic flag for foreground basemap layers: below when the
  //    row sits under the last marker (non-polygon) primitive in panel order —
  //    the same rule `buildLayers` and `getMapLayerRenderOrder` apply.
  const lastMarkerIndex = reordered.reduce(
    (last, layer, index) => (isMarkerPrimitiveLayer(layer) ? index : last),
    -1
  );
  reordered.forEach((layer, index) => {
    if (
      layer.kind === 'basemap-aux' &&
      layer.basemapRenderGroup === 'foreground' &&
      typeof layer.basemapLayerId === 'string'
    ) {
      basemapLayersStore.setLayerThematicPlacement(
        layer.basemapLayerId as BasemapLayerId,
        lastMarkerIndex < 0 || index > lastMarkerIndex
      );
    }
  });

  // 5. Aux-key order for metadata-backed basemap layers (per basemap file).
  const basemapEntryLayers = reordered.filter(
    (layer) => layer.kind === 'basemap-aux' && layer.basemapFile
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
        if (!layer) {
          // Visualization-scoped update addressed by visualization id (rename
          // from the row context menu — there is no standalone parent row).
          const visualization = visualizationStore.visualizations.find(
            (v) => v.id === id
          );
          if (!visualization) return;
          if (updates.name !== undefined) {
            visualizationStore.renameVisualization(id, updates.name);
          }
          syncFromSources();
          return;
        }

        if (layer.kind === 'viz-primitive' && layer.parentId) {
          if (updates.name !== undefined) {
            visualizationStore.renameVisualization(
              layer.parentId,
              updates.name
            );
          }
        }

        syncFromSources();
      },
      removeLayer: (id: string) => {
        // Addressed by visualization id (the row context menu targets a whole
        // visualization, not a single primitive row).
        const visualization = visualizationStore.visualizations.find(
          (v) => v.id === id
        );
        if (!visualization) return;

        visualizationStore.removeVisualization(id);
        syncFromSources();
      },
      toggleLayerVisibility: (id: string) => {
        const layer = findLayer(id);
        if (!layer) {
          // A whole visualization, toggled by id from the row context menu.
          if (visualizationStore.visualizations.some((v) => v.id === id)) {
            visualizationStore.toggleVisualization(id);
            syncFromSources();
          }
          return;
        }

        if (layer.kind === 'basemap-aux') {
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
        } else if (layer.kind === 'viz-primitive') {
          if (layer.parentId && layer.primitive) {
            visualizationStore.togglePrimitiveFilter(
              layer.parentId,
              layer.primitive
            );
          }
        }

        syncFromSources();
      },
      reorderLayers: (fromIndex: number, toIndex: number) => {
        const reordered = reorderIds([...s.layers], fromIndex, toIndex);
        if (reordered === s.layers) {
          return;
        }
        backProjectFlatOrder(reordered);
        syncFromSources();
      },
      duplicateLayer: (id: string): Layer | null => {
        const visualization = visualizationStore.visualizations.find(
          (v) => v.id === id
        );
        if (!visualization) {
          return null;
        }

        const duplicated = visualizationStore.duplicateVisualization(id);
        syncFromSources();

        if (!duplicated) {
          return null;
        }

        return (
          s.layers.find((entry) => entry.parentId === duplicated.id) ?? null
        );
      },
      syncWithVisualizations: () => {
        syncFromSources();
      }
    };
  }
);

export const layersState = state;
export const layersActions = actions;
