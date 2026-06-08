import { deepClone } from '$lib/features/commons/utils/clone.utils';
import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';
import {
  BasemapDottedPattern,
  BasemapGraticuleMode,
  BasemapRepresentation,
  BasemapRemarquables,
  BasemapCityCategory,
  BasemapCitySymbol,
  BASEMAP_LAYER_CONFIG
} from '$lib/features/commons/constants/visualization.constants';
import {
  BASEMAP_LAYER_ID,
  getBasemapRenderGroup,
  type BasemapLayerId,
  type BasemapRenderGroup
} from '$lib/features/commons/constants/basemap.constants';

export { BasemapDottedPattern, BASEMAP_LAYER_ID, getBasemapRenderGroup };
export type { BasemapLayerId, BasemapRenderGroup };

interface BasemapLayerBase {
  id: BasemapLayerId;
  visible: boolean;
  renderBelowThematic?: boolean;
}

export interface TerreLayerConfig extends BasemapLayerBase {
  id: 'terre';
  fillColor: string;
  fillShadow: boolean;
  fillOpacity: number;
  strokeColor: string;
  strokeDotted: boolean;
  strokeDottedPattern: BasemapDottedPattern;
  strokeThickness: number;
  strokeOpacity: number;
}

export interface MersLayerConfig extends BasemapLayerBase {
  id: 'mers';
  color: string;
  opacity: number;
}

export interface LacsLayerConfig extends BasemapLayerBase {
  id: 'lacs';
  color: string;
  thickness: number;
  opacity: number;
}

export interface RivieresLayerConfig extends BasemapLayerBase {
  id: 'rivieres';
  color: string;
  dotted: boolean;
  dottedPattern: BasemapDottedPattern;
  thickness: number;
  opacity: number;
}

export interface ReliefLayerConfig extends BasemapLayerBase {
  id: 'relief';
  representation: BasemapRepresentation;
  color: string;
  opacity: number;
}

export interface EquateurLayerConfig extends BasemapLayerBase {
  id: 'equateur';
  color: string;
  dotted: boolean;
  dottedPattern: BasemapDottedPattern;
  thickness: number;
  opacity: number;
}

export interface MeridiensLayerConfig extends BasemapLayerBase {
  id: 'meridiens';
  mode: BasemapGraticuleMode;
  spacingDegrees: number;
  color: string;
  dotted: boolean;
  dottedPattern: BasemapDottedPattern;
  thickness: number;
  opacity: number;
}

export interface FrontieresLayerConfig extends BasemapLayerBase {
  id: 'frontieres';
  color: string;
  dotted: boolean;
  dottedPattern: BasemapDottedPattern;
  thickness: number;
  opacity: number;
}

export interface VillesLayerConfig extends BasemapLayerBase {
  id: 'villes';
  category: BasemapCityCategory;
  count?: number;
  symbol: BasemapCitySymbol;
  color: string;
  size: number;
  opacity: number;
  labelFontFamily?: string;
  labelSize?: number;
  labelColor?: string;
}

export interface SphereLayerConfig extends BasemapLayerBase {
  id: 'sphere';
  color: string;
  thickness: number;
  opacity: number;
}

export type BasemapLayerConfig =
  | TerreLayerConfig
  | MersLayerConfig
  | LacsLayerConfig
  | RivieresLayerConfig
  | ReliefLayerConfig
  | EquateurLayerConfig
  | MeridiensLayerConfig
  | FrontieresLayerConfig
  | VillesLayerConfig
  | SphereLayerConfig;

const DEFAULT_LAYERS: BasemapLayerConfig[] = [
  {
    id: 'lacs',
    visible: false,
    color: '#a6c8ff',
    thickness: 0,
    opacity: 100
  },
  {
    id: 'rivieres',
    visible: false,
    renderBelowThematic: true,
    color: '#a6c8ff',
    dotted: false,
    dottedPattern: BasemapDottedPattern.DOTS,
    thickness: 1,
    opacity: 100
  },
  {
    id: 'relief',
    visible: false,
    representation: BasemapRepresentation.SHADING,
    color: '#e0e0e0',
    opacity: 100
  },
  {
    id: 'terre',
    visible: true,
    fillColor: '#ffffff',
    fillShadow: false,
    fillOpacity: 100,
    strokeColor: '#a8a8a8',
    strokeDotted: false,
    strokeDottedPattern: BasemapDottedPattern.DOTS,
    strokeThickness: 0.5,
    strokeOpacity: 100
  },
  {
    id: 'mers',
    visible: true,
    color: '#ffffff',
    opacity: 100
  },
  {
    id: 'villes',
    visible: false,
    renderBelowThematic: true,
    category: BasemapCityCategory.CAPITALS,
    count: 50,
    symbol: BasemapCitySymbol.POINT,
    color: '#525252',
    size: 8,
    opacity: 100,
    labelFontFamily: 'Cabin',
    labelSize: 12,
    labelColor: '#161616'
  },
  {
    id: 'equateur',
    visible: false,
    renderBelowThematic: true,
    color: '#8d8d8d',
    dotted: false,
    dottedPattern: BasemapDottedPattern.DOTS,
    thickness: 1,
    opacity: 100
  },
  {
    id: 'meridiens',
    visible: false,
    renderBelowThematic: true,
    mode: BasemapGraticuleMode.REMARKABLE,
    spacingDegrees: 10,
    color: '#8d8d8d',
    dotted: true,
    dottedPattern: BasemapDottedPattern.DOTS,
    thickness: 1,
    opacity: 100
  },
  {
    id: 'frontieres',
    visible: true,
    renderBelowThematic: true,
    color: '#8d8d8d',
    dotted: false,
    dottedPattern: BasemapDottedPattern.DOTS,
    thickness: 0.5,
    opacity: 100
  },
  {
    id: 'sphere',
    visible: true,
    renderBelowThematic: true,
    color: '#5a5a5a',
    thickness: 1,
    opacity: 100
  }
];

function cloneDefaults(): BasemapLayerConfig[] {
  return deepClone(DEFAULT_LAYERS);
}

function clampBasemapThickness(
  value: unknown,
  fallback: number,
  min?: number
): number {
  const effectiveMin: number = min ?? BASEMAP_LAYER_CONFIG.thickness.min;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(
    BASEMAP_LAYER_CONFIG.thickness.max,
    Math.max(effectiveMin, parsed)
  );
}

function normalizeLayerThickness<T extends BasemapLayerConfig>(layer: T): T {
  switch (layer.id) {
    case 'lacs':
      return {
        ...layer,
        thickness: clampBasemapThickness(layer.thickness, 0, 0)
      };
    case 'terre':
      return {
        ...layer,
        strokeThickness: clampBasemapThickness(layer.strokeThickness, 0.5, 0)
      };
    case 'rivieres':
    case 'equateur':
    case 'meridiens':
    case 'frontieres':
      return {
        ...layer,
        thickness: clampBasemapThickness(layer.thickness, 0.5)
      };
    default:
      return layer;
  }
}

function mergeLayerWithDefaults<T extends BasemapLayerConfig>(
  defaults: T,
  candidate: Partial<T> | undefined
): T {
  if (!candidate || candidate.id !== defaults.id) {
    return deepClone(defaults);
  }

  const sanitizedCandidate = Object.fromEntries(
    Object.entries(candidate).filter(([, value]) => value !== undefined)
  ) as Partial<T>;

  return normalizeLayerThickness({
    ...deepClone(defaults),
    ...sanitizedCandidate
  } as T);
}

type LegacyMeridiensLayerConfig = Partial<MeridiensLayerConfig> & {
  remarquables?: BasemapRemarquables;
};

function clampGraticuleSpacing(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 10;
  }

  return Math.min(
    BASEMAP_LAYER_CONFIG.graticuleSpacing.max,
    Math.max(BASEMAP_LAYER_CONFIG.graticuleSpacing.min, Math.round(parsed))
  );
}

function isBasemapGraticuleMode(value: unknown): value is BasemapGraticuleMode {
  return (
    value === BasemapGraticuleMode.REMARKABLE ||
    value === BasemapGraticuleMode.REGULAR
  );
}

function normalizeLegacyMeridiensConfig(
  defaults: MeridiensLayerConfig,
  candidate: LegacyMeridiensLayerConfig | undefined
): MeridiensLayerConfig {
  const { remarquables, ...normalizedCandidate } = candidate ?? {};
  const merged = mergeLayerWithDefaults(defaults, normalizedCandidate);

  if (!candidate) {
    return merged;
  }

  if (isBasemapGraticuleMode(candidate.mode)) {
    return {
      ...merged,
      mode: candidate.mode,
      spacingDegrees: clampGraticuleSpacing(candidate.spacingDegrees)
    };
  }

  switch (remarquables) {
    case BasemapRemarquables.ALL:
      return {
        ...merged,
        mode: BasemapGraticuleMode.REGULAR,
        spacingDegrees: 10
      };
    case BasemapRemarquables.MAJOR:
      return {
        ...merged,
        mode: BasemapGraticuleMode.REGULAR,
        spacingDegrees: 15
      };
    case BasemapRemarquables.MINOR:
      return {
        ...merged,
        mode: BasemapGraticuleMode.REGULAR,
        spacingDegrees: 5
      };
    case BasemapRemarquables.EQUATOR_TROPICS:
      return {
        ...merged,
        mode: BasemapGraticuleMode.REMARKABLE,
        spacingDegrees: 10
      };
    default:
      return {
        ...merged,
        mode: isBasemapGraticuleMode(merged.mode) ? merged.mode : defaults.mode,
        spacingDegrees: clampGraticuleSpacing(merged.spacingDegrees)
      };
  }
}

function normalizeSerializedLayers(
  layers: BasemapLayerConfig[]
): BasemapLayerConfig[] {
  if (!Array.isArray(layers)) {
    return cloneDefaults();
  }

  const defaultsById = new Map(
    DEFAULT_LAYERS.map((layer) => [layer.id, layer] as const)
  );
  const normalizedLayers = new Map<BasemapLayerId, BasemapLayerConfig>();

  for (const candidate of layers) {
    const defaults = defaultsById.get(candidate?.id);
    if (!defaults || normalizedLayers.has(defaults.id)) {
      continue;
    }

    if (defaults.id === 'meridiens') {
      normalizedLayers.set(
        defaults.id,
        normalizeLegacyMeridiensConfig(
          defaults,
          candidate as LegacyMeridiensLayerConfig | undefined
        )
      );
      continue;
    }

    normalizedLayers.set(
      defaults.id,
      mergeLayerWithDefaults(
        defaults,
        candidate as Partial<typeof defaults> | undefined
      )
    );
  }

  const missingLayers = DEFAULT_LAYERS.filter(
    (defaults) => !normalizedLayers.has(defaults.id)
  ).map((defaults) => deepClone(defaults));

  return [...Array.from(normalizedLayers.values()), ...missingLayers];
}

interface BasemapLayersState {
  layers: BasemapLayerConfig[];
  version: number;
}

function createBasemapLayersStore() {
  const state = $state<BasemapLayersState>({
    layers: cloneDefaults(),
    version: 0
  });

  function incrementVersion(): void {
    state.version++;
    persistenceRegistry.notifyChange('basemapLayers');
  }

  function getLayer<T extends BasemapLayerId>(
    id: T
  ): Extract<BasemapLayerConfig, { id: T }> | undefined {
    return state.layers.find((layer) => layer.id === id) as
      | Extract<BasemapLayerConfig, { id: T }>
      | undefined;
  }

  function setLayerVisibility(id: BasemapLayerId, visible: boolean): void {
    if (typeof visible !== 'boolean') {
      return;
    }

    const layer = state.layers.find((currentLayer) => currentLayer.id === id);
    if (!layer || layer.visible === visible) {
      return;
    }

    layer.visible = visible;
    incrementVersion();
  }

  function updateLayer<T extends BasemapLayerId>(
    id: T,
    updates: Partial<Omit<Extract<BasemapLayerConfig, { id: T }>, 'id'>>
  ): void {
    const layerIndex = state.layers.findIndex(
      (currentLayer) => currentLayer.id === id
    );
    const layer = state.layers[layerIndex];
    if (!layer) {
      return;
    }

    const sanitizedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, value]) => value !== undefined)
    );

    if (Object.keys(sanitizedUpdates).length === 0) {
      return;
    }

    Object.assign(layer, sanitizedUpdates);
    state.layers[layerIndex] = normalizeLayerThickness(layer);
    incrementVersion();
  }

  function setLayerOrder(orderedIds: BasemapLayerId[]): void {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return;
    }

    const layerMap = new Map(
      state.layers.map((layer) => [layer.id, layer] as const)
    );
    const ordered: BasemapLayerConfig[] = [];
    const seen = new Set<BasemapLayerId>();

    for (const id of orderedIds) {
      const layer = layerMap.get(id);
      if (!layer || seen.has(id)) continue;
      ordered.push(layer);
      seen.add(id);
    }

    for (const layer of state.layers) {
      if (seen.has(layer.id)) continue;
      ordered.push(layer);
    }

    state.layers = ordered;
    incrementVersion();
  }

  function setLayerRenderGroupOrder(
    renderGroup: BasemapRenderGroup,
    orderedIds: BasemapLayerId[]
  ): void {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return;
    }

    const currentGroupLayers = state.layers.filter(
      (layer) => getBasemapRenderGroup(layer.id) === renderGroup
    );

    if (currentGroupLayers.length === 0) {
      return;
    }

    const layerMap = new Map(
      currentGroupLayers.map((layer) => [layer.id, layer] as const)
    );
    const orderedGroupLayers: BasemapLayerConfig[] = [];
    const seen = new Set<BasemapLayerId>();

    for (const id of orderedIds) {
      const layer = layerMap.get(id);
      if (!layer || seen.has(id)) continue;
      orderedGroupLayers.push(layer);
      seen.add(id);
    }

    for (const layer of currentGroupLayers) {
      if (seen.has(layer.id)) continue;
      orderedGroupLayers.push(layer);
    }

    let nextGroupIndex = 0;
    state.layers = state.layers.map((layer) => {
      if (getBasemapRenderGroup(layer.id) !== renderGroup) {
        return layer;
      }

      const replacement = orderedGroupLayers[nextGroupIndex];
      nextGroupIndex += 1;
      return replacement;
    });
    incrementVersion();
  }

  function setLayerThematicPlacement(
    id: BasemapLayerId,
    belowThematic: boolean
  ): void {
    if (getBasemapRenderGroup(id) !== 'foreground') {
      return;
    }

    const layer = state.layers.find((currentLayer) => currentLayer.id === id);
    if (!layer || layer.renderBelowThematic === belowThematic) {
      return;
    }

    layer.renderBelowThematic = belowThematic;
    incrementVersion();
  }

  function resetToDefaults(): void {
    state.layers = cloneDefaults();
    incrementVersion();
  }

  function resetLayer(id: BasemapLayerId): void {
    const defaultLayer = DEFAULT_LAYERS.find((l) => l.id === id);
    const index = state.layers.findIndex((layer) => layer.id === id);
    if (defaultLayer && index !== -1) {
      state.layers[index] = deepClone(defaultLayer);
      incrementVersion();
    }
  }

  function restoreFromSerialized(layers: BasemapLayerConfig[]): void {
    if (!layers || !Array.isArray(layers)) {
      resetToDefaults();
      return;
    }

    state.layers = normalizeSerializedLayers(layers);
    incrementVersion();
  }

  return {
    get version(): number {
      return state.version;
    },
    get layers(): BasemapLayerConfig[] {
      return state.layers;
    },
    get visibleLayers(): BasemapLayerConfig[] {
      return state.layers.filter((layer) => layer.visible);
    },
    getLayer,
    setLayerVisibility,
    updateLayer,
    setLayerOrder,
    setLayerRenderGroupOrder,
    setLayerThematicPlacement,
    resetToDefaults,
    resetLayer,
    restoreFromSerialized
  };
}

export const basemapLayersStore = createBasemapLayersStore();

persistenceRegistry.register({
  key: 'basemapLayers',
  serialize: () => basemapLayersStore.layers,
  deserialize: (data: unknown) =>
    basemapLayersStore.restoreFromSerialized(
      data as Parameters<typeof basemapLayersStore.restoreFromSerialized>[0]
    ),
  reset: () => basemapLayersStore.resetToDefaults(),
  priority: 'debounced'
});
