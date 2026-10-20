import {
  placeLabels,
  type LabelInput,
  type LabelMode,
  type PlacementResult
} from '@ateliercartographie/label-placer';
import type { Matrix4 } from '@math.gl/core';

import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';

import type { BasemapFrameExtent } from './basemap-frame.utils';
import type { LabelOffset } from './label-layout.utils';

/** Only the most important labels may move away with a leader line. */
const AUTO_LEADER_MAX_LABELS = 300;

/** A label block to place, in page pixels. */
export interface AutoLabelEntry {
  id: number;
  anchor: LabelOffset;
  halfSize: LabelOffset;
  symbolRadius: number;
  priority: number;
  mode: LabelMode;
  /** Block centre of a pinned label, relative to its anchor. */
  center?: LabelOffset;
}

export interface AutoLabelPlacementOptions {
  bounds: [number, number, number, number];
  gap: number;
  symbolGap: number;
  minGap: number;
}

interface ViewportLike {
  width: number;
  height: number;
  project: (xyz: number[]) => ArrayLike<number>;
}

function isViewportSource(
  value: unknown
): value is { getViewports: () => ViewportLike[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { getViewports?: unknown }).getViewports === 'function'
  );
}

function resolveMapViewport(): ViewportLike | null {
  const overlay = mapInstanceStore.deckOverlay as unknown as {
    _deck?: unknown;
  } | null;
  for (const deck of [mapInstanceStore.deckInstance, overlay?._deck]) {
    if (!isViewportSource(deck)) continue;
    const viewport = deck.getViewports()[0];
    if (viewport && viewport.width > 0 && viewport.height > 0) return viewport;
  }
  return null;
}

export interface LabelPlacementFrame {
  /** The map area, in page pixels. */
  bounds: [number, number, number, number];
  toPagePx: (position: [number, number]) => LabelOffset | null;
}

/**
 * Projects layer positions to page pixels through the live map viewport, or
 * null before the map has rendered once. The canvas spans the whole page, so
 * labels are kept inside the basemap frame when the projection has one.
 */
export function resolveLabelPlacementFrame(
  modelMatrix: Matrix4 | null | undefined,
  pageDisplayScale: number,
  frameExtent: BasemapFrameExtent | null
): LabelPlacementFrame | null {
  const viewport = resolveMapViewport();
  if (!viewport) return null;
  const scale = pageDisplayScale > 0 ? pageDisplayScale : 1;
  const toPagePx = ([x, y]: [number, number]): LabelOffset | null => {
    const world = modelMatrix
      ? Array.from(modelMatrix.transformAsPoint([x, y, 0]))
      : [x, y, 0];
    const projected = viewport.project(world);
    const sx = projected[0];
    const sy = projected[1];
    return Number.isFinite(sx) && Number.isFinite(sy)
      ? [sx / scale, sy / scale]
      : null;
  };
  let bounds: [number, number, number, number] = [
    0,
    0,
    viewport.width / scale,
    viewport.height / scale
  ];
  const corners = frameExtent
    ? [toPagePx(frameExtent[0]), toPagePx(frameExtent[1])]
    : [];
  if (corners[0] && corners[1]) {
    const [a, b] = corners;
    bounds = [
      Math.max(bounds[0], Math.min(a[0], b[0])),
      Math.max(bounds[1], Math.min(a[1], b[1])),
      Math.min(bounds[2], Math.max(a[0], b[0])),
      Math.min(bounds[3], Math.max(a[1], b[1]))
    ];
  }
  return bounds[2] > bounds[0] && bounds[3] > bounds[1]
    ? { bounds, toPagePx }
    : null;
}

function hashPlacementInput(
  entries: AutoLabelEntry[],
  options: AutoLabelPlacementOptions
): string {
  let hash = 2166136261;
  const mix = (value: number) => {
    hash = Math.imul(hash ^ Math.round(value * 100), 16777619);
  };
  for (const value of [
    ...options.bounds,
    options.gap,
    options.symbolGap,
    options.minGap
  ])
    mix(value);
  for (const entry of entries) {
    mix(entry.id);
    mix(entry.anchor[0]);
    mix(entry.anchor[1]);
    mix(entry.halfSize[0]);
    mix(entry.halfSize[1]);
    mix(entry.symbolRadius);
    mix(entry.priority);
    mix(entry.mode === 'pinned' ? 2 : entry.mode === 'required' ? 1 : 0);
    if (entry.center) {
      mix(entry.center[0]);
      mix(entry.center[1]);
    }
  }
  return `${entries.length}:${hash >>> 0}`;
}

interface CachedPlacement {
  key: string;
  result: PlacementResult;
  centers: Map<number, LabelOffset | null>;
}

const placementByVisualization = new Map<string, CachedPlacement>();

/**
 * Places the label blocks of a visualization and returns, by entry id, the
 * block centre relative to its anchor, or null for a label hidden for lack of
 * room. The previous result of the visualization keeps labels where they were
 * while their spot stays free, so a zoom does not reshuffle the map.
 */
export function placeLabelBlocks(
  vizId: string,
  entries: AutoLabelEntry[],
  options: AutoLabelPlacementOptions
): Map<number, LabelOffset | null> {
  const key = hashPlacementInput(entries, options);
  const cached = placementByVisualization.get(vizId);
  if (cached?.key === key) return cached.centers;

  const mayUseLeader = new Set(
    entries
      .filter((entry) => entry.symbolRadius > 0)
      .sort((a, b) => b.priority - a.priority)
      .slice(0, AUTO_LEADER_MAX_LABELS)
      .map((entry) => entry.id)
  );
  const labels: LabelInput[] = entries.map((entry) => ({
    id: entry.id,
    x: entry.anchor[0],
    y: entry.anchor[1],
    width: entry.halfSize[0] * 2,
    height: entry.halfSize[1] * 2,
    symbol:
      entry.symbolRadius > 0
        ? { type: 'circle', radius: entry.symbolRadius }
        : { type: 'area', inscribedRadius: 0 },
    priority: entry.priority,
    mode: entry.mode,
    offset: entry.center,
    leader: mayUseLeader.has(entry.id)
  }));
  const result = placeLabels(labels, {
    bounds: options.bounds,
    gap: options.gap,
    leader: { symbolGap: options.symbolGap, minGap: options.minGap },
    // Without a symbol the label names an area or a bare point: centred first.
    areaOverflowCost: 0,
    previous: cached?.result
  });

  const centers = new Map<number, LabelOffset | null>();
  result.labels.forEach((placed, index) => {
    const entry = entries[index];
    centers.set(
      entry.id,
      placed.box
        ? [
            (placed.box[0] + placed.box[2]) / 2 - entry.anchor[0],
            (placed.box[1] + placed.box[3]) / 2 - entry.anchor[1]
          ]
        : null
    );
  });
  placementByVisualization.set(vizId, { key, result, centers });
  return centers;
}
