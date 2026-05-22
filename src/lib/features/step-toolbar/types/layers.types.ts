import type { Component } from 'svelte';
import type { PrimitiveFilter } from '$lib/features/commons/stores/visualization.store.svelte';
import type { BasemapRenderGroup } from '$lib/features/map/stores/basemap-layers.store.svelte';

export type LayerType = 'visualization' | 'geographic';
export type LayerReorderScope =
  | 'visualization'
  | 'geographic-background'
  | 'geographic-foreground';

export interface Layer {
  readonly id: string;
  name: string;
  icon?: Component;
  visible: boolean;
  color: string;
  type: LayerType;
  opacity?: number;
  order: number;
  parentId?: string;
  isSubLayer?: boolean;
  primitive?: PrimitiveFilter;
  basemapLayerId?: string;
  basemapRenderGroup?: BasemapRenderGroup;
  basemapFile?: string;
  basemapLayerKey?: string;
  basemapLayerPrimary?: boolean;
}

export interface LayersState {
  layers: Omit<Layer, 'icon'>[];
}
