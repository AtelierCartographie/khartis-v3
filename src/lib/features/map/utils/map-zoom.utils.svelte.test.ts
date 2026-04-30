import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_BASE_ZOOM,
  MAX_MAP_ZOOM_PERCENT,
  MIN_MAP_ZOOM_PERCENT,
  ORTHOGRAPHIC_MAP_BASE_ZOOM,
  clampMapZoomPercent,
  resolveMapZoomBounds,
  resolveMapZoomLevel,
  resolveMapZoomPercent,
  resolveOrthographicZoomBounds,
  resolveOrthographicZoomLevel,
  resolveOrthographicZoomPercent
} from './map-zoom.utils';

describe('map zoom utils', () => {
  it('maps 100% to the base zoom level', () => {
    expect(resolveMapZoomLevel(DEFAULT_MAP_BASE_ZOOM, 100)).toBe(
      DEFAULT_MAP_BASE_ZOOM
    );
  });

  it('maps 2000% to the expected MapLibre zoom delta', () => {
    expect(resolveMapZoomLevel(DEFAULT_MAP_BASE_ZOOM, 2000)).toBeCloseTo(
      DEFAULT_MAP_BASE_ZOOM + 2 * Math.log2(20),
      10
    );
  });

  it('round-trips percent values through zoom conversion', () => {
    const zoomLevel = resolveMapZoomLevel(4.8, 275);

    expect(resolveMapZoomPercent(4.8, zoomLevel)).toBeCloseTo(275, 10);
  });

  it('maps orthographic 100% to neutral Deck zoom', () => {
    expect(resolveOrthographicZoomLevel(100)).toBe(ORTHOGRAPHIC_MAP_BASE_ZOOM);
    expect(resolveOrthographicZoomPercent(ORTHOGRAPHIC_MAP_BASE_ZOOM)).toBe(
      100
    );
  });

  it('derives relative min/max zoom bounds from the base zoom', () => {
    const bounds = resolveMapZoomBounds(4.8);

    expect(bounds.minZoom).toBeCloseTo(resolveMapZoomLevel(4.8, 10), 10);
    expect(bounds.maxZoom).toBeCloseTo(resolveMapZoomLevel(4.8, 2000), 10);
  });

  it('derives orthographic min/max zoom bounds without the MapLibre floor', () => {
    const bounds = resolveOrthographicZoomBounds();

    expect(bounds.minZoom).toBeCloseTo(resolveOrthographicZoomLevel(10), 10);
    expect(bounds.maxZoom).toBeCloseTo(resolveOrthographicZoomLevel(2000), 10);
  });

  it('clamps non-finite or out-of-range percents to the supported UI range', () => {
    expect(clampMapZoomPercent(Number.NaN)).toBe(100);
    expect(clampMapZoomPercent(-1)).toBe(MIN_MAP_ZOOM_PERCENT);
    expect(clampMapZoomPercent(9999)).toBe(MAX_MAP_ZOOM_PERCENT);
  });
});
