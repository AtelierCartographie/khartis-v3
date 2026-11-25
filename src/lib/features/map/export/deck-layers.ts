import { datasetsStore } from '$lib/features/commons/stores/datasets.store.svelte';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import { visualizationStore } from '$lib/features/commons/stores/visualization.store.svelte';
import { findById } from '$lib/features/commons/utils/array-helpers';
import { DeckLayerId } from '$lib/features/map/constants/map.constants';
import * as m from '$lib/paraglide/messages';
import { isRecord } from './svg-values';
import type { SvgDeckLayerLike, SvgDeckLike, SvgViewportLike } from './types';

export function getLayerProps(
  layer: SvgDeckLayerLike
): Record<string, unknown> {
  return isRecord(layer.props) ? layer.props : {};
}
export function getLayerId(layer: SvgDeckLayerLike, index: number): string {
  const props = getLayerProps(layer);
  const id = typeof layer.id === 'string' ? layer.id : props.id;

  return typeof id === 'string' && id.trim() ? id : `deck-layer-${index + 1}`;
}
export function getLayerTypeName(layer: SvgDeckLayerLike): string {
  return layer.constructor?.layerName ?? layer.constructor?.name ?? 'DeckLayer';
}
const BASEMAP_PREFIX_LABELS: [string, () => string][] = [
  [DeckLayerId.BASEMAP_META_LAND, m.svg_export_basemap_meta_land],
  [DeckLayerId.BASEMAP_META_LIMIT, m.svg_export_basemap_meta_limit],
  [DeckLayerId.BASEMAP_META_GRATICULE, m.svg_export_basemap_meta_graticule],
  [DeckLayerId.BASEMAP_META_GEO_LINES, m.svg_export_basemap_meta_geo_lines],
  [DeckLayerId.BASEMAP_META_CENTROID, m.svg_export_basemap_meta_centroid],
  [DeckLayerId.BASEMAP_VILLES_LABELS, m.svg_export_basemap_villes_labels],
  [DeckLayerId.BASEMAP_VUES_LABELS, m.svg_export_basemap_vues_labels],
  [DeckLayerId.BASEMAP_TERRE, m.svg_export_basemap_terre],
  [DeckLayerId.BASEMAP_MERS, m.svg_export_basemap_mers],
  [DeckLayerId.BASEMAP_LACS, m.svg_export_basemap_lacs],
  [DeckLayerId.BASEMAP_RIVIERES, m.svg_export_basemap_rivieres],
  [DeckLayerId.BASEMAP_RELIEF, m.svg_export_basemap_relief],
  [DeckLayerId.BASEMAP_EQUATEUR, m.svg_export_basemap_equateur],
  [DeckLayerId.BASEMAP_MERIDIENS, m.svg_export_basemap_meridiens],
  [DeckLayerId.BASEMAP_FRONTIERES, m.svg_export_basemap_frontieres],
  [DeckLayerId.BASEMAP_VILLES, m.svg_export_basemap_villes],
  [DeckLayerId.WORLD_BASE_LAYER, m.svg_export_basemap_world_base],
  ['projection-sphere', m.svg_export_basemap_projection_sphere]
];

export const VISUALIZATION_PREFIX_LABELS: [string, () => string][] = [
  [DeckLayerId.POLYGON_LAYER, m.svg_export_primitive_polygon],
  [DeckLayerId.POINT_LAYER, m.svg_export_primitive_symbol],
  [DeckLayerId.LINE_LAYER, m.svg_export_primitive_line],
  [DeckLayerId.LABEL_LAYER, m.svg_export_primitive_label],
  [DeckLayerId.LABEL_LEADER_LAYER, m.svg_export_primitive_label_leader],
  [DeckLayerId.TEXT_LAYER, m.svg_export_primitive_text]
];
export function matchLongestPrefix(
  layerId: string,
  entries: [string, () => string][]
): { prefix: string; label: string } | null {
  let best: { prefix: string; label: string } | null = null;

  for (const [prefix, labelFn] of entries) {
    if (!layerId.startsWith(prefix)) continue;
    if (best && prefix.length <= best.prefix.length) continue;
    best = { prefix, label: labelFn() };
  }

  return best;
}

function resolveScopeName(scopeId: string): string | null {
  const visualization = findById(visualizationStore.visualizations, scopeId);
  if (visualization) {
    return visualization.name;
  }

  const dataset = findById(datasetsStore.datasets, scopeId);
  return dataset ? dataset.name : null;
}

function resolveVisualizationScopeName(remainder: string): string {
  if (remainder === 'default') {
    return remainder;
  }

  const exactMatch = resolveScopeName(remainder);
  if (exactMatch) {
    return exactMatch;
  }

  const withoutSuffixMatch = remainder.match(/^(.+)-[a-zA-Z0-9]+$/);
  if (withoutSuffixMatch) {
    const truncatedName = resolveScopeName(withoutSuffixMatch[1]);
    if (truncatedName) {
      return truncatedName;
    }
  }

  return remainder;
}

export function resolveDeckLayerNameLabel(layerId: string): string {
  const basemapMatch = matchLongestPrefix(layerId, BASEMAP_PREFIX_LABELS);
  if (basemapMatch) {
    return basemapMatch.label;
  }

  const vizMatch = matchLongestPrefix(layerId, VISUALIZATION_PREFIX_LABELS);
  if (vizMatch) {
    const remainder = layerId.slice(vizMatch.prefix.length + 1);
    const vizName = resolveVisualizationScopeName(remainder);
    return `${vizMatch.label}-${vizName}`;
  }

  return layerId;
}

function isDeckLayerLike(value: unknown): value is SvgDeckLayerLike {
  return isRecord(value) && isRecord(value.props);
}

function isDeckLike(value: unknown): value is SvgDeckLike {
  if (!isRecord(value)) return false;

  return (
    typeof value.getViewports === 'function' ||
    isRecord(value.layerManager) ||
    isRecord(value.viewManager)
  );
}

export function resolveActiveDeckForSvg(): SvgDeckLike | null {
  const standaloneDeck = mapInstanceStore.deckInstance as unknown;
  if (isDeckLike(standaloneDeck)) {
    return standaloneDeck;
  }

  const map = mapInstanceStore.map as unknown;
  if (isRecord(map) && isDeckLike(map.__deck)) {
    return map.__deck;
  }

  const overlay = mapInstanceStore.deckOverlay as unknown;
  if (isRecord(overlay) && isDeckLike(overlay._deck)) {
    return overlay._deck;
  }

  return null;
}
export function resolveDeckLayers(deck: SvgDeckLike): SvgDeckLayerLike[] {
  const layerManager = isRecord(deck.layerManager) ? deck.layerManager : null;
  const managedLayers =
    typeof layerManager?.getLayers === 'function'
      ? layerManager.getLayers()
      : null;
  const propLayers = Array.isArray(deck.props?.layers)
    ? deck.props.layers
    : null;

  return (managedLayers ?? propLayers ?? []).filter(isDeckLayerLike);
}
export function resolveDeckViewports(deck: SvgDeckLike): SvgViewportLike[] {
  const viewports =
    typeof deck.getViewports === 'function'
      ? deck.getViewports()
      : typeof deck.viewManager?.getViewports === 'function'
        ? deck.viewManager.getViewports()
        : [];

  return viewports.filter(
    (viewport): viewport is SvgViewportLike =>
      Boolean(viewport) && typeof viewport.project === 'function'
  );
}
export function getViewportNumber(
  viewport: SvgViewportLike,
  key: 'x' | 'y' | 'width' | 'height',
  fallback: number
): number {
  const value = viewport[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
export function getViewportId(
  viewport: SvgViewportLike,
  index: number
): string {
  return typeof viewport.id === 'string' && viewport.id.trim()
    ? viewport.id
    : `viewport-${index + 1}`;
}
export function shouldRenderLayerInViewport(
  deck: SvgDeckLike,
  layer: SvgDeckLayerLike,
  viewport: SvgViewportLike
): boolean {
  const layerFilter = deck.props?.layerFilter;
  if (typeof layerFilter !== 'function') {
    return true;
  }

  try {
    return (
      layerFilter({
        layer,
        viewport,
        isPicking: false,
        renderPass: 'screen'
      }) !== false
    );
  } catch {
    return true;
  }
}
