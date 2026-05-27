import { describe, expect, it } from 'vitest';
import { DistanceUnit } from '$lib/features/commons/constants/ui.constants';
import {
  getInsetMapGeographicBounds,
  getScaleDistanceLimit,
  getScaleMetersPerPixel,
  getSuggestedScaleDistance
} from './geo-indications.utils';

describe('geo indications scale utilities', () => {
  it('uses the 1/2/4/5/10 nice-distance sequence for projected coordinates', () => {
    const context = {
      bounds: {
        north: 40000,
        south: 0,
        east: 40000,
        west: 0
      },
      canvasSize: { width: 100, height: 100 },
      isProjectedCoordinates: true
    };

    expect(getScaleMetersPerPixel(context, false)).toBe(400);
    expect(getSuggestedScaleDistance(DistanceUnit.KILOMETERS, context)).toBe(
      40
    );
    expect(getScaleDistanceLimit(DistanceUnit.KILOMETERS, context)).toBe(40);
  });

  it('measures a projected render context through the active projection invert function', () => {
    const degreesPerPixelAtEquator = 0.0035932611364780853;
    const metersPerPixel = getScaleMetersPerPixel(
      {
        bounds: {
          north: 100,
          south: 0,
          east: 100,
          west: 0
        },
        canvasSize: { width: 100, height: 100 },
        projection: {
          invert: ([x]: [number, number]) => [x * degreesPerPixelAtEquator, 0]
        }
      },
      false
    );

    expect(metersPerPixel).toBeCloseTo(400, 0);
  });

  it('prioritizes the active render projection over a stale map instance', () => {
    const degreesPerPixelAtEquator = 0.0035932611364780853;
    const metersPerPixel = getScaleMetersPerPixel(
      {
        map: {
          getCenter: () => ({ lng: 0, lat: 0 }),
          project: ([lng]: [number, number]) => ({ x: lng * 100000, y: 0 })
        },
        bounds: {
          north: 100,
          south: 0,
          east: 100,
          west: 0
        },
        canvasSize: { width: 100, height: 100 },
        projection: {
          invert: ([x]: [number, number]) => [x * degreesPerPixelAtEquator, 0]
        }
      },
      false
    );

    expect(metersPerPixel).toBeCloseTo(400, 0);
  });

  it('recognizes invert on a callable d3-style projection (function, not object)', () => {
    // A real d3/proj4d3 projection is a callable function carrying an invert
    // method — `typeof === 'function'`, not 'object'. The metres-per-pixel
    // path must still recognize its invert.
    const degreesPerPixel = 0.0035932611364780853;
    const projection = ((coords: [number, number]) => coords) as ((
      coords: [number, number]
    ) => [number, number]) & {
      invert: (point: [number, number]) => [number, number];
    };
    projection.invert = ([x]: [number, number]) => [x * degreesPerPixel, 0];

    const metersPerPixel = getScaleMetersPerPixel(
      {
        bounds: { north: 100, south: 0, east: 100, west: 0 },
        canvasSize: { width: 100, height: 100 },
        isProjectedCoordinates: true,
        projection
      },
      false
    );

    expect(metersPerPixel).toBeCloseTo(400, 0);
  });

  it('anchors the scale on the mainland for composite projections', () => {
    // Composite forward: mainland (lng < 40) projects at 10 d3-px/deg, an
    // overseas inset (lng > 40) projects at a different, irrelevant scale.
    const composite = ((coords: [number, number]) => {
      const [lng, lat] = coords;
      if (lng > 40) {
        return [1000 + lng * 2, lat * 2];
      }
      return [lng * 10, lat * 10];
    }) as ((coords: [number, number]) => [number, number]) & {
      getSubProjections: () => Array<{
        id: string;
        bounds: [number, number, number, number];
      }>;
    };
    composite.getSubProjections = () => [
      { id: 'mainland', bounds: [-5, 41, 10, 51] },
      { id: 'overseas', bounds: [44, -13, 46, -11] }
    ];

    // coordinateDelta = (east - west) / canvasWidth = 1 d3-pixel per screen px.
    const metersPerPixel = getScaleMetersPerPixel(
      {
        bounds: { north: 100, south: 0, east: 100, west: 0 },
        canvasSize: { width: 100, height: 100 },
        isProjectedCoordinates: true,
        projection: composite
      },
      false
    );

    // Anchored on the mainland (center ~2.5°,46°), not the overseas inset:
    // metres for ~0.15° of longitude at 46°N ≈ a few thousand metres.
    expect(metersPerPixel).not.toBeNull();
    expect(metersPerPixel as number).toBeGreaterThan(5000);
    expect(metersPerPixel as number).toBeLessThan(12000);
  });

  it('converts projected inset bounds before area checks use them', () => {
    const bounds = getInsetMapGeographicBounds(
      {
        north: 60000,
        south: 0,
        east: 30000,
        west: -30000
      },
      {
        isProjectedCoordinates: true,
        projection: {
          invert: ([x, y]: [number, number]) => [x / 1000, y / 1000]
        }
      }
    );

    expect(bounds).toEqual({
      north: 60,
      south: 0,
      east: 30,
      west: -30
    });
  });
});
