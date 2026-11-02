import { get_max_scale } from '../core/projscreen';
import type { BBox } from '../types';

export interface MapFrameInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface ResolveFittedMapFrameOptions {
  page: { width: number; height: number };
  margins: MapFrameInsets;
  /** Extent the automatic fit centres and scales into the frame. */
  referenceBbox: BBox | null;
  /** Extent of what is drawn, in the same units; null when it is the reference. */
  drawnBbox: BBox | null;
  fitPaddingPx: number;
  minFrameSize: number;
}

export interface FittedMapFrame {
  frame: MapFrameInsets;
  /** Zoom, past the fit of the reference in the frame, that fills the frame. */
  zoom: number;
  /** View centre, as an offset from the reference centre in its width and height. */
  centerRatio: [number, number];
}

function hasArea(bbox: BBox | null): bbox is BBox {
  return (
    bbox !== null &&
    bbox.every(Number.isFinite) &&
    bbox[2] > bbox[0] &&
    bbox[3] > bbox[1]
  );
}

function fitAxis(available: number, size: number, minSize: number): number {
  const fitted = Math.min(
    available,
    Math.max(Math.ceil(size), Math.min(minSize, available))
  );
  return Math.max(0, Math.floor((available - fitted) / 2));
}

/**
 * Frame and base view of an automatically fitted orthographic map. The
 * automatic fit centres the reference in the area the margins leave; the
 * frame keeps the part of the drawn map that fit shows, scaled up until it
 * meets the margins, with no gap around it, and the view centres on it. The
 * zoom is measured against the fit of the reference in that frame, which is
 * what a restored view refits to.
 */
export function resolveFittedMapFrame({
  page,
  margins,
  referenceBbox,
  drawnBbox,
  fitPaddingPx,
  minFrameSize
}: ResolveFittedMapFrameOptions): FittedMapFrame {
  const fallback: FittedMapFrame = {
    frame: { ...margins },
    zoom: 0,
    centerRatio: [0, 0]
  };
  const width = page.width - margins.left - margins.right;
  const height = page.height - margins.top - margins.bottom;
  if (!hasArea(referenceBbox) || width <= 0 || height <= 0) {
    return fallback;
  }

  const fitScale = get_max_scale(
    { width, height },
    referenceBbox,
    fitPaddingPx
  );
  const centerX = (referenceBbox[0] + referenceBbox[2]) / 2;
  const centerY = (referenceBbox[1] + referenceBbox[3]) / 2;
  const halfWindowWidth = width / 2 / fitScale;
  const halfWindowHeight = height / 2 / fitScale;
  const extent = hasArea(drawnBbox) ? drawnBbox : referenceBbox;
  const visible: BBox = [
    Math.max(extent[0], centerX - halfWindowWidth),
    Math.max(extent[1], centerY - halfWindowHeight),
    Math.min(extent[2], centerX + halfWindowWidth),
    Math.min(extent[3], centerY + halfWindowHeight)
  ];
  if (!hasArea(visible)) {
    return fallback;
  }

  const visibleWidth = visible[2] - visible[0];
  const visibleHeight = visible[3] - visible[1];
  const scale = Math.min(width / visibleWidth, height / visibleHeight);
  const insetX = fitAxis(width, visibleWidth * scale, minFrameSize);
  const insetY = fitAxis(height, visibleHeight * scale, minFrameSize);
  const frameScale = get_max_scale(
    { width: width - 2 * insetX, height: height - 2 * insetY },
    referenceBbox,
    fitPaddingPx
  );

  return {
    frame: {
      top: margins.top + insetY,
      right: margins.right + insetX,
      bottom: margins.bottom + insetY,
      left: margins.left + insetX
    },
    zoom: frameScale > 0 ? Math.log2(scale / frameScale) : 0,
    centerRatio: [
      ((visible[0] + visible[2]) / 2 - centerX) /
        (referenceBbox[2] - referenceBbox[0]),
      ((visible[1] + visible[3]) / 2 - centerY) /
        (referenceBbox[3] - referenceBbox[1])
    ]
  };
}

const drawnExtentCache = new WeakMap<object, BBox | null>();

function readPositions(
  data: unknown
): { value: ArrayLike<number>; size: number } | null {
  if (!data || typeof data !== 'object' || !('attributes' in data)) {
    return null;
  }
  const attributes = (data as { attributes: unknown }).attributes;
  if (!attributes || typeof attributes !== 'object') {
    return null;
  }

  for (const key of ['getPolygon', 'getPath', 'getPosition']) {
    const attribute = (attributes as Record<string, unknown>)[key];
    if (!attribute || typeof attribute !== 'object') continue;
    const { value, size } = attribute as { value?: unknown; size?: unknown };
    if (ArrayBuffer.isView(value) && typeof size === 'number' && size >= 2) {
      return { value: value as unknown as ArrayLike<number>, size };
    }
  }
  return null;
}

function measurePositions(value: ArrayLike<number>, size: number): BBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index + 1 < value.length; index += size) {
    const x = value[index];
    const y = value[index + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return minX <= maxX && minY <= maxY ? [minX, minY, maxX, maxY] : null;
}

function flattenLayerProps(
  layers: unknown
): { data?: unknown; visible?: unknown }[] {
  if (Array.isArray(layers)) {
    return layers.flatMap(flattenLayerProps);
  }
  if (!layers || typeof layers !== 'object' || !('props' in layers)) {
    return [];
  }
  const props = (layers as { props: unknown }).props;
  return props && typeof props === 'object' ? [props] : [];
}

/**
 * Extent of the geometry drawn by binary Deck.gl layers (a nested layer
 * list), in the coordinates the layers receive, before their model matrix.
 * Each position buffer is measured once.
 */
export function measureDrawnExtent(layers: unknown): BBox | null {
  let extent: BBox | null = null;
  for (const props of flattenLayerProps(layers)) {
    if (props.visible === false) continue;
    const positions = readPositions(props.data);
    if (!positions) continue;

    const buffer = positions.value as unknown as object;
    let bbox = drawnExtentCache.get(buffer);
    if (bbox === undefined) {
      bbox = measurePositions(positions.value, positions.size);
      drawnExtentCache.set(buffer, bbox);
    }
    if (!bbox) continue;

    extent = extent
      ? [
          Math.min(extent[0], bbox[0]),
          Math.min(extent[1], bbox[1]),
          Math.max(extent[2], bbox[2]),
          Math.max(extent[3], bbox[3])
        ]
      : bbox;
  }
  return extent;
}
