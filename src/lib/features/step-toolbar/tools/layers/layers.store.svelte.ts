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
import {
  createReadonlyStateFacade,
  createToolStore
} from '$lib/features/commons/utils/store.utils.svelte';
import {
  FillMode,
  SymbolMode
} from '$lib/features/commons/constants/visualization.constants';
import {
  BasemapStyle,
  DEFAULT_TILED_BASEMAP_STYLE,
  basemapAuxLayersStore,
  basemapLayersStore,
  basemapService,
  osmBasemapStore,
  type BasemapLayer,
  type BasemapMetadata,
  BASEMAP_LAYER_ID,
  getBasemapRenderGroup,
  getPreferredBasemapFile,
  type BasemapLayerConfig,
  type BasemapLayerId
} from '$lib/features/map';
import { SYNTHETIC_AUX_LAYER_KEY } from '$lib/features/commons/constants/basemap.constants';
import { basemapStyleStore } from '$lib/features/commons/stores/basemap-style.store.svelte';
import {
  getStyleConfig,
  getToggleableGroups,
  type LayerGroupId,
  type StyleConfig
} from '$lib/features/map/constants/carte-facile-layer-groups';
import { BasemapLayerType } from '$lib/features/commons/constants/ui.constants';
import { resolveActiveBasemapMetadata } from '$lib/features/map/utils/basemap-metadata-resolution.utils';
import { facetsStore } from '$lib/features/step-toolbar/tools/facets/facets.store.svelte';
import * as m from '$lib/paraglide/messages';
import { getLocale } from '$lib/paraglide/runtime';
import {
  BASEMAP_LAYER_ACCENT_COLOR,
  BASEMAP_SUBLAYER_COLOR,
  getVisualizationAccentColor,
  VIZ_SUBLAYER_COLOR
} from './layers.constants';
import type {
  Layer,
  LayerReorderScope,
  LayersState
} from '../../types/layers.types';
import {
  buildBasemapSubLayerId,
  buildTiledBasemapLayerId,
  buildVisualizationSubLayerId,
  getCustomBaseLayerType,
  TILED_BASEMAP_LABELS_GROUP_ID,
  isBasemapLayersToolRenderableType,
  isPerKeyAuxLayerType,
  mapMetadataLayerTypeToBasemapLayerId,
  mergeLayerOrder
} from '$lib/features/map/utils/layer-panel-row.utils';
import { layerOrderStore } from './layer-order.store.svelte';

const DEFAULT_STATE: LayersState = {
  layers: []
};

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

// Panel order, top→bottom. Tiled labels are the one group MapLibre draws over
// the deck overlay, so they belong in the foreground; every other group sits
// behind the thematic layers.
const TILED_LAYER_ITEMS: Array<{
  id: string;
  groupIds: LayerGroupId[];
  defaultVisible: boolean;
  renderGroup?: 'foreground' | 'background';
}> = [
  {
    id: TILED_BASEMAP_LABELS_GROUP_ID,
    groupIds: ['labels'],
    defaultVisible: true,
    renderGroup: 'foreground'
  },
  { id: 'hydro', groupIds: ['hydro'], defaultVisible: true },
  { id: 'landcover', groupIds: ['landcover'], defaultVisible: true },
  { id: 'buildings', groupIds: ['buildings'], defaultVisible: true },
  { id: 'streets', groupIds: ['streets'], defaultVisible: true },
  { id: 'boundaries', groupIds: ['boundaries'], defaultVisible: true },
  {
    id: 'admin-boundaries',
    groupIds: ['admin_boundaries'],
    defaultVisible: false
  },
  { id: 'cadastre', groupIds: ['cadastre'], defaultVisible: false }
];

type LayersActions = {
  toggleLayerVisibility: (id: string) => void;
  /** Flat reorder persists absolute panel order without mutating render stores. */
  reorderLayers: (fromIndex: number, toIndex: number) => void;
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

function getVisualizationColor(viz: VisualizationConfig): string {
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

function getStyleColor(color?: string | string[]): string | null {
  if (typeof color === 'string' && color) {
    return color;
  }

  if (Array.isArray(color) && typeof color[0] === 'string' && color[0]) {
    return color[0];
  }

  return null;
}

function getVisualizationPrimitiveColor(
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

function getBasemapLayerColor(layer: BasemapLayerConfig): string {
  if (layer.id === BASEMAP_LAYER_ID.TERRE) {
    return layer.strokeColor || layer.fillColor || BASEMAP_SUBLAYER_COLOR;
  }

  if ('color' in layer && typeof layer.color === 'string' && layer.color) {
    return layer.color;
  }

  return BASEMAP_SUBLAYER_COLOR;
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

// Flattened primitive rows include their visualization name.
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

interface BasemapDisplayEntry {
  layerId?: BasemapLayerId;
  file?: string;
  key?: string;
  type?: BasemapLayerType;
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
    const layerKey = layer.file ?? `${metadata.file}:${layer.type}`;
    const basemapLayerId = mapMetadataLayerTypeToBasemapLayerId(
      layer.type,
      isCustom,
      isCustomLine
    );
    const config = basemapLayerId
      ? basemapLayersStore.getLayer(basemapLayerId)
      : undefined;
    const entryVisible = basemapAuxLayersStore.isVisible(
      metadata.file,
      layerKey,
      true
    );

    const isPerKey = isPerKeyAuxLayerType(layer.type);

    entries.push({
      layerId: basemapLayerId ?? undefined,
      file: metadata.file,
      key: layerKey,
      type: layer.type,
      name: pickMetadataLayerName(layer),
      visible: isPerKey
        ? entryVisible
        : entryVisible && (config?.visible ?? true),
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

// Basemap aux row order comes from the store, then the canonical fallback.
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
    const groupKey =
      isPerKeyAuxLayerType(entry.type) && entry.key
        ? entry.key
        : (entry.layerId ?? entry.key ?? entry.name);
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
    const isPerKeyGroup = orderedEntries.every((entry) =>
      isPerKeyAuxLayerType(entry.type)
    );
    const visible =
      config && !isPerKeyGroup
        ? config.visible && visibleEntries
        : visibleEntries;

    rows.push({
      displayOrder: getBasemapDisplayOrder(layerId),
      layer: {
        id: buildBasemapSubLayerId(
          isPerKeyGroup ? groupKey : (layerId ?? groupKey)
        ),
        isSubLayer: true,
        kind: 'basemap-aux',
        type: 'geographic',
        basemapLayerId: layerId,
        basemapFile,
        basemapLayerKey: keys.length === 1 ? keys[0] : undefined,
        basemapLayerKeys: keys.length > 0 ? keys : undefined,
        basemapLayerPrimary: orderedEntries.some((entry) => entry.primary),
        basemapAuxPerKey: isPerKeyGroup,
        basemapRenderGroup: firstEntry.renderGroup.replace(
          'geographic-',
          ''
        ) as Layer['basemapRenderGroup'],
        basemapRenderBelowThematic: config?.renderBelowThematic ?? false,
        name: isPerKeyAuxLayerType(firstEntry.type)
          ? firstEntry.name
          : layerId
            ? getBasemapLayerName(layerId)
            : firstEntry.name,
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
  ).map((item, index): Layer => ({
    id: buildBasemapSubLayerId(buildTiledBasemapLayerId(item.id)),
    isSubLayer: true,
    kind: 'basemap-aux',
    type: 'geographic',
    basemapRenderGroup: item.renderGroup ?? 'background',
    tiledLayerGroupIds: item.groupIds,
    tiledLayerDefaultVisible: item.defaultVisible,
    name: getTiledLayerName(item.id),
    visible: isTiledLayerVisible(config, item.groupIds, item.defaultVisible),
    color: BASEMAP_SUBLAYER_COLOR,
    opacity: 100,
    order: index
  }));
}

function buildLayers(): Layer[] {
  const activeVisualizationIds = new Set(
    visualizationStore.activeVisualizations.map((v) => v.id)
  );

  const facetsEnabled = facetsStore.enabled;
  const facetBaseVizId = facetsStore.baseVisualizationId;

  // Facet mode displays only the base visualization rows.
  const displayVisualizations = facetsEnabled
    ? visualizationStore.visualizations.filter((v) => v.id === facetBaseVizId)
    : visualizationStore.visualizations;

  // Thematic rows are flat primitive-visualization rows.
  const thematicLayers = displayVisualizations.flatMap(
    (viz, vizOrder): Layer[] => {
      const primitiveFilters = getEnabledPrimitiveFilters(viz);
      const isFacetCollection = facetsEnabled && viz.id === facetBaseVizId;

      const vizLabel = viz.name || m.viz_tab_label({ number: vizOrder + 1 });
      const vizVisible = isFacetCollection
        ? true
        : activeVisualizationIds.has(viz.id);

      const vizPrimitiveOrder = (
        viz.primitiveOrder ?? VISUALIZATION_SUBLAYER_ORDER
      ).filter((primitive, index, order) => order.indexOf(primitive) === index);

      const vizAccentColor = getVisualizationAccentColor(vizOrder);

      return vizPrimitiveOrder.map((primitive, i): Layer => ({
        id: buildVisualizationSubLayerId(viz.id, primitive),
        parentId: viz.id,
        isSubLayer: true,
        kind: 'viz-primitive',
        primitive,
        name: getPrimitiveLayerName(primitive, vizLabel),
        primitiveLabel: getVisualizationPrimitiveName(primitive),
        subtitle: vizLabel,
        accentColor: vizAccentColor,
        visible: vizVisible && primitiveFilters.includes(primitive),
        type: 'visualization',
        color: getVisualizationPrimitiveColor(viz, primitive),
        opacity: getVisualizationPrimitiveOpacity(viz, primitive),
        order: i
      }));
    }
  );

  // Basemap auxiliary rows are global and share the muted accent.
  const basemapLayers = (
    resolveTiledStyleConfig() !== null
      ? buildTiledBasemapSubLayers()
      : buildVectorBasemapSubLayers()
  ).map((layer): Layer => ({
    ...layer,
    accentColor: BASEMAP_LAYER_ACCENT_COLOR
  }));

  // Project live rows onto persisted flat order without dirtying the project.
  const rows = [...thematicLayers, ...basemapLayers];
  const merged = mergeLayerOrder(
    rows,
    layerOrderStore.order,
    visualizationStore.visualizations.map((v) => v.id)
  );

  const rank = new Map(merged.map((id, index) => [id, index] as const));
  const ordered = [...rows].sort(
    (a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  );
  return withFlatOrder(ordered);
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
      toggleLayerVisibility: (id: string) => {
        const layer = findLayer(id);
        if (!layer) {
          // Row menu visibility targets the whole visualization id.
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

          if (layer.basemapLayerId && !layer.basemapAuxPerKey) {
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
        // Persist the dragged flat list verbatim.
        const currentIds = s.layers.map((layer) => layer.id);
        const nextIds = reorderIds(currentIds, fromIndex, toIndex);
        if (arraysShallowEqual(currentIds, nextIds)) {
          return;
        }
        layerOrderStore.setOrder(nextIds);
        syncFromSources();
      },
      syncWithVisualizations: () => {
        syncFromSources();
      }
    };
  }
);

export const layersState = createReadonlyStateFacade(state);
export const layersActions = actions;
