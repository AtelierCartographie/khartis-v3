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
    strokeColor: '#8d8d8d',
    strokeDotted: false,
    strokeDottedPattern: BasemapDottedPattern.DOTS,
    strokeThickness: 1,
    strokeOpacity: 100
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
  return JSON.parse(JSON.stringify(DEFAULT_LAYERS)) as BasemapLayerConfig[];
}

class BasemapLayersStore {
  private _layers = $state<BasemapLayerConfig[]>(cloneDefaults());

  get layers(): BasemapLayerConfig[] {
    return this._layers;
  }

  get visibleLayers(): BasemapLayerConfig[] {
    return this._layers.filter((l) => l.visible);
  }

  getLayer<T extends BasemapLayerId>(
    id: T
  ): Extract<BasemapLayerConfig, { id: T }> | undefined {
    return this._layers.find((l) => l.id === id) as
      | Extract<BasemapLayerConfig, { id: T }>
      | undefined;
  }

  setLayerVisibility(id: BasemapLayerId, visible: boolean): void {
    this._layers = this._layers.map((l) =>
      l.id === id ? { ...l, visible } : l
    );
  }

  updateLayer<T extends BasemapLayerId>(
    id: T,
    updates: Partial<Omit<Extract<BasemapLayerConfig, { id: T }>, 'id'>>
  ): void {
    this._layers = this._layers.map((l) =>
      l.id === id ? { ...l, ...updates } : l
    );
  }

  resetToDefaults(): void {
    this._layers = cloneDefaults();
  }

  resetLayer(id: BasemapLayerId): void {
    const defaultLayer = DEFAULT_LAYERS.find((l) => l.id === id);
    const index = this._layers.findIndex((l) => l.id === id);
    if (defaultLayer && index !== -1) {
      this._layers[index] = JSON.parse(
        JSON.stringify(defaultLayer)
      ) as BasemapLayerConfig;
    }
  }

  restoreFromSerialized(layers: BasemapLayerConfig[]): void {
    if (!layers || !Array.isArray(layers)) {
      this.resetToDefaults();
      return;
    }
    this._layers = JSON.parse(JSON.stringify(layers)) as BasemapLayerConfig[];
  }
}

export const basemapLayersStore = new BasemapLayersStore();
