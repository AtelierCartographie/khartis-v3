export const PAGE_GRID_SIZE_PX = 12;

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

export function snapToPageGrid(value: number, enabled = true): number {
  if (!enabled) {
    return value;
  }

  return Math.round(value / PAGE_GRID_SIZE_PX) * PAGE_GRID_SIZE_PX;
}

export function snapPointToPageGrid(
  point: PageGridPoint,
  enabled = true
): PageGridPoint {
  return {
    x: snapToPageGrid(point.x, enabled),
    y: snapToPageGrid(point.y, enabled)
  };
}

export function getGridAlignedRange(
  min: number,
  max: number
): { min: number; max: number } | null {
  const alignedMin = Math.ceil(min / PAGE_GRID_SIZE_PX) * PAGE_GRID_SIZE_PX;
  const alignedMax = Math.floor(max / PAGE_GRID_SIZE_PX) * PAGE_GRID_SIZE_PX;

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
  snapEnabled = true
): PageGridPoint {
  if (!snapEnabled) {
    return clampPointToBounds(point, bounds);
  }

  const xGridBounds = getGridAlignedRange(bounds.minX, bounds.maxX);
  const yGridBounds = getGridAlignedRange(bounds.minY, bounds.maxY);

  return {
    x: xGridBounds
      ? clampToRange(
          snapToPageGrid(point.x, true),
          xGridBounds.min,
          xGridBounds.max
        )
      : clampToRange(point.x, bounds.minX, bounds.maxX),
    y: yGridBounds
      ? clampToRange(
          snapToPageGrid(point.y, true),
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
