import {
  placeLabels,
  type LabelInput,
  type LabelMode,
  type PlacementResult
} from '@ateliercartographie/label-placer';
import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import type { Matrix4 } from '@math.gl/core';
import type { Table as ArrowTable } from 'apache-arrow/Arrow';

import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';

import type { PageItemBox } from '../stores/page-item-obstacles.store.svelte';

import type { BasemapFrameExtent } from './basemap-frame.utils';
import { parsePathsWithProjection } from './geoarrow-stream-bridge.utils';
import type { LabelOffset } from './label-layout.utils';

/**
 * Only the most important labels may move away with a leader line: the first
 * quarter of the named symbols, 300 at most. With leaders for all, most names
 * of a dense map hang on one (33 of 58 on the départements); with a quarter,
 * a third as many leaders for one name less. Area labels with their outline
 * count too: their leader runs into the area up to its anchor, so it does not
 * point at the neighbour across the border.
 */
const AUTO_LEADER_MAX_LABELS = 300;
const AUTO_LEADER_SHARE = 0.25;

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
  /**
   * Outline of the area the label names, in page pixels: the label goes
   * wholly inside it or wholly outside, never across it.
   */
  rings?: LabelOffset[][];
  /** Half sizes of other measured layouts of the block, such as two lines. */
  layouts?: LabelOffset[];
}

/** Where the engine set a label block. */
export interface AutoPlacedBlock {
  /** Block centre relative to the anchor, in page pixels. */
  center: LabelOffset;
  /** 0 for the main layout, k for `layouts[k - 1]`. */
  layout: number;
  /**
   * For an entry with `rings`, the engine's leader relative to the anchor, or
   * null without one: it starts on the outline, which the caller does not know.
   */
  areaLeader?: LabelOffset[] | null;
}

export interface AutoLabelPlacementOptions {
  bounds: [number, number, number, number];
  /** Boxes labels must keep clear of, in page pixels. */
  obstacles: [number, number, number, number][];
  /**
   * Basemap outlines in page pixels: soft obstacles that keep label boxes off
   * coastlines and borders where another spot is as good. Leaders may cross.
   */
  lines: LabelOffset[][];
  /**
   * The same land as filled rings in page pixels: a soft polygon, so that the names of
   * coastal places take the sea side when it is as good. Empty to leave it out.
   */
  land: LabelOffset[][];
  /** Clear space kept between labels, and between leaders and labels, in page pixels. */
  spacing: number;
  /** `columns` stacks the labels of dense clusters in columns beside them. */
  align: 'none' | 'columns';
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

/**
 * Cost of a label wholly on land, in position-rank units: above 2, right on land loses to left
 * at sea (rank 2), while a name inland keeps its order of positions.
 */
const LAND_COST = 2.5;

/** Outline vertices closer than this, in page pixels, are merged. */
const OUTLINE_MIN_STEP_PX = 1.5;

/** Appends a page-pixel vertex unless it is too close to the last one. */
function pushThinned(line: LabelOffset[], point: LabelOffset): void {
  const last = line[line.length - 1];
  if (
    !last ||
    Math.abs(point[0] - last[0]) + Math.abs(point[1] - last[1]) >=
      OUTLINE_MIN_STEP_PX
  )
    line.push(point);
}

interface ProjectedPaths {
  readonly length: number;
  readonly positions: ArrayLike<number>;
  readonly startIndices: ArrayLike<number>;
  readonly featureIds: ArrayLike<number>;
}

/**
 * The rings of the given polygon rows in page pixels, thinned like the
 * basemap outlines, by row. Rings are not cut to the bounds: the engine
 * needs the whole outline to tell inside from outside.
 */
export function projectFeatureRings(
  paths: ProjectedPaths,
  rows: Set<number>,
  frame: LabelPlacementFrame
): Map<number, LabelOffset[][]> {
  const ringsByRow = new Map<number, LabelOffset[][]>();
  const vertexCount = paths.positions.length / 2;
  for (let path = 0; path < paths.length; path++) {
    const row = paths.featureIds[path];
    if (!rows.has(row)) continue;
    const end =
      path + 1 < paths.length ? paths.startIndices[path + 1] : vertexCount;
    const ring: LabelOffset[] = [];
    for (let v = paths.startIndices[path]; v < end; v++) {
      const point = frame.toPagePx([
        paths.positions[v * 2],
        paths.positions[v * 2 + 1]
      ]);
      if (point) pushThinned(ring, point);
    }
    if (ring.length < 3) continue;
    const rings = ringsByRow.get(row);
    if (rings) rings.push(ring);
    else ringsByRow.set(row, [ring]);
  }
  return ringsByRow;
}

/**
 * The outlines of the basemap land layers as page-pixel polylines, cut to the
 * placement bounds and thinned to about one vertex per page pixel and a half.
 * They reuse the paths the basemap stroke already parsed for the projection.
 */
export function projectOutlineLines(
  tables: ArrowTable[],
  projection: ProjectionLike | undefined,
  frame: LabelPlacementFrame
): LabelOffset[][] {
  if (!projection) return [];
  const [bx0, by0, bx1, by1] = frame.bounds;
  const inside = ([x, y]: LabelOffset) =>
    x >= bx0 && x <= bx1 && y >= by0 && y <= by1;
  const lines: LabelOffset[][] = [];
  for (const table of tables) {
    const { positions, startIndices, length } = parsePathsWithProjection(
      table,
      projection
    );
    const vertexCount = positions.length / 2;
    for (let path = 0; path < length; path++) {
      const end = path + 1 < length ? startIndices[path + 1] : vertexCount;
      let current: LabelOffset[] = [];
      for (let v = startIndices[path]; v < end; v++) {
        const point = frame.toPagePx([positions[v * 2], positions[v * 2 + 1]]);
        if (!point || !inside(point)) {
          if (current.length > 1) lines.push(current);
          current = [];
          continue;
        }
        pushThinned(current, point);
      }
      if (current.length > 1) lines.push(current);
    }
  }
  return lines;
}

/**
 * Whether the anchor lies within the extent of the rings, a guard against
 * rings matched to the wrong label.
 */
export function ringsSurround(
  rings: LabelOffset[][],
  [x, y]: LabelOffset
): boolean {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const ring of rings)
    for (const [px, py] of ring) {
      x0 = Math.min(x0, px);
      y0 = Math.min(y0, py);
      x1 = Math.max(x1, px);
      y1 = Math.max(y1, py);
    }
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

/**
 * The basemap land layers as whole rings in page pixels, thinned like the outlines but not cut
 * to the bounds: filling them needs every ring closed.
 */
export function projectLandRings(
  tables: ArrowTable[],
  projection: ProjectionLike | undefined,
  frame: LabelPlacementFrame
): LabelOffset[][] {
  if (!projection) return [];
  const rings: LabelOffset[][] = [];
  for (const table of tables) {
    const { positions, startIndices, length } = parsePathsWithProjection(
      table,
      projection
    );
    const vertexCount = positions.length / 2;
    for (let path = 0; path < length; path++) {
      const end = path + 1 < length ? startIndices[path + 1] : vertexCount;
      const ring: LabelOffset[] = [];
      for (let v = startIndices[path]; v < end; v++) {
        const point = frame.toPagePx([positions[v * 2], positions[v * 2 + 1]]);
        if (point) pushThinned(ring, point);
      }
      if (ring.length >= 3) rings.push(ring);
    }
  }
  return rings;
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
    ...options.obstacles.flat(),
    options.align === 'columns' ? 1 : 0,
    options.spacing,
    options.lines.length,
    options.land.length
  ])
    mix(value);
  for (const line of [...options.lines, ...options.land])
    for (const [x, y] of line) {
      mix(x);
      mix(y);
    }
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
    for (const [hw, hh] of entry.layouts ?? []) {
      mix(hw);
      mix(hh);
    }
    for (const ring of entry.rings ?? []) {
      mix(ring.length);
      for (const [x, y] of ring) {
        mix(x);
        mix(y);
      }
    }
  }
  return `${entries.length}:${hash >>> 0}`;
}

interface CachedPlacement {
  key: string;
  obstaclesKey: string;
  result: PlacementResult;
  blocks: Map<number, AutoPlacedBlock | null>;
}

const placementByVisualization = new Map<string, CachedPlacement>();

/**
 * Places the label blocks of a visualization and returns, by entry id, where
 * each block went, or null for a label hidden for lack of room. The previous result of the visualization keeps labels where they were
 * while their spot stays free, so a zoom does not reshuffle the map. A page
 * item that moves drops it, so labels it pushed aside come back once it leaves.
 */
export function placeLabelBlocks(
  vizId: string,
  entries: AutoLabelEntry[],
  options: AutoLabelPlacementOptions
): Map<number, AutoPlacedBlock | null> {
  const key = hashPlacementInput(entries, options);
  const cached = placementByVisualization.get(vizId);
  if (cached?.key === key) return cached.blocks;
  const obstaclesKey = options.obstacles.flat().join(',');

  const named = entries.filter(
    (entry) =>
      (entry.symbolRadius > 0 || entry.rings !== undefined) &&
      entry.halfSize[0] > 0
  );
  const mayUseLeader = new Set(
    named
      .sort((a, b) => b.priority - a.priority)
      .slice(
        0,
        Math.min(
          AUTO_LEADER_MAX_LABELS,
          Math.ceil(named.length * AUTO_LEADER_SHARE)
        )
      )
      .map((entry) => entry.id)
  );
  const labels: LabelInput[] = entries.map((entry) => ({
    id: entry.id,
    x: entry.anchor[0],
    y: entry.anchor[1],
    width: entry.halfSize[0] * 2,
    height: entry.halfSize[1] * 2,
    layouts: entry.layouts?.map(([hw, hh]) => ({
      width: hw * 2,
      height: hh * 2
    })),
    symbol:
      entry.symbolRadius > 0
        ? { type: 'circle', radius: entry.symbolRadius }
        : entry.rings
          ? { type: 'polygon', rings: entry.rings }
          : { type: 'area', inscribedRadius: 0 },
    priority: entry.priority,
    mode: entry.mode,
    offset: entry.center,
    leader: mayUseLeader.has(entry.id)
  }));
  const result = placeLabels(labels, {
    bounds: options.bounds,
    obstacles: [
      ...options.obstacles.map(([x0, y0, x1, y1]) => ({
        type: 'rect' as const,
        box: [
          x0 - options.gap,
          y0 - options.gap,
          x1 + options.gap,
          y1 + options.gap
        ] as [number, number, number, number]
      })),
      ...options.lines.map((points) => ({
        type: 'line' as const,
        points,
        soft: true
      })),
      ...(options.land.length
        ? [
            {
              type: 'polygon' as const,
              rings: options.land,
              soft: true,
              cost: LAND_COST
            }
          ]
        : [])
    ],
    align: options.align,
    spacing: options.spacing,
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
  const blocks = new Map<number, AutoPlacedBlock | null>();
  result.labels.forEach((placed, index) => {
    const entry = entries[index];
    const [ax, ay] = entry.anchor;
    blocks.set(
      entry.id,
      placed.box && (entry.mode === 'pinned' || !isUnderPageItem(placed.box))
        ? {
            center: [
              (placed.box[0] + placed.box[2]) / 2 - ax,
              (placed.box[1] + placed.box[3]) / 2 - ay
            ],
            layout: placed.layout,
            ...(entry.rings && {
              areaLeader:
                placed.leader?.map(([x, y]): LabelOffset => [x - ax, y - ay]) ??
                null
            })
          }
        : null
    );
  });
  placementByVisualization.set(vizId, { key, obstaclesKey, result, blocks });
  return blocks;
}
