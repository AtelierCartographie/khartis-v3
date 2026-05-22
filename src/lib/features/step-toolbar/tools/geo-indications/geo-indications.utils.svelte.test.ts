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
