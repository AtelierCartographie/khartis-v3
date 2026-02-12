import { deepClone } from '$lib/features/commons/utils/clone.utils';
import {
  BasemapDottedPattern,
  BasemapRepresentation,
  BasemapRemarquables,
  BasemapCityCategory,
  BasemapCitySymbol
} from '$lib/features/main-toolbar/constants';

export { BasemapDottedPattern };

export type BasemapLayerId =
  | 'terre'
  | 'mers'
  | 'lacs'
  | 'rivieres'
  | 'relief'
  | 'equateur'
  | 'meridiens'
  | 'frontieres'
  | 'villes';

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

class BasemapLayersStore {
  private _state = $state<BasemapLayersState>({
    layers: cloneDefaults(),
    version: 0
  });

  get version(): number {
    return this._state.version;
  }

  private incrementVersion(): void {
    this._state.version++;
  }

  get layers(): BasemapLayerConfig[] {
    return this._state.layers;
  }

  get visibleLayers(): BasemapLayerConfig[] {
    return this._state.layers.filter((l) => l.visible);
  }

  getLayer<T extends BasemapLayerId>(
    id: T
  ): Extract<BasemapLayerConfig, { id: T }> | undefined {
    return this._state.layers.find((l) => l.id === id) as
      | Extract<BasemapLayerConfig, { id: T }>
      | undefined;
  }

  setLayerVisibility(id: BasemapLayerId, visible: boolean): void {
    if (typeof visible !== 'boolean') {
      return;
    }

    const layer = this._state.layers.find((l) => l.id === id);
    if (!layer) {
      return;
    }

    layer.visible = visible;
    this.incrementVersion();
  }

  updateLayer<T extends BasemapLayerId>(
    id: T,
    updates: Partial<Omit<Extract<BasemapLayerConfig, { id: T }>, 'id'>>
  ): void {
    const layer = this._state.layers.find((l) => l.id === id);
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
    this.incrementVersion();
  }

  setLayerOrder(orderedIds: BasemapLayerId[]): void {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return;
    }

    const layerMap = new Map(
      this._state.layers.map((layer) => [layer.id, layer] as const)
    );
    const ordered: BasemapLayerConfig[] = [];
    const seen = new Set<BasemapLayerId>();

    for (const id of orderedIds) {
      const layer = layerMap.get(id);
      if (!layer || seen.has(id)) continue;
      ordered.push(layer);
      seen.add(id);
    }

    for (const layer of this._state.layers) {
      if (seen.has(layer.id)) continue;
      ordered.push(layer);
    }

    this._state.layers = ordered;
    this.incrementVersion();
  }

  resetToDefaults(): void {
    this._state.layers = cloneDefaults();
    this.incrementVersion();
  }

  resetLayer(id: BasemapLayerId): void {
    const defaultLayer = DEFAULT_LAYERS.find((l) => l.id === id);
    const index = this._state.layers.findIndex((l) => l.id === id);
    if (defaultLayer && index !== -1) {
      this._state.layers[index] = deepClone(defaultLayer);
      this.incrementVersion();
    }
  }

  restoreFromSerialized(layers: BasemapLayerConfig[]): void {
    if (!layers || !Array.isArray(layers)) {
      this.resetToDefaults();
      return;
    }

    // Normalize potentially outdated serialized schemas by filling missing
    // per-layer fields from current defaults while preserving user values.
    this._state.layers = normalizeSerializedLayers(layers);
    this.incrementVersion();
  }
}

export const basemapLayersStore = new BasemapLayersStore();
