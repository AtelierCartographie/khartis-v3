/**
 * One base unit drives the layout: the snap step is one unit, the visible grid
 * is a multiple of it, and the inner margins of layout objects (legends, geo
 * indications) are multiples of it too, so their edges and contents can share
 * the same alignments.
 */
import { hexToRgb } from './color-utils';

export const LAYOUT_UNIT_PX = 4;
/** @alias */
export const PAGE_SNAP_STEP_PX = LAYOUT_UNIT_PX;
export const PAGE_GRID_SIZE_PX = LAYOUT_UNIT_PX * 3;

export function roundToLayoutUnit(value: number, minUnits = 0): number {
  return Math.max(
    minUnits * LAYOUT_UNIT_PX,
    Math.round(value / LAYOUT_UNIT_PX) * LAYOUT_UNIT_PX
  );
}

export interface PageGridPoint {
  x: number;
  y: number;
}

export interface PageGridBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface PageGridSize {
  width: number;
  height: number;
}

const NO_GRID_ORIGIN: PageGridPoint = { x: 0, y: 0 };

function getCenteredGridOffset(extent: number): number {
  const rest =
    ((extent % PAGE_GRID_SIZE_PX) + PAGE_GRID_SIZE_PX) % PAGE_GRID_SIZE_PX;
  return Math.floor(rest / 2);
}

/**
 * The grid is centred on the page: the space left between its outer points
 * and the edges is the same on both sides of each axis (to the pixel, so that
 * snapped positions stay whole). Snapping in page coordinates starts there.
 */
export function getPageGridOrigin(page: PageGridSize): PageGridPoint {
  return {
    x: getCenteredGridOffset(page.width),
    y: getCenteredGridOffset(page.height)
  };
}

/** The page grid origin in an area placed at `areaOffset` on the page. */
export function getAreaGridOrigin(
  page: PageGridSize,
  areaOffset: PageGridPoint
): PageGridPoint {
  const origin = getPageGridOrigin(page);
  return { x: origin.x - areaOffset.x, y: origin.y - areaOffset.y };
}

// An item keeps its distance to the edge it is closest to on each axis, so
// one in a bottom-right corner stays there when its area is resized; one
// about as far from both edges stays centred.
const CENTERED_GAP_TOLERANCE = 0.1;

function remapAxis(
  start: number,
  extent: number,
  fromSize: number,
  toSize: number
): number {
  const startGap = start;
  const endGap = fromSize - start - extent;
  if (Math.abs(startGap - endGap) <= fromSize * CENTERED_GAP_TOLERANCE) {
    return ((start + extent / 2) / fromSize) * toSize - extent / 2;
  }
  return startGap < endGap ? start : start + toSize - fromSize;
}

export function remapPointToResizedArea(
  point: PageGridPoint,
  size: PageGridSize,
  from: PageGridSize,
  to: PageGridSize
): PageGridPoint {
  if (from.width === to.width && from.height === to.height) {
    return point;
  }

  return {
    x: remapAxis(point.x, size.width, from.width, to.width),
    y: remapAxis(point.y, size.height, from.height, to.height)
  };
}

export function clampToRange(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A size snaps with the default origin; a position on the page passes the grid origin of its axis. */
export function snapToPageGrid(
  value: number,
  enabled = true,
  origin = 0
): number {
  if (!enabled) {
    return value;
  }

  return (
    origin +
    Math.round((value - origin) / PAGE_SNAP_STEP_PX) * PAGE_SNAP_STEP_PX
  );
}

export function snapPointToPageGrid(
  point: PageGridPoint,
  enabled = true,
  origin: PageGridPoint = NO_GRID_ORIGIN
): PageGridPoint {
  return {
    x: snapToPageGrid(point.x, enabled, origin.x),
    y: snapToPageGrid(point.y, enabled, origin.y)
  };
}

export function getGridAlignedRange(
  min: number,
  max: number,
  origin = 0
): { min: number; max: number } | null {
  const alignedMin =
    origin + Math.ceil((min - origin) / PAGE_SNAP_STEP_PX) * PAGE_SNAP_STEP_PX;
  const alignedMax =
    origin + Math.floor((max - origin) / PAGE_SNAP_STEP_PX) * PAGE_SNAP_STEP_PX;

  if (alignedMin > alignedMax) {
    return null;
  }

  return { min: alignedMin, max: alignedMax };
}

export function clampPointToBounds(
  point: PageGridPoint,
  bounds: PageGridBounds
): PageGridPoint {
  return {
    x: clampToRange(point.x, bounds.minX, bounds.maxX),
    y: clampToRange(point.y, bounds.minY, bounds.maxY)
  };
}

export function snapPointWithinBounds(
  point: PageGridPoint,
  bounds: PageGridBounds,
  snapEnabled = true,
  origin: PageGridPoint = NO_GRID_ORIGIN
): PageGridPoint {
  if (!snapEnabled) {
    return clampPointToBounds(point, bounds);
  }

  const xGridBounds = getGridAlignedRange(bounds.minX, bounds.maxX, origin.x);
  const yGridBounds = getGridAlignedRange(bounds.minY, bounds.maxY, origin.y);

  return {
    x: xGridBounds
      ? clampToRange(
          snapToPageGrid(point.x, true, origin.x),
          xGridBounds.min,
          xGridBounds.max
        )
      : clampToRange(point.x, bounds.minX, bounds.maxX),
    y: yGridBounds
      ? clampToRange(
          snapToPageGrid(point.y, true, origin.y),
          yGridBounds.min,
          yGridBounds.max
        )
      : clampToRange(point.y, bounds.minY, bounds.maxY)
  };
}

export function getDragBounds(
  container: PageGridSize,
  item: PageGridSize
): PageGridBounds {
  return {
    minX: 0,
    maxX: Math.max(0, container.width - item.width),
    minY: 0,
    maxY: Math.max(0, container.height - item.height)
  };
}

/**
 * Layout items (legends, geo indications) are stored relative to the map area
 * but may move over the page margins: cropping the map is a way to free room
 * for them. Bounds and grid snapping therefore follow the page.
 */
export function snapAreaPointWithinPage(
  point: PageGridPoint,
  item: PageGridSize,
  page: PageGridSize,
  areaOffset: PageGridPoint,
  snapEnabled = true
): PageGridPoint {
  const pagePoint = snapPointWithinBounds(
    { x: point.x + areaOffset.x, y: point.y + areaOffset.y },
    getDragBounds(page, item),
    snapEnabled,
    getPageGridOrigin(page)
  );
  return { x: pagePoint.x - areaOffset.x, y: pagePoint.y - areaOffset.y };
}

/** A page resize keeps the margins, so the item keeps its distance to the nearest page edge. */
export function remapAreaPointToResizedPage(
  point: PageGridPoint,
  item: PageGridSize,
  from: PageGridSize,
  to: PageGridSize,
  areaOffset: PageGridPoint
): PageGridPoint {
  const pagePoint = remapPointToResizedArea(
    { x: point.x + areaOffset.x, y: point.y + areaOffset.y },
    item,
    from,
    to
  );
  return { x: pagePoint.x - areaOffset.x, y: pagePoint.y - areaOffset.y };
}

type Rgb = [number, number, number];

function toLinearChannel(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance([r, g, b]: Rgb): number {
  return (
    0.2126 * toLinearChannel(r) +
    0.7152 * toLinearChannel(g) +
    0.0722 * toLinearChannel(b)
  );
}

export function getContrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [
    getRelativeLuminance(a),
    getRelativeLuminance(b)
  ].sort((first, second) => second - first);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixRgb(from: Rgb, to: Rgb, ratio: number): Rgb {
  return from.map((channel, index) =>
    Math.round(channel + (to[index] - channel) * ratio)
  ) as Rgb;
}

/** Visible on any page colour, yet far below the contrast of text (4.5). */
export const PAGE_GRID_POINT_CONTRAST = 1.6;
// Luminance where black and white offer the same contrast.
const LUMINANCE_CONTRAST_PIVOT = 0.18;

/**
 * The page colour darkened, or lightened on a dark page, just enough for the
 * grid points to reach the same contrast whatever the page colour.
 */
export function getPageGridPointColor(pageColorHex: string): string {
  const page = hexToRgb(pageColorHex);
  if (page.some((channel) => !Number.isFinite(channel))) {
    return 'rgb(22, 22, 22)';
  }
  const target: Rgb =
    getRelativeLuminance(page) > LUMINANCE_CONTRAST_PIVOT
      ? [0, 0, 0]
      : [255, 255, 255];
  let low = 0;
  let high = 1;
  for (let step = 0; step < 16; step += 1) {
    const ratio = (low + high) / 2;
    if (
      getContrastRatio(page, mixRgb(page, target, ratio)) <
      PAGE_GRID_POINT_CONTRAST
    ) {
      low = ratio;
    } else {
      high = ratio;
    }
  }
  return `rgb(${mixRgb(page, target, high).join(', ')})`;
}
