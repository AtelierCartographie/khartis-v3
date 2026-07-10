import type { ProjectionLike } from '@ateliercartographie/geoarrow-deck-stream';
import { mapInstanceStore } from '$lib/features/commons/stores/map-instance.store.svelte';
import { projectionStore } from '../stores/projection.store.svelte';
import type { AnnotationDataAnchor } from '$lib/features/step-toolbar/tools/annotations';

/**
 * Data-anchored annotation projection — bridges a WGS84 anchor `{lon,lat}` and
 * the on-screen position inside the map area (LOGICAL/unscaled pixels relative
 * to the map-area top-left) for BOTH render engines:
 *
 *  - MapLibre interleaved: `map.project` / `map.unproject` (the MapLibre canvas
 *    fills the map area, so its CSS pixels already are map-area-local logical
 *    px).
 *  - Deck orthographic: the d3 `renderProjection` (when the geometry is
 *    projected) composed with the store's OrthographicView pan/zoom math
 *    (`projectDataToViewportPx` / `unprojectViewportPxToData`). When the
 *    reference is raw geographic (lng/lat) the data space IS lon/lat, so no d3
 *    projection step is needed.
 *
 * Composite projections (e.g. FRANCE_DOM_TOM) expose no `invert`, so a screen
 * position cannot be turned back into a single lon/lat. For those, anchoring is
 * not offered (`canAnchorToMap` returns false) and callers keep the legacy
 * pixel-page behavior.
 */

type LngLatProjector = {
  project: (lngLat: [number, number]) => { x: number; y: number };
  unproject: (point: [number, number]) => { lng: number; lat: number };
};

type InvertibleProjection = ProjectionLike & {
  invert: (point: [number, number]) => [number, number] | null | undefined;
};

function getMapLibreProjector(): LngLatProjector | null {
  const map = mapInstanceStore.map;
  if (!map || !mapInstanceStore.isMapLoaded) {
    return null;
  }
  if (
    typeof map.project !== 'function' ||
    typeof map.unproject !== 'function'
  ) {
    return null;
  }
  return map as unknown as LngLatProjector;
}

function isInvertibleProjection(
  projection: ProjectionLike | null
): projection is InvertibleProjection {
  return (
    typeof projection === 'function' &&
    typeof (projection as { invert?: unknown }).invert === 'function'
  );
}

/**
 * Resolve how the orthographic engine maps lon/lat to the store's data space.
 * Returns `null` when the orthographic reference cannot round-trip lon/lat
 * (e.g. pre-projected dataset CRS without an invertible render projection).
 */
function resolveOrthographicProjection():
  | { mode: 'geographic' }
  | { mode: 'projected'; projection: InvertibleProjection }
  | null {
  const projection = projectionStore.renderProjection;
  if (projection) {
    return isInvertibleProjection(projection)
      ? { mode: 'projected', projection }
      : null;
  }

  // Raw geographic reference: data space already is lon/lat.
  return projectionStore.isProjectedCoordinates ? null : { mode: 'geographic' };
}

/**
 * Whether a data anchor can be projected/inverted for the active engine and
 * reference. When false, callers must keep the legacy pixel-page behavior.
 */
export function canAnchorToMap(): boolean {
  if (getMapLibreProjector()) {
    return true;
  }
  return resolveOrthographicProjection() !== null;
}

/**
 * Project a WGS84 anchor to map-area-local logical pixels, or `null` when the
 * active engine/reference cannot place it.
 */
export function dataToScreenPx(
  anchor: AnnotationDataAnchor
): { x: number; y: number } | null {
  if (!Number.isFinite(anchor.lon) || !Number.isFinite(anchor.lat)) {
    return null;
  }

  const maplibre = getMapLibreProjector();
  if (maplibre) {
    const point = maplibre.project([anchor.lon, anchor.lat]);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return null;
    }
    return { x: point.x, y: point.y };
  }

  const ortho = resolveOrthographicProjection();
  if (!ortho) {
    return null;
  }

  if (ortho.mode === 'geographic') {
    return mapInstanceStore.projectDataToViewportPx(anchor.lon, anchor.lat);
  }

  const projected = ortho.projection([anchor.lon, anchor.lat]);
  if (
    !projected ||
    !Number.isFinite(projected[0]) ||
    !Number.isFinite(projected[1])
  ) {
    return null;
  }
  return mapInstanceStore.projectDataToViewportPx(projected[0], projected[1]);
}

export const ANNOTATION_ANCHOR_SPAN_PX = 100;

const ANCHOR_ROUND_TRIP_EPSILON_PX = 1;

// Outside the projected world outline (e.g. the corners around an equal-earth
// ellipse) `invert` aliases the longitude instead of failing, so an anchor
// written there would render somewhere else entirely. Only accept points whose
// inversion projects back to where they came from.
function invertScreenPxIfRoundTrips(
  x: number,
  y: number
): AnnotationDataAnchor | null {
  const anchor = screenPxToData(x, y);
  if (!anchor) {
    return null;
  }
  const back = dataToScreenPx(anchor);
  if (
    !back ||
    Math.hypot(back.x - x, back.y - y) > ANCHOR_ROUND_TRIP_EPSILON_PX
  ) {
    return null;
  }
  return anchor;
}

/**
 * Build a data anchor for a map-area-local position, including the span point
 * that lets the renderer derive the map scale factor (see
 * `AnnotationDataAnchor`). `scaleFactor` is the annotation's CURRENT factor so
 * a re-anchor (drag, resize) preserves the rendered size instead of snapping
 * it back to factor 1. Returns `null` when the position does not invert
 * cleanly (outside the projected world), and falls back to a span-less anchor
 * (translate-only) when neither side offers a valid span point.
 */
export function buildAnchorFromScreenPx(
  x: number,
  y: number,
  scaleFactor = 1
): AnnotationDataAnchor | null {
  const anchor = invertScreenPxIfRoundTrips(x, y);
  if (!anchor) {
    return null;
  }

  const spanOffset = ANNOTATION_ANCHOR_SPAN_PX * Math.max(scaleFactor, 0.0001);
  const span =
    invertScreenPxIfRoundTrips(x + spanOffset, y) ??
    invertScreenPxIfRoundTrips(x - spanOffset, y);
  if (!span) {
    return anchor;
  }

  return { ...anchor, spanLon: span.lon, spanLat: span.lat };
}

/**
 * Map scale factor of an anchored annotation: the on-screen distance between
 * the anchor and its span point, relative to the span they were written with.
 * Returns 1 (translate-only) for span-less anchors or when either point cannot
 * be projected.
 */
export function getAnchorScaleFactor(anchor: AnnotationDataAnchor): number {
  if (
    !Number.isFinite(anchor.spanLon ?? NaN) ||
    !Number.isFinite(anchor.spanLat ?? NaN)
  ) {
    return 1;
  }

  const origin = dataToScreenPx(anchor);
  const span = dataToScreenPx({
    lon: anchor.spanLon as number,
    lat: anchor.spanLat as number
  });
  if (!origin || !span) {
    return 1;
  }

  const distance = Math.hypot(span.x - origin.x, span.y - origin.y);
  if (!Number.isFinite(distance) || distance <= 0) {
    return 1;
  }

  return distance / ANNOTATION_ANCHOR_SPAN_PX;
}

/**
 * Invert a map-area-local logical pixel position back to a WGS84 anchor, or
 * `null` when the active engine/reference cannot perform the inverse.
 */
export function screenPxToData(
  x: number,
  y: number
): AnnotationDataAnchor | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const maplibre = getMapLibreProjector();
  if (maplibre) {
    const lngLat = maplibre.unproject([x, y]);
    if (
      !lngLat ||
      !Number.isFinite(lngLat.lng) ||
      !Number.isFinite(lngLat.lat)
    ) {
      return null;
    }
    return { lon: lngLat.lng, lat: lngLat.lat };
  }

  const ortho = resolveOrthographicProjection();
  if (!ortho) {
    return null;
  }

  const data = mapInstanceStore.unprojectViewportPxToData(x, y);
  if (!data) {
    return null;
  }

  if (ortho.mode === 'geographic') {
    return { lon: data.x, lat: data.y };
  }

  const inverted = ortho.projection.invert([data.x, data.y]);
  if (
    !inverted ||
    !Number.isFinite(inverted[0]) ||
    !Number.isFinite(inverted[1])
  ) {
    return null;
  }
  return { lon: inverted[0], lat: inverted[1] };
}
