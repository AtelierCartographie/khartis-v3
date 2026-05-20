import {
  DistanceUnit,
  InsetMapType
} from '$lib/features/commons/constants/ui.constants';
import { formatValue } from '$lib/features/commons/utils/format.utils';
import { geoDistance } from 'd3-geo';

export type ColorPickerValidateEvent = {
  hex: string;
  hue: number;
  saturation: number;
  lightness: number;
};

export const INSET_MAP_SIZE_LIMITS: Record<
  InsetMapType,
  { min: number; max: number }
> = {
  [InsetMapType.GLOBE]: {
    min: 20,
    max: 800
  },
  [InsetMapType.PLANISPHERE]: {
    min: 20,
    max: 800
  }
};

const METERS_PER_KILOMETER = 1000;
const METERS_PER_MILE = 1609.344;
const EARTH_CIRCUMFERENCE_KILOMETERS = 40075.017;
const EARTH_RADIUS_METERS = 6378137;
const SCALE_FALLBACK_ZOOM = 2;
const NICE_SCALE_STEPS = [1, 2, 4, 5, 10] as const;

export const SCALE_TARGET_WIDTH_PX = 80;
export const SCALE_MAX_WIDTH_PX = 120;
export const INSET_MAP_MAX_AREA_FRACTION = 0.5;

export type ScaleDistanceMapLike = {
  getCenter: () => { lng: number; lat: number };
  project: (lngLat: [number, number]) => { x: number; y: number };
};

type ScaleDistanceProjectionLike = {
  invert: (point: [number, number]) => [number, number] | null | undefined;
};

export type ScaleDistanceContext = {
  map?: ScaleDistanceMapLike | null;
  zoom?: number | null;
  centerLatitude?: number | null;
  bounds?: InsetMapBounds | null;
  canvasSize?: { width: number; height: number } | null;
  isProjectedCoordinates?: boolean;
  projection?: unknown;
};

export type InsetMapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export const MAX_SCALE_DISTANCE_BY_UNIT: Record<DistanceUnit, number> = {
  [DistanceUnit.KILOMETERS]: Math.round(EARTH_CIRCUMFERENCE_KILOMETERS),
  [DistanceUnit.MILES]: Math.round(EARTH_CIRCUMFERENCE_KILOMETERS / 1.609344)
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return fallback;
}

export function getInsetMapBoundsAreaFraction(
  bounds: InsetMapBounds | null | undefined
): number | null {
  if (!bounds) {
    return null;
  }

  const north = clamp(toFiniteNumber(bounds.north, 90), -90, 90);
  const south = clamp(toFiniteNumber(bounds.south, -90), -90, 90);
  const rawLongitudeSpan = Math.abs(
    toFiniteNumber(bounds.east, 180) - toFiniteNumber(bounds.west, -180)
  );
  const longitudeSpan = clamp(rawLongitudeSpan, 0, 360);
  const latitudeSpan = clamp(north - south, 0, 180);

  return (longitudeSpan * latitudeSpan) / (360 * 180);
}

export function isInsetMapAvailableForBounds(
  bounds: InsetMapBounds | null | undefined
): boolean {
  const areaFraction = getInsetMapBoundsAreaFraction(bounds);
  return areaFraction === null || areaFraction < INSET_MAP_MAX_AREA_FRACTION;
}

function getScaleDistanceFractionDigits(distance: number): number {
  if (distance < 1) {
    return 2;
  }

  if (distance < 10) {
    return 1;
  }

  return 0;
}

function toNiceDistanceAtLeast(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  const exponent = Math.floor(Math.log10(value));
  const magnitude = Math.pow(10, exponent);
  const normalized = value / magnitude;
  const step =
    NICE_SCALE_STEPS.find((candidate) => candidate >= normalized) ?? 10;

  return step * magnitude;
}

function toNiceDistanceAtMost(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0.1;
  }

  const exponent = Math.floor(Math.log10(value));
  const magnitude = Math.pow(10, exponent);
  const normalized = value / magnitude;
  const step =
    [...NICE_SCALE_STEPS]
      .reverse()
      .find((candidate) => candidate <= normalized) ?? 1;

  return step * magnitude;
}

function isValidLongitudeLatitudePair(
  candidate: unknown
): candidate is [number, number] {
  return (
    Array.isArray(candidate) &&
    candidate.length >= 2 &&
    typeof candidate[0] === 'number' &&
    Number.isFinite(candidate[0]) &&
    typeof candidate[1] === 'number' &&
    Number.isFinite(candidate[1])
  );
}

function hasProjectionInvert(
  candidate: unknown
): candidate is ScaleDistanceProjectionLike {
  return (
    !!candidate &&
    typeof candidate === 'object' &&
    'invert' in candidate &&
    typeof (candidate as { invert?: unknown }).invert === 'function'
  );
}

function getDistanceMeters(
  start: [number, number],
  end: [number, number]
): number | null {
  const radians = geoDistance(start, end);
  if (!Number.isFinite(radians) || radians <= 0) {
    return null;
  }

  return radians * EARTH_RADIUS_METERS;
}

function getProjectedMetersPerPixelAtCenter(
  map: ScaleDistanceMapLike | null | undefined
): number | null {
  if (!map) {
    return null;
  }

  const center = map.getCenter();
  const safeLatitude = clamp(center.lat, -85, 85);
  const latitudeRadians = (safeLatitude * Math.PI) / 180;
  const cosLatitude = Math.cos(latitudeRadians);
  if (Math.abs(cosLatitude) < 1e-6) {
    return null;
  }

  const projectedCenter = map.project([center.lng, safeLatitude]);
  const projectedEast = map.project([center.lng + 1, safeLatitude]);
  const pixelDelta = Math.abs(projectedEast.x - projectedCenter.x);
  if (!Number.isFinite(pixelDelta) || pixelDelta < 1e-6) {
    return null;
  }

  const metersPerLongitudeDegree =
    (Math.PI / 180) * EARTH_RADIUS_METERS * cosLatitude;
  return metersPerLongitudeDegree / pixelDelta;
}

function getFallbackMetersPerPixel(
  zoom: number | null | undefined,
  centerLatitude: number | null | undefined
): number {
  const fallbackZoom = toFiniteNumber(zoom, SCALE_FALLBACK_ZOOM);
  const safeLatitude = clamp(toFiniteNumber(centerLatitude, 0), -85, 85);
  const cosine = Math.max(Math.cos((safeLatitude * Math.PI) / 180), 1e-6);

  return (
    (EARTH_CIRCUMFERENCE_KILOMETERS * 1000 * cosine) /
    Math.pow(2, fallbackZoom + 8)
  );
}

function getOrthographicCoordinateDeltaPerPixel(
  bounds: InsetMapBounds | null | undefined,
  canvasSize: { width: number; height: number } | null | undefined
): number | null {
  if (!bounds || !canvasSize || canvasSize.width <= 0) {
    return null;
  }

  const coordinateSpan = Math.abs(
    toFiniteNumber(bounds.east, 0) - toFiniteNumber(bounds.west, 0)
  );
  if (!Number.isFinite(coordinateSpan) || coordinateSpan <= 0) {
    return null;
  }

  return coordinateSpan / canvasSize.width;
}

function getProjectionMetersPerPixelAtCenter(
  projection: unknown,
  bounds: InsetMapBounds | null | undefined,
  canvasSize: { width: number; height: number } | null | undefined
): number | null {
  const coordinateDelta = getOrthographicCoordinateDeltaPerPixel(
    bounds,
    canvasSize
  );
  if (!hasProjectionInvert(projection) || coordinateDelta === null || !bounds) {
    return null;
  }

  const centerX =
    (toFiniteNumber(bounds.east, 0) + toFiniteNumber(bounds.west, 0)) / 2;
  const centerY =
    (toFiniteNumber(bounds.north, 0) + toFiniteNumber(bounds.south, 0)) / 2;
  const start = projection.invert([centerX, centerY]);
  const end = projection.invert([centerX + coordinateDelta, centerY]);

  if (
    !isValidLongitudeLatitudePair(start) ||
    !isValidLongitudeLatitudePair(end)
  ) {
    return null;
  }

  return getDistanceMeters(start, end);
}

function getGeographicBoundsMetersPerPixelAtCenter(
  bounds: InsetMapBounds | null | undefined,
  canvasSize: { width: number; height: number } | null | undefined
): number | null {
  const longitudeDelta = getOrthographicCoordinateDeltaPerPixel(
    bounds,
    canvasSize
  );
  if (longitudeDelta === null || !bounds) {
    return null;
  }

  const centerLongitude =
    (toFiniteNumber(bounds.east, 0) + toFiniteNumber(bounds.west, 0)) / 2;
  const centerLatitude = clamp(
    (toFiniteNumber(bounds.north, 0) + toFiniteNumber(bounds.south, 0)) / 2,
    -85,
    85
  );

  return getDistanceMeters(
    [centerLongitude, centerLatitude],
    [centerLongitude + longitudeDelta, centerLatitude]
  );
}

export function getScaleMetersPerPixel(
  context: ScaleDistanceContext,
  allowFallback: boolean
): number | null {
  const projectionBased = getProjectionMetersPerPixelAtCenter(
    context.projection,
    context.bounds,
    context.canvasSize
  );
  if (projectionBased !== null) {
    return projectionBased;
  }

  const projected = getProjectedMetersPerPixelAtCenter(context.map);
  if (projected !== null) {
    return projected;
  }

  const orthographicCoordinateDelta = getOrthographicCoordinateDeltaPerPixel(
    context.bounds,
    context.canvasSize
  );
  if (context.isProjectedCoordinates && orthographicCoordinateDelta !== null) {
    return orthographicCoordinateDelta;
  }

  const geographicBoundsMetersPerPixel =
    getGeographicBoundsMetersPerPixelAtCenter(
      context.bounds,
      context.canvasSize
    );
  if (geographicBoundsMetersPerPixel !== null) {
    return geographicBoundsMetersPerPixel;
  }

  if (!allowFallback) {
    return null;
  }

  return getFallbackMetersPerPixel(context.zoom, context.centerLatitude);
}

export function normalizeScaleDistanceValue(distance: number): number {
  if (!Number.isFinite(distance) || distance <= 0) {
    return 0;
  }

  const fractionDigits = getScaleDistanceFractionDigits(distance);
  return Number(distance.toFixed(fractionDigits));
}

export function formatScaleDistance(distance: number): string {
  const normalized = normalizeScaleDistanceValue(distance);
  return formatValue(normalized, {
    maxFractionDigits: getScaleDistanceFractionDigits(normalized),
    maxStringLength: 32,
    nullPlaceholder: '0'
  });
}

export function getScaleDistanceStep(distance: number): number {
  const candidate = normalizeScaleDistanceValue(distance);

  if (candidate > 0 && candidate < 1) {
    return 0.01;
  }

  if (candidate > 0 && candidate < 10) {
    return 0.1;
  }

  return 1;
}

export function getSuggestedScaleDistance(
  unit: DistanceUnit,
  context: ScaleDistanceContext = {}
): number {
  const metersPerPixel = getScaleMetersPerPixel(context, true);
  if (metersPerPixel === null) {
    return 1;
  }

  const rawDistance = fromDistanceMeters(
    SCALE_TARGET_WIDTH_PX * metersPerPixel,
    unit
  );
  return normalizeScaleDistanceValue(
    Math.max(0.1, toNiceDistanceAtLeast(rawDistance))
  );
}

export function getScaleDistanceLimit(
  unit: DistanceUnit,
  context: ScaleDistanceContext = {}
): number {
  const hardLimit = MAX_SCALE_DISTANCE_BY_UNIT[unit];
  const metersPerPixel = getScaleMetersPerPixel(context, false);
  if (metersPerPixel === null) {
    return hardLimit;
  }

  const rawDistance = fromDistanceMeters(
    SCALE_MAX_WIDTH_PX * metersPerPixel,
    unit
  );
  const renderLimit = normalizeScaleDistanceValue(
    Math.max(0.1, toNiceDistanceAtMost(rawDistance))
  );

  return Math.min(hardLimit, renderLimit);
}

export function clampScaleDistance(
  distance: number,
  unit: DistanceUnit,
  fallback: number,
  context: ScaleDistanceContext = {}
): number {
  const candidate = normalizeScaleDistanceValue(
    Number.isFinite(distance) ? distance : fallback
  );
  return Math.max(0, Math.min(getScaleDistanceLimit(unit, context), candidate));
}

export function toDistanceMeters(distance: number, unit: DistanceUnit): number {
  return unit === DistanceUnit.KILOMETERS
    ? distance * METERS_PER_KILOMETER
    : distance * METERS_PER_MILE;
}

export function fromDistanceMeters(
  distanceMeters: number,
  unit: DistanceUnit
): number {
  return unit === DistanceUnit.KILOMETERS
    ? distanceMeters / METERS_PER_KILOMETER
    : distanceMeters / METERS_PER_MILE;
}

export function convertDistanceValue(
  distance: number,
  fromUnit: DistanceUnit,
  toUnit: DistanceUnit
): number {
  if (!Number.isFinite(distance) || distance <= 0 || fromUnit === toUnit) {
    return distance;
  }

  return fromDistanceMeters(toDistanceMeters(distance, fromUnit), toUnit);
}

export function getNumericEventValue(event: Event, fallback: number): number {
  const customEvent = event as CustomEvent<unknown>;
  const detail = customEvent.detail;

  if (typeof detail === 'number' && Number.isFinite(detail)) {
    return detail;
  }

  if (typeof detail === 'string') {
    const parsed = Number(detail);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (detail && typeof detail === 'object' && 'value' in detail) {
    const rawValue = (detail as { value: unknown }).value;
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const targetValue = Number(
    (event.currentTarget as HTMLInputElement | null)?.value
  );
  if (Number.isFinite(targetValue)) {
    return targetValue;
  }

  return fallback;
}
