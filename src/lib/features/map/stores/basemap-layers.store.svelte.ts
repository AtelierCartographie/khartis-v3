import { deepClone } from '$lib/features/commons/utils/clone.utils';
import { persistenceRegistry } from '$lib/features/project-management/core/persistence-registry';
import {
  BasemapDottedPattern,
  BasemapRepresentation,
  BasemapRemarquables,
  BasemapCityCategory,
  BasemapCitySymbol
} from '$lib/features/main-toolbar/constants';
import {
  BASEMAP_LAYER_ID,
  type BasemapLayerId
} from '$lib/features/commons/constants/basemap.constants';

export { BasemapDottedPattern, BASEMAP_LAYER_ID };
export type { BasemapLayerId };

interface BasemapLayerBase {
  id: BasemapLayerId;
  visible: boolean;
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
  remarquables: BasemapRemarquables;
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
  symbol: BasemapCitySymbol;
  color: string;
  size: number;
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
  | VillesLayerConfig;

const DEFAULT_LAYERS: BasemapLayerConfig[] = [
  {
    id: 'mers',
    visible: true,
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
    strokeOpacity: 40
  },
  {
    id: 'lacs',
    visible: false,
    color: '#a6c8ff',
    thickness: 0,
    opacity: 80
  },
  {
    id: 'rivieres',
    visible: false,
    color: '#a6c8ff',
    dotted: false,
    dottedPattern: BasemapDottedPattern.DOTS,
    thickness: 1,
    opacity: 80
  },
  {
    id: 'relief',
    visible: false,
    representation: BasemapRepresentation.SHADING,
    color: '#e0e0e0',
    opacity: 50
  },
  {
    id: 'equateur',
    visible: false,
    color: '#8d8d8d',
    dotted: false,
    dottedPattern: BasemapDottedPattern.DOTS,
    thickness: 1,
    opacity: 80
  },
  {
    id: 'meridiens',
    visible: false,
    remarquables: BasemapRemarquables.ALL,
    color: '#e0e0e0',
    dotted: true,
    dottedPattern: BasemapDottedPattern.DOTS,
    thickness: 0.5,
    opacity: 50
  },
  {
    id: 'frontieres',
    visible: true,
    color: '#8d8d8d',
    dotted: false,
    dottedPattern: BasemapDottedPattern.DOTS,
    thickness: 1,
    opacity: 100
  },
  {
    id: 'villes',
    visible: false,
    category: BasemapCityCategory.CAPITALS,
    symbol: BasemapCitySymbol.POINT,
    color: '#525252',
    size: 8,
    opacity: 100
  }
];

function cloneDefaults(): BasemapLayerConfig[] {
  return deepClone(DEFAULT_LAYERS);
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

  return {
    ...deepClone(defaults),
    ...sanitizedCandidate
  } as T;
}

function normalizeSerializedLayers(
  layers: BasemapLayerConfig[]
): BasemapLayerConfig[] {
  if (!Array.isArray(layers)) {
    return cloneDefaults();
  }

  return DEFAULT_LAYERS.map((defaults) => {
    const candidate = layers.find((layer) => layer?.id === defaults.id) as
      | Partial<typeof defaults>
      | undefined;

    return mergeLayerWithDefaults(defaults, candidate);
  });
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
    const layer = state.layers.find((currentLayer) => currentLayer.id === id);
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

    // Normalize potentially outdated serialized schemas by filling missing
    // per-layer fields from current defaults while preserving user values.
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
