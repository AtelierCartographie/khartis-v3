import {
  placeLabels,
  type LabelInput,
  type LabelMode,
  type PlacementResult
} from '@ateliercartographie/label-placer';
import type { Matrix4 } from '@math.gl/core';

import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';

import type { PageItemBox } from '../stores/page-item-obstacles.store.svelte';

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
  /** Boxes labels must keep clear of, in page pixels. */
  obstacles: [number, number, number, number][];
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
  /** The page items over the map area, as obstacles in page pixels. */
  toObstacles: (boxes: PageItemBox[]) => [number, number, number, number][];
}

/**
 * Projects layer positions to page pixels through the live map viewport, or
 * null before the map has rendered once. The canvas spans the whole page, so
 * labels are kept inside the basemap frame when the projection has one.
 * `mapAreaWidth` is the logical width of the map area, which page item boxes
 * are measured against.
 */
export function resolveLabelPlacementFrame(
  modelMatrix: Matrix4 | null | undefined,
  pageDisplayScale: number,
  frameExtent: BasemapFrameExtent | null,
  mapAreaWidth: number
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
  // MapLibre renders at page scale 1 on a canvas sized by the page zoom, so
  // page item boxes are scaled to the canvas rather than assumed to match it.
  const itemScale =
    mapAreaWidth > 0 ? viewport.width / scale / mapAreaWidth : 1;
  const toObstacles = (
    boxes: PageItemBox[]
  ): [number, number, number, number][] =>
    boxes
      .map(
        (box) =>
          box.map((value) => value * itemScale) as [
            number,
            number,
            number,
            number
          ]
      )
      .filter(
        ([x0, y0, x1, y1]) =>
          x1 > bounds[0] && x0 < bounds[2] && y1 > bounds[1] && y0 < bounds[3]
      );
  return bounds[2] > bounds[0] && bounds[3] > bounds[1]
    ? { bounds, toPagePx, toObstacles }
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
    options.minGap,
    options.obstacles.length,
    ...options.obstacles.flat()
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
  obstaclesKey: string;
  result: PlacementResult;
  centers: Map<number, LabelOffset | null>;
}

const placementByVisualization = new Map<string, CachedPlacement>();

/**
 * Places the label blocks of a visualization and returns, by entry id, the
 * block centre relative to its anchor, or null for a label hidden for lack of
 * room. The previous result of the visualization keeps labels where they were
 * while their spot stays free, so a zoom does not reshuffle the map. A page
 * item that moves drops it, so labels it pushed aside come back once it leaves.
 */
export function placeLabelBlocks(
  vizId: string,
  entries: AutoLabelEntry[],
  options: AutoLabelPlacementOptions
): Map<number, LabelOffset | null> {
  const key = hashPlacementInput(entries, options);
  const cached = placementByVisualization.get(vizId);
  if (cached?.key === key) return cached.centers;
  const obstaclesKey = options.obstacles.flat().join(',');

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
    obstacles: options.obstacles.map(([x0, y0, x1, y1]) => ({
      type: 'rect',
      box: [
        x0 - options.gap,
        y0 - options.gap,
        x1 + options.gap,
        y1 + options.gap
      ]
    })),
    gap: options.gap,
    leader: { symbolGap: options.symbolGap, minGap: options.minGap },
    // Without a symbol the label names an area or a bare point: centred first.
    areaOverflowCost: 0,
    previous: cached?.obstaclesKey === obstaclesKey ? cached.result : undefined
  });

  // A required label with no free spot left falls back onto a blocked one;
  // under a page item it could not be read, so it is hidden instead.
  const isUnderPageItem = (box: [number, number, number, number]): boolean =>
    options.obstacles.some(
      ([x0, y0, x1, y1]) =>
        box[0] < x1 && x0 < box[2] && box[1] < y1 && y0 < box[3]
    );
  const centers = new Map<number, LabelOffset | null>();
  result.labels.forEach((placed, index) => {
    const entry = entries[index];
    centers.set(
      entry.id,
      placed.box && (entry.mode === 'pinned' || !isUnderPageItem(placed.box))
        ? [
            (placed.box[0] + placed.box[2]) / 2 - entry.anchor[0],
            (placed.box[1] + placed.box[3]) / 2 - entry.anchor[1]
          ]
        : null
    );
  });
  placementByVisualization.set(vizId, { key, obstaclesKey, result, centers });
  return centers;
}
