import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mapInstanceStore: {
    map: null as unknown,
    isMapLoaded: false,
    projectDataToViewportPx: vi.fn<
      (x: number, y: number) => { x: number; y: number } | null
    >(() => null),
    unprojectViewportPxToData: vi.fn<
      (x: number, y: number) => { x: number; y: number } | null
    >(() => null)
  },
  projectionStore: {
    renderProjection: null as unknown,
    isProjectedCoordinates: false
  }
}));

vi.mock('$lib/features/commons/stores/map-instance.store.svelte', () => ({
  mapInstanceStore: mocks.mapInstanceStore
}));

vi.mock('../stores/projection.store.svelte', () => ({
  projectionStore: mocks.projectionStore
}));

import {
  ANNOTATION_ANCHOR_SPAN_PX,
  buildAnchorFromScreenPx,
  canAnchorToMap,
  dataToScreenPx,
  getAnchorScaleFactor,
  screenPxToData
} from './map-anchor-projection.utils';

function createMapLibreMock() {
  return {
    project: vi.fn((lngLat: [number, number]) => ({
      x: lngLat[0] * 10,
      y: lngLat[1] * 10
    })),
    unproject: vi.fn((point: [number, number]) => ({
      lng: point[0] / 10,
      lat: point[1] / 10
    }))
  };
}

/** A d3-like invertible projection (scales lon/lat by 2). */
function createInvertibleProjection() {
  const projection = ((coords: [number, number]) => [
    coords[0] * 2,
    coords[1] * 2
  ]) as unknown as Record<string, unknown> & {
    invert: (point: [number, number]) => [number, number];
  };
  projection.invert = (point: [number, number]) => [point[0] / 2, point[1] / 2];
  return projection;
}

/** A composite-like projection: callable but with no `invert`. */
function createCompositeProjection() {
  return ((coords: [number, number]) => [
    coords[0] + 1,
    coords[1] + 1
  ]) as unknown as object;
}

describe('map-anchor-projection helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mapInstanceStore.map = null;
    mocks.mapInstanceStore.isMapLoaded = false;
    mocks.mapInstanceStore.projectDataToViewportPx.mockReturnValue(null);
    mocks.mapInstanceStore.unprojectViewportPxToData.mockReturnValue(null);
    mocks.projectionStore.renderProjection = null;
    mocks.projectionStore.isProjectedCoordinates = false;
  });

  it('uses MapLibre project/unproject when a map is present', () => {
    const map = createMapLibreMock();
    mocks.mapInstanceStore.map = map;
    mocks.mapInstanceStore.isMapLoaded = true;

    expect(canAnchorToMap()).toBe(true);
    expect(dataToScreenPx({ lon: 4, lat: 5 })).toEqual({ x: 40, y: 50 });
    expect(map.project).toHaveBeenCalledWith([4, 5]);

    expect(screenPxToData(40, 50)).toEqual({ lon: 4, lat: 5 });
    expect(map.unproject).toHaveBeenCalledWith([40, 50]);
  });

  it('uses the deck store directly for a raw geographic reference', () => {
    mocks.mapInstanceStore.isMapLoaded = true;
    mocks.projectionStore.renderProjection = null;
    mocks.projectionStore.isProjectedCoordinates = false;
    mocks.mapInstanceStore.projectDataToViewportPx.mockReturnValue({
      x: 123,
      y: 45
    });
    mocks.mapInstanceStore.unprojectViewportPxToData.mockReturnValue({
      x: 2.5,
      y: 48.8
    });

    expect(canAnchorToMap()).toBe(true);
    expect(dataToScreenPx({ lon: 2.5, lat: 48.8 })).toEqual({ x: 123, y: 45 });
    expect(mocks.mapInstanceStore.projectDataToViewportPx).toHaveBeenCalledWith(
      2.5,
      48.8
    );

    expect(screenPxToData(123, 45)).toEqual({ lon: 2.5, lat: 48.8 });
  });

  it('applies the render projection and its invert when geometry is projected', () => {
    mocks.mapInstanceStore.isMapLoaded = true;
    mocks.projectionStore.renderProjection = createInvertibleProjection();
    mocks.projectionStore.isProjectedCoordinates = true;
    mocks.mapInstanceStore.projectDataToViewportPx.mockImplementation(
      (x, y) => ({ x: x + 1000, y: y + 2000 })
    );
    mocks.mapInstanceStore.unprojectViewportPxToData.mockReturnValue({
      x: 20,
      y: 10
    });

    expect(canAnchorToMap()).toBe(true);

    // lon/lat 10/5 → projected 20/10 → store px 1020/2010.
    expect(dataToScreenPx({ lon: 10, lat: 5 })).toEqual({ x: 1020, y: 2010 });
    expect(mocks.mapInstanceStore.projectDataToViewportPx).toHaveBeenCalledWith(
      20,
      10
    );

    // store data 20/10 → invert → lon/lat 10/5.
    expect(screenPxToData(1020, 2010)).toEqual({ lon: 10, lat: 5 });
  });

  it('refuses anchoring for a composite projection without invert', () => {
    mocks.mapInstanceStore.isMapLoaded = true;
    mocks.projectionStore.renderProjection = createCompositeProjection();
    mocks.projectionStore.isProjectedCoordinates = true;

    expect(canAnchorToMap()).toBe(false);
    expect(dataToScreenPx({ lon: 1, lat: 2 })).toBeNull();
    expect(screenPxToData(10, 20)).toBeNull();
  });

  it('writes a span point with the anchor and derives the map scale factor from it', () => {
    const map = createMapLibreMock();
    mocks.mapInstanceStore.map = map;
    mocks.mapInstanceStore.isMapLoaded = true;

    // project = ×10 → the span point 100px right of (40,50) inverts to lon 14.
    const anchor = buildAnchorFromScreenPx(40, 50);
    expect(anchor).toEqual({ lon: 4, lat: 5, spanLon: 14, spanLat: 5 });

    // Same zoom as written → factor 1.
    expect(getAnchorScaleFactor(anchor!)).toBe(1);

    // Map zoomed ×2 (project = ×20) → span distance 200px → factor 2.
    map.project.mockImplementation((lngLat: [number, number]) => ({
      x: lngLat[0] * 20,
      y: lngLat[1] * 20
    }));
    expect(getAnchorScaleFactor(anchor!)).toBe(2);
  });

  it('preserves the current scale factor when re-anchoring and falls back to 1 without a span', () => {
    const map = createMapLibreMock();
    mocks.mapInstanceStore.map = map;
    mocks.mapInstanceStore.isMapLoaded = true;

    // Re-anchor at factor 2: the span is written 2×SPAN px away, so the factor
    // read back at the same zoom is still 2 (no size snap).
    const reAnchored = buildAnchorFromScreenPx(0, 0, 2);
    expect(reAnchored).toEqual({
      lon: 0,
      lat: 0,
      spanLon: (ANNOTATION_ANCHOR_SPAN_PX * 2) / 10,
      spanLat: 0
    });
    expect(getAnchorScaleFactor(reAnchored!)).toBe(2);

    expect(getAnchorScaleFactor({ lon: 4, lat: 5 })).toBe(1);
  });

  it('rejects an anchor whose inversion does not project back to its screen position', () => {
    const map = createMapLibreMock();
    // Aliased inversion (e.g. outside the projected world outline): unproject
    // answers, but projecting that answer lands somewhere else.
    map.unproject.mockImplementation((point: [number, number]) => ({
      lng: point[0] / 10 + 50,
      lat: point[1] / 10
    }));
    mocks.mapInstanceStore.map = map;
    mocks.mapInstanceStore.isMapLoaded = true;

    expect(buildAnchorFromScreenPx(40, 50)).toBeNull();
  });

  it('refuses anchoring for a pre-projected CRS without a render projection', () => {
    mocks.mapInstanceStore.isMapLoaded = true;
    mocks.projectionStore.renderProjection = null;
    mocks.projectionStore.isProjectedCoordinates = true;

    expect(canAnchorToMap()).toBe(false);
    expect(dataToScreenPx({ lon: 1, lat: 2 })).toBeNull();
    expect(screenPxToData(10, 20)).toBeNull();
  });
});
