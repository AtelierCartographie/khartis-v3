import type { Component } from 'svelte';

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
}

export interface Section {
  readonly id: string;
  title: string;
  type: LayerType;
  layers: Layer[];
  order: number;
}

export interface DragState {
  dragIndex: number | null;
  dragOverIndex: number | null;
  isDragging?: boolean;
}

export interface LayersState {
  layers: Array<{
    id: string;
    name: string;
    visible: boolean;
    type: 'visualization' | 'geographic';
    color: string;
    opacity?: number;
    order: number;
  }>;
  expandedSections: Record<string, boolean>;
  dragState: {
    dragIndex: number | null;
    dragOverIndex: number | null;
    isDragging: boolean;
  };
}
