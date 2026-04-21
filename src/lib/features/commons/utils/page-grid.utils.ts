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
