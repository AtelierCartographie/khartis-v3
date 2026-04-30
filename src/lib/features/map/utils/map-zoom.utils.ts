export const DEFAULT_MAP_BASE_ZOOM = 1.5;
export const DEFAULT_MAP_ZOOM_PERCENT = 100;
export const MIN_MAP_ZOOM_PERCENT = 10;
export const MAX_MAP_ZOOM_PERCENT = 2000;
export const MAP_ZOOM_INPUT_STEP = 10;
export const MAP_ZOOM_FACTOR_STEP = 1.1;
export const MIN_MAPLIBRE_ZOOM = -2;

export interface MapZoomBounds {
  minZoom: number;
  maxZoom: number;
}

function normalizeBaseZoomLevel(baseZoomLevel: number): number {
  return Number.isFinite(baseZoomLevel) ? baseZoomLevel : DEFAULT_MAP_BASE_ZOOM;
}

export function clampMapZoomPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    return DEFAULT_MAP_ZOOM_PERCENT;
  }

  return Math.max(
    MIN_MAP_ZOOM_PERCENT,
    Math.min(MAX_MAP_ZOOM_PERCENT, percent)
  );
}

export function resolveMapZoomPercent(
  baseZoomLevel: number,
  zoomLevel: number
): number {
  const normalizedBaseZoomLevel = normalizeBaseZoomLevel(baseZoomLevel);
  const normalizedZoomLevel = Number.isFinite(zoomLevel)
    ? zoomLevel
    : normalizedBaseZoomLevel;

  return (
    DEFAULT_MAP_ZOOM_PERCENT *
    Math.pow(2, (normalizedZoomLevel - normalizedBaseZoomLevel) / 2)
  );
}

export function resolveMapZoomLevel(
  baseZoomLevel: number,
  percent: number
): number {
  return (
    normalizeBaseZoomLevel(baseZoomLevel) +
    2 * Math.log2(clampMapZoomPercent(percent) / DEFAULT_MAP_ZOOM_PERCENT)
  );
}

export function resolveMapZoomBounds(baseZoomLevel: number): MapZoomBounds {
  return {
    minZoom: Math.max(
      MIN_MAPLIBRE_ZOOM,
      resolveMapZoomLevel(baseZoomLevel, MIN_MAP_ZOOM_PERCENT)
    ),
    maxZoom: resolveMapZoomLevel(baseZoomLevel, MAX_MAP_ZOOM_PERCENT)
  };
}

export function clampMapZoomLevel(
  baseZoomLevel: number,
  zoomLevel: number
): number {
  const { minZoom, maxZoom } = resolveMapZoomBounds(baseZoomLevel);
  const normalizedZoomLevel = Number.isFinite(zoomLevel)
    ? zoomLevel
    : normalizeBaseZoomLevel(baseZoomLevel);

  return Math.max(minZoom, Math.min(maxZoom, normalizedZoomLevel));
}

export function nudgeMapZoomLevel(
  baseZoomLevel: number,
  zoomLevel: number,
  direction: 1 | -1
): number {
  const nextPercent =
    direction === 1
      ? resolveMapZoomPercent(baseZoomLevel, zoomLevel) * MAP_ZOOM_FACTOR_STEP
      : resolveMapZoomPercent(baseZoomLevel, zoomLevel) / MAP_ZOOM_FACTOR_STEP;

  return resolveMapZoomLevel(baseZoomLevel, nextPercent);
}
