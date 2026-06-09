import type { Component } from 'svelte';
import type { PrimitiveFilter } from '$lib/features/commons/stores/visualization.store.svelte';
import type { BasemapRenderGroup } from '$lib/features/map/stores/basemap-layers.store.svelte';
import type { LayerGroupId } from '$lib/features/map/constants/carte-facile-layer-groups';

export type LayerType = 'visualization' | 'geographic';
export type LayerReorderScope =
  | 'visualization'
  | 'geographic-background'
  | 'geographic-foreground';

/**
 * Row category in the flattened layers panel (#182):
 * - `viz-primitive` — one active primitive of a visualization (Textes/Symboles/Lignes/Polygones).
 * - `basemap-aux` — a deduplicated global basemap auxiliary layer (Sphère/Frontières/…/Mers)
 *   or a tiled-basemap group.
 */
export type LayerKind = 'viz-primitive' | 'basemap-aux';

export interface Layer {
  readonly id: string;
  name: string;
  icon?: Component;
  visible: boolean;
  color: string;
  /**
   * Accent hue for the panel row (#182, Figma 1419-89514): a per-visualization
   * "Vivid" categorical color for primitives (all primitives of one visualization
   * share it; distinct visualizations differ), and a single muted "Sepia" color for
   * basemap layers so they recede behind the thematic primitives.
   */
  accentColor?: string;
  /** Bold title shown for a viz-primitive row (e.g. "Textes"), without the viz label. */
  primitiveLabel?: string;
  /** Secondary line under a viz-primitive title — the source visualization label. */
  subtitle?: string;
  type: LayerType;
  kind?: LayerKind;
  opacity?: number;
  /** Absolute position in the single flattened render-ordered list (top = front). */
  order: number;
  parentId?: string;
  isSubLayer?: boolean;
  primitive?: PrimitiveFilter;
  basemapLayerId?: string;
  basemapRenderGroup?: BasemapRenderGroup;
  basemapRenderBelowThematic?: boolean;
  basemapFile?: string;
  basemapLayerKey?: string;
  basemapLayerKeys?: string[];
  basemapLayerPrimary?: boolean;
  basemapAuxPerKey?: boolean;
  tiledLayerGroupIds?: LayerGroupId[];
  tiledLayerDefaultVisible?: boolean;
}

export interface LayersState {
  // The flat list is a projection rebuilt by `buildLayers()` from the three
  // render stores; the drag order is persisted by those stores (visualization
  // order + primitiveOrder, basemap layer order + renderBelowThematic, aux key
  // order), so it round-trips a reload without a separate order field here.
  layers: Omit<Layer, 'icon'>[];
}
