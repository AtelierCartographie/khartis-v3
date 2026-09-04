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
const INSET_PROJECTED_BOUNDS_EDGE_SEGMENTS = 16;
const SPHERE_SAMPLE_COUNT = 1500;
const GOLDEN_ANGLE_RADIANS = Math.PI * (3 - Math.sqrt(5));
const ROUND_TRIP_TOLERANCE_RADIANS = 1e-4;

export type ScaleDistanceMapLike = {
  getCenter: () => { lng: number; lat: number };
  project: (lngLat: [number, number]) => { x: number; y: number };
};

type ScaleDistanceProjectionLike = {
  invert: (point: [number, number]) => [number, number] | null | undefined;
};

type PlanarProjectionLike = ((
  point: [number, number]
) => [number, number] | null | undefined) & {
  invert?: (point: [number, number]) => [number, number] | null | undefined;
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

export type InsetMapBoundsProjectionContext = {
  isProjectedCoordinates?: boolean;
  projection?: unknown;
};

export const MAX_SCALE_DISTANCE_BY_UNIT: Record<DistanceUnit, number> = {
  [DistanceUnit.KILOMETERS]: Math.round(EARTH_CIRCUMFERENCE_KILOMETERS),
  [DistanceUnit.MILES]: Math.round(EARTH_CIRCUMFERENCE_KILOMETERS / 1.609344)
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return fallback;
}

/**
 * Fraction of the sphere covered by the extent. An orthographic projection can
 * never outline more than a hemisphere, so this has to be the true spherical
 * area — a lat/lon rectangle ratio lets extents well past 0.5 through.
 */
export function getInsetMapBoundsAreaFraction(
  bounds: InsetMapBounds | null | undefined
): number | null {
  if (!bounds) {
    return null;
  }

  const north = clamp(toFiniteNumber(bounds.north, 90), -90, 90);
  const south = clamp(toFiniteNumber(bounds.south, -90), -90, 90);
  if (north <= south) {
    return 0;
  }

  const rawLongitudeSpan =
    toFiniteNumber(bounds.east, 180) - toFiniteNumber(bounds.west, -180);
  const longitudeSpan = clamp(
    rawLongitudeSpan <= 0 ? rawLongitudeSpan + 360 : rawLongitudeSpan,
    0,
    360
  );

  const latitudeExtent =
    Math.sin(toRadians(north)) - Math.sin(toRadians(south));

  return (toRadians(longitudeSpan) * latitudeExtent) / (4 * Math.PI);
}

/**
 * Fraction of the sphere the viewport actually shows.
 *
 * Inverting the viewport corners is unusable here: outside a projection's
 * domain `invert` returns clamped nonsense rather than nothing, so a framing
 * that contains the whole world measures as a small window. Counting
 * equal-area globe samples that project inside the viewport only needs the
 * forward projection, which every projection has.
 */
export function getVisibleSphereFraction(
  bounds: InsetMapBounds | null | undefined,
  context: InsetMapBoundsProjectionContext = {}
): number | null {
  if (!bounds) {
    return null;
  }

  const projection = context.projection;
  if (!context.isProjectedCoordinates || !isPlanarProjection(projection)) {
    return getInsetMapBoundsAreaFraction(bounds);
  }

  const west = Math.min(bounds.west, bounds.east);
  const east = Math.max(bounds.west, bounds.east);
  const south = Math.min(bounds.south, bounds.north);
  const north = Math.max(bounds.south, bounds.north);
  const invert =
    typeof projection.invert === 'function' ? projection.invert : null;

  let visibleCount = 0;
  for (const sample of getSphereSamples()) {
    const projected = projection(sample);
    if (!isFinitePoint(projected)) continue;
    if (projected[0] < west || projected[0] > east) continue;
    if (projected[1] < south || projected[1] > north) continue;

    // On a globe the far side projects onto the near side; only the round trip
    // tells a visible sample from the back-facing one hiding behind it.
    if (invert) {
      const roundTrip = invert(projected);
      if (!isFinitePoint(roundTrip)) continue;
      if (geoDistance(sample, roundTrip) > ROUND_TRIP_TOLERANCE_RADIANS) {
        continue;
      }
    }

    visibleCount += 1;
  }

  return visibleCount / SPHERE_SAMPLE_COUNT;
}

export function isInsetMapAvailableForViewport(
  bounds: InsetMapBounds | null | undefined,
  context: InsetMapBoundsProjectionContext = {}
): boolean {
  const areaFraction = getVisibleSphereFraction(bounds, context);
  return areaFraction === null || areaFraction < INSET_MAP_MAX_AREA_FRACTION;
}

function normalizeLongitude(longitude: number): number {
  const normalized = ((((longitude + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 && longitude > 0 ? 180 : normalized;
}

/** Open ring, walked corner to corner, so the samples stay traceable. */
function sampleProjectedBoundsRing(bounds: InsetMapBounds): [number, number][] {
  const corners: [number, number][] = [
    [bounds.west, bounds.north],
    [bounds.east, bounds.north],
    [bounds.east, bounds.south],
    [bounds.west, bounds.south]
  ];

  const ring: [number, number][] = [];
  for (let corner = 0; corner < corners.length; corner++) {
    const [fromX, fromY] = corners[corner];
    const [toX, toY] = corners[(corner + 1) % corners.length];

    for (let step = 0; step < INSET_PROJECTED_BOUNDS_EDGE_SEGMENTS; step++) {
      const ratio = step / INSET_PROJECTED_BOUNDS_EDGE_SEGMENTS;
      ring.push([fromX + (toX - fromX) * ratio, fromY + (toY - fromY) * ratio]);
    }
  }

  return ring;
}

function getMinimalLongitudeBounds(
  longitudes: number[]
): Pick<InsetMapBounds, 'east' | 'west'> & { longitudeSpan: number } {
  const sortedLongitudes = [...longitudes].sort((a, b) => a - b);
  let largestGap = -Infinity;
  let intervalStartIndex = 0;

  for (let index = 0; index < sortedLongitudes.length; index++) {
    const current = sortedLongitudes[index];
    const next =
      index === sortedLongitudes.length - 1
        ? sortedLongitudes[0] + 360
        : sortedLongitudes[index + 1];
    const gap = next - current;

    if (gap > largestGap) {
      largestGap = gap;
      intervalStartIndex = (index + 1) % sortedLongitudes.length;
    }
  }

  const west = sortedLongitudes[intervalStartIndex];
  const east =
    sortedLongitudes[
      (intervalStartIndex - 1 + sortedLongitudes.length) %
        sortedLongitudes.length
    ];

  return {
    east,
    west,
    longitudeSpan: Math.max(0, 360 - largestGap)
  };
}

function intersectRange(
  from: number,
  to: number,
  low: number,
  high: number
): [number, number] | null {
  const start = Math.max(Math.min(from, to), Math.min(low, high));
  const end = Math.min(Math.max(from, to), Math.max(low, high));
  if (end < start) {
    return null;
  }

  return from <= to ? [start, end] : [end, start];
}

/**
 * A composite projection draws only inside its sub-projections' screen
 * extents and `invert` answers nothing outside them, so a viewport wider than
 * the cell inverts to no point at all. What the reader frames is the viewport
 * cut down to the mainland cell — the anchor the scale bar already uses.
 */
function clipBoundsToProjectionFrame(
  bounds: InsetMapBounds,
  projection: unknown
): InsetMapBounds | null {
  const screenExtent = getCompositeMainland(projection)?.screenExtent;
  if (!isScreenExtent(screenExtent)) {
    return bounds;
  }

  const [[minX, minY], [maxX, maxY]] = screenExtent;
  const horizontal = intersectRange(bounds.west, bounds.east, minX, maxX);
  const vertical = intersectRange(bounds.north, bounds.south, minY, maxY);
  if (!horizontal || !vertical) {
    return null;
  }

  return {
    west: horizontal[0],
    east: horizontal[1],
    north: vertical[0],
    south: vertical[1]
  };
}

type ProjectedFrame = {
  geographicRing: [number, number][];
  isComplete: boolean;
};

function invertProjectedFrame(
  bounds: InsetMapBounds,
  projection: ScaleDistanceProjectionLike
): ProjectedFrame | null {
  const framedBounds = clipBoundsToProjectionFrame(bounds, projection);
  if (!framedBounds) {
    return null;
  }

  const samples = sampleProjectedBoundsRing(framedBounds);
  const geographicRing = samples
    .map((point) => projection.invert(point))
    .filter(isValidLongitudeLatitudePair);

  return {
    geographicRing,
    isComplete: geographicRing.length === samples.length
  };
}

/**
 * The frame the map draws, as a lon/lat ring. A projected frame is a curved
 * quadrilateral on the sphere, so a lat/lon rectangle always overstates it.
 * Returns nothing unless the whole ring inverts: half a ring would close
 * itself across the gap and outline a shape the map never framed.
 */
export function getInsetMapFrameOutline(
  bounds: InsetMapBounds | null | undefined,
  context: InsetMapBoundsProjectionContext = {}
): [number, number][] | null {
  if (!bounds) {
    return null;
  }

  const projection = context.projection;
  if (!context.isProjectedCoordinates || !hasProjectionInvert(projection)) {
    return null;
  }

  const frame = invertProjectedFrame(bounds, projection);
  return frame?.isComplete ? frame.geographicRing : null;
}

export function getInsetMapGeographicBounds(
  bounds: InsetMapBounds | null | undefined,
  context: InsetMapBoundsProjectionContext = {}
): InsetMapBounds | null {
  if (!bounds) {
    return null;
  }

  const projection = context.projection;
  if (!context.isProjectedCoordinates || !hasProjectionInvert(projection)) {
    return bounds;
  }

  const geographicPoints =
    invertProjectedFrame(bounds, projection)?.geographicRing ?? [];

  if (geographicPoints.length === 0) {
    return null;
  }

  const longitudeBounds = getMinimalLongitudeBounds(
    geographicPoints.map(([longitude]) => normalizeLongitude(longitude))
  );
  const latitudes = geographicPoints.map(([, latitude]) =>
    clamp(latitude, -90, 90)
  );
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);

  if (north < south) {
    return null;
  }

  return {
    north,
    south,
    east: longitudeBounds.east,
    west: longitudeBounds.west
  };
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

function isFinitePoint(candidate: unknown): candidate is [number, number] {
  return (
    Array.isArray(candidate) &&
    candidate.length >= 2 &&
    Number.isFinite(candidate[0]) &&
    Number.isFinite(candidate[1])
  );
}

function isValidLongitudeLatitudePair(
  candidate: unknown
): candidate is [number, number] {
  return isFinitePoint(candidate);
}

function isPlanarProjection(
  candidate: unknown
): candidate is PlanarProjectionLike {
  return typeof candidate === 'function';
}

function isScreenExtent(
  candidate: unknown
): candidate is CompositeScreenExtent {
  return (
    Array.isArray(candidate) &&
    candidate.length === 2 &&
    isFinitePoint(candidate[0]) &&
    isFinitePoint(candidate[1])
  );
}

let sphereSamples: [number, number][] | null = null;

/** Fibonacci lattice: every sample stands for the same spherical area. */
function getSphereSamples(): [number, number][] {
  sphereSamples ??= Array.from({ length: SPHERE_SAMPLE_COUNT }, (_, index) => {
    const z = 1 - (2 * index + 1) / SPHERE_SAMPLE_COUNT;
    return [
      normalizeLongitude((GOLDEN_ANGLE_RADIANS * index * 180) / Math.PI),
      (Math.asin(z) * 180) / Math.PI
    ] as [number, number];
  });

  return sphereSamples;
}

function hasProjectionInvert(
  candidate: unknown
): candidate is ScaleDistanceProjectionLike {
  if (!candidate) return false;
  // d3 / proj4d3 projections are callable function objects, not plain objects,
  // so `typeof === 'object'` would reject them. We need both branches.
  const candidateType = typeof candidate;
  if (candidateType !== 'object' && candidateType !== 'function') return false;
  return typeof (candidate as { invert?: unknown }).invert === 'function';
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

// The bounds *center* can briefly land outside ±180/±90 when the viewport
// overflows the data bbox at low zoom, so we use a generous buffer. Real
// projected CRS centers (Lambert93 ~700 000, Web Mercator ~7 000 000, …) sit
// orders of magnitude above this threshold.
const PROJECTED_CENTER_MIN_MAGNITUDE = 1000;

function boundsLookProjected(
  bounds: InsetMapBounds,
  isProjectedCoordinates: boolean
): boolean {
  if (isProjectedCoordinates) {
    return true;
  }
  const centerX =
    (toFiniteNumber(bounds.east, 0) + toFiniteNumber(bounds.west, 0)) / 2;
  const centerY =
    (toFiniteNumber(bounds.north, 0) + toFiniteNumber(bounds.south, 0)) / 2;
  return (
    Math.abs(centerX) > PROJECTED_CENTER_MIN_MAGNITUDE ||
    Math.abs(centerY) > PROJECTED_CENTER_MIN_MAGNITUDE
  );
}

function getBoundsMetersPerPixelAtCenter(
  bounds: InsetMapBounds | null | undefined,
  canvasSize: { width: number; height: number } | null | undefined,
  isProjectedCoordinates: boolean
): number | null {
  const coordinateDelta = getOrthographicCoordinateDeltaPerPixel(
    bounds,
    canvasSize
  );
  if (coordinateDelta === null || !bounds) {
    return null;
  }

  // Projected bounds with no d3 invert available: bounds are in the source CRS
  // unit (typically meters for Lambert93, Web Mercator, …) — the screen-space
  // delta is already a meter delta. The magnitude check catches imported files
  // whose CRS hint did not propagate as isProjectedCoordinates.
  if (boundsLookProjected(bounds, isProjectedCoordinates)) {
    return coordinateDelta;
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
    [centerLongitude + coordinateDelta, centerLatitude]
  );
}

type CompositeScreenExtent = [[number, number], [number, number]];

type CompositeSubProjectionLike = {
  id: string;
  bounds: [number, number, number, number];
  screenExtent?: CompositeScreenExtent;
};

const MAINLAND_SUB_PROJECTION_ID = 'mainland';

function getCompositeSubProjections(
  projection: unknown
): CompositeSubProjectionLike[] | null {
  if (!projection) return null;
  const type = typeof projection;
  if (type !== 'function' && type !== 'object') return null;
  const getter = (projection as { getSubProjections?: unknown })
    .getSubProjections;
  if (typeof getter !== 'function') return null;
  const entries = (getter as () => unknown).call(projection);
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return entries as CompositeSubProjectionLike[];
}

// Composite projections (France+DOM, Europe+overseas) clip the screen into
// separate sub-projections. Inverting the viewport center would route the
// scale to whichever inset the center happens to sit on. We instead always
// anchor on the mainland: forward-project two points 1° apart at the mainland
// center to get meters-per-d3-pixel there, then scale by the (uniform)
// d3-pixel-per-screen-pixel ratio.
function getCompositeMainland(
  projection: unknown
): CompositeSubProjectionLike | null {
  const entries = getCompositeSubProjections(projection);
  if (!entries) {
    return null;
  }

  return (
    entries.find((entry) => entry.id === MAINLAND_SUB_PROJECTION_ID) ??
    entries[0]
  );
}

function getCompositeMainlandMetersPerPixel(
  projection: unknown,
  screenToDataScale: number
): number | null {
  const mainland = getCompositeMainland(projection);
  if (!mainland || typeof projection !== 'function') {
    return null;
  }

  const bounds = mainland.bounds;
  if (!Array.isArray(bounds) || bounds.length < 4) {
    return null;
  }

  const [west, south, east, north] = bounds;
  const centerLongitude = (west + east) / 2;
  const centerLatitude = (south + north) / 2;
  const sampleOffsetDegrees = Math.max(0.01, Math.abs(east - west) / 100);
  const start: [number, number] = [centerLongitude, centerLatitude];
  const end: [number, number] = [
    centerLongitude + sampleOffsetDegrees,
    centerLatitude
  ];

  const forward = projection as (
    coordinates: [number, number]
  ) => [number, number] | null;
  const projectedStart = forward(start);
  const projectedEnd = forward(end);
  if (
    !isValidLongitudeLatitudePair(projectedStart) ||
    !isValidLongitudeLatitudePair(projectedEnd)
  ) {
    return null;
  }

  const d3PixelDelta = Math.hypot(
    projectedEnd[0] - projectedStart[0],
    projectedEnd[1] - projectedStart[1]
  );
  if (!Number.isFinite(d3PixelDelta) || d3PixelDelta <= 0) {
    return null;
  }

  const realMeters = getDistanceMeters(start, end);
  if (realMeters === null) {
    return null;
  }

  return (realMeters / d3PixelDelta) * screenToDataScale;
}

export function getScaleMetersPerPixel(
  context: ScaleDistanceContext,
  allowFallback: boolean
): number | null {
  // 1. Composite projection: anchor on the mainland regardless of where the
  //    viewport center sits (it may land on an inset). Uses the bounds-derived
  //    d3-pixel-per-screen-pixel ratio.
  const coordinateDelta = getOrthographicCoordinateDeltaPerPixel(
    context.bounds,
    context.canvasSize
  );
  if (coordinateDelta !== null) {
    const composite = getCompositeMainlandMetersPerPixel(
      context.projection,
      coordinateDelta
    );
    if (composite !== null) {
      return composite;
    }
  }

  // 2. Active d3 projection — invert the bounds center (and one pixel east)
  //    back to lng/lat and measure geodesically.
  const fromProjection = getProjectionMetersPerPixelAtCenter(
    context.projection,
    context.bounds,
    context.canvasSize
  );
  if (fromProjection !== null) {
    return fromProjection;
  }

  // 3. MapLibre instance (tiled basemap with built-in projection).
  const fromMap = getProjectedMetersPerPixelAtCenter(context.map);
  if (fromMap !== null) {
    return fromMap;
  }

  // 4. Bounds-only: projected source CRS meters (Lambert93, …) or raw degrees.
  const fromBounds = getBoundsMetersPerPixelAtCenter(
    context.bounds,
    context.canvasSize,
    context.isProjectedCoordinates ?? false
  );
  if (fromBounds !== null) {
    return fromBounds;
  }

  if (!allowFallback) {
    return null;
  }

  return getFallbackMetersPerPixel(context.zoom, context.centerLatitude);
}

// Degrees of latitude sampled toward the pole to read the local north
// direction. Small enough to stay a local tangent, large enough to dodge
// floating-point noise in the projection.
const NORTH_SAMPLE_OFFSET_DEGREES = 0.5;

function isCallableProjection(
  candidate: unknown
): candidate is (point: [number, number]) => unknown {
  return typeof candidate === 'function';
}

function forwardProject(
  projection: unknown,
  coordinates: [number, number]
): [number, number] | null {
  if (!isCallableProjection(projection)) {
    return null;
  }
  const projected = projection(coordinates);
  return isValidLongitudeLatitudePair(projected) ? projected : null;
}

// Screen Y points down (SVG / d3 output convention), so a vector pointing
// "up" is (0, -1). The clockwise SVG rotation that turns up onto (dx, dy) is
// atan2(dx, -dy): north straight up (dx = 0, dy < 0) yields 0°.
function screenDeltaToBearingDegrees(dx: number, dy: number): number | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return null;
  }
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    return null;
  }
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

// Near the north pole we sample southward instead and flip the vector, so the
// returned direction is always "toward the north".
function getNorthwardSample(latitude: number): {
  latitude: number;
  flip: boolean;
} {
  if (latitude + NORTH_SAMPLE_OFFSET_DEGREES > 90) {
    return { latitude: latitude - NORTH_SAMPLE_OFFSET_DEGREES, flip: true };
  }
  return { latitude: latitude + NORTH_SAMPLE_OFFSET_DEGREES, flip: false };
}

function getProjectionNorthBearing(
  projection: unknown,
  bounds: InsetMapBounds | null | undefined
): number | null {
  if (!hasProjectionInvert(projection) || !bounds) {
    return null;
  }

  const centerX =
    (toFiniteNumber(bounds.east, 0) + toFiniteNumber(bounds.west, 0)) / 2;
  const centerY =
    (toFiniteNumber(bounds.north, 0) + toFiniteNumber(bounds.south, 0)) / 2;
  const center = projection.invert([centerX, centerY]);
  if (!isValidLongitudeLatitudePair(center)) {
    return null;
  }

  const [longitude, latitude] = center;
  const sample = getNorthwardSample(latitude);
  const origin = forwardProject(projection, [longitude, latitude]);
  const northward = forwardProject(projection, [longitude, sample.latitude]);
  if (origin === null || northward === null) {
    return null;
  }

  const dx = northward[0] - origin[0];
  const dy = northward[1] - origin[1];
  return screenDeltaToBearingDegrees(
    sample.flip ? -dx : dx,
    sample.flip ? -dy : dy
  );
}

// Rotation (degrees, clockwise) to apply to an upward-pointing north indicator
// so it points to geographic north at the center of the current framing —
// mirrors how the scale bar reads distance at the center. Returns null when it
// cannot be resolved (caller falls back to 0 = north up).
export function getNorthBearingAtCenter(
  context: ScaleDistanceContext
): number | null {
  // MapLibre engine: the map bearing is locked at 0 and the indicator is read
  // at the view center, so geographic north is always vertical there — no
  // rotation needed. (Revisit if a map-bearing/rotation control is ever added.)
  if (context.map) {
    return null;
  }

  // Deck orthographic engine: invert the bounds center back to lng/lat with the
  // active d3 projection, then read the local north direction.
  return getProjectionNorthBearing(context.projection, context.bounds);
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
): number | null {
  const metersPerPixel = getScaleMetersPerPixel(context, true);
  if (metersPerPixel === null) {
    return null;
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
