import type { Component } from 'svelte';
import type { PrimitiveFilter } from '$lib/features/commons/store/visualization.store.svelte';

export type LayerType = 'visualization' | 'geographic';

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
}

export interface LayersState {
  layers: Omit<Layer, 'icon'>[];
}
