import { describe, expect, it } from 'vitest';
import { geoOrthographic } from 'd3-geo';
import { DistanceUnit } from '$lib/features/commons/constants/ui.constants';
import {
  getInsetMapBoundsAreaFraction,
  getInsetMapGeographicBounds,
  getScaleDistanceLimit,
  getScaleMetersPerPixel,
  getSuggestedScaleDistance,
  getVisibleSphereFraction,
  isInsetMapAvailableForViewport
} from './geo-indications.utils';

// A composite projection draws only inside each sub-projection's screen
// extent: `invert` answers null everywhere else, exactly like the France and
// Europe DOM-TOM presets.
function createCompositeProjection() {
  const MAINLAND_EXTENT: [[number, number], [number, number]] = [
    [-50, 410],
    [100, 515]
  ];

  const isInside = (
    [x, y]: [number, number],
    [[minX, minY], [maxX, maxY]]: [[number, number], [number, number]]
  ) => x >= minX && x <= maxX && y >= minY && y <= maxY;

  const composite = ((coordinates: [number, number]) => {
    const projected: [number, number] = [
      coordinates[0] * 10,
      coordinates[1] * 10
    ];
    return isInside(projected, MAINLAND_EXTENT) ? projected : null;
  }) as ((coordinates: [number, number]) => [number, number] | null) & {
    invert: (point: [number, number]) => [number, number] | null;
    getSubProjections: () => Array<{
      id: string;
      bounds: [number, number, number, number];
      screenExtent: [[number, number], [number, number]];
    }>;
  };

  composite.invert = (point) =>
    isInside(point, MAINLAND_EXTENT) ? [point[0] / 10, point[1] / 10] : null;
  composite.getSubProjections = () => [
    {
      id: 'mainland',
      bounds: [-5, 41, 10, 51.5],
      screenExtent: MAINLAND_EXTENT
    }
  ];

  return composite;
}

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

  it('frames a composite basemap on its mainland cell, not on the whole viewport', () => {
    // The page is wider than the cell the composite draws in, so every point
    // of the viewport rectangle sits outside every screen extent and inverts
    // to nothing. The framing has to come from the cell the reader sees.
    const bounds = getInsetMapGeographicBounds(
      { north: 900, south: -400, east: 800, west: -700 },
      {
        isProjectedCoordinates: true,
        projection: createCompositeProjection()
      }
    );

    expect(bounds).not.toBeNull();
    expect(bounds?.west).toBeCloseTo(-5, 6);
    expect(bounds?.east).toBeCloseTo(10, 6);
    expect(bounds?.south).toBeCloseTo(41, 6);
    expect(bounds?.north).toBeCloseTo(51.5, 6);
  });

  it('keeps the viewport framing when it is narrower than the mainland cell', () => {
    const bounds = getInsetMapGeographicBounds(
      { north: 500, south: 430, east: 60, west: -20 },
      {
        isProjectedCoordinates: true,
        projection: createCompositeProjection()
      }
    );

    expect(bounds?.west).toBeCloseTo(-2, 6);
    expect(bounds?.east).toBeCloseTo(6, 6);
    expect(bounds?.south).toBeCloseTo(43, 6);
    expect(bounds?.north).toBeCloseTo(50, 6);
  });

  it('reports no framing when the viewport left the mainland cell', () => {
    expect(
      getInsetMapGeographicBounds(
        { north: 900, south: 700, east: 800, west: 400 },
        {
          isProjectedCoordinates: true,
          projection: createCompositeProjection()
        }
      )
    ).toBeNull();
  });
});

describe('inset map availability', () => {
  it('measures the extent as a spherical area fraction', () => {
    expect(
      getInsetMapBoundsAreaFraction({
        north: 90,
        south: -90,
        east: 180,
        west: -180
      })
    ).toBeCloseTo(1, 6);

    expect(
      getInsetMapBoundsAreaFraction({
        north: 90,
        south: -90,
        east: 90,
        west: -90
      })
    ).toBeCloseTo(0.5, 6);

    // A polar band spans every longitude but only a sliver of the sphere.
    expect(
      getInsetMapBoundsAreaFraction({
        north: 90,
        south: 50,
        east: 180,
        west: -180
      })
    ).toBeCloseTo(0.117, 3);
  });

  it('spans the antimeridian instead of measuring the complement', () => {
    expect(
      getInsetMapBoundsAreaFraction({
        north: 10,
        south: -10,
        east: -170,
        west: 170
      })
    ).toBeCloseTo(
      getInsetMapBoundsAreaFraction({
        north: 10,
        south: -10,
        east: 20,
        west: 0
      }) as number,
      6
    );
  });

  it('rejects an extent larger than a hemisphere', () => {
    // 250° x 120° centred on the equator: 60% of the sphere, which an
    // orthographic projection cannot outline.
    expect(
      isInsetMapAvailableForViewport({
        north: 60,
        south: -60,
        east: 125,
        west: -125
      })
    ).toBe(false);

    expect(
      isInsetMapAvailableForViewport({
        north: 30,
        south: -30,
        east: 60,
        west: -60
      })
    ).toBe(true);
  });

  it('stays available while bounds are unknown', () => {
    expect(getInsetMapBoundsAreaFraction(null)).toBeNull();
    expect(isInsetMapAvailableForViewport(null)).toBe(true);
  });
});

describe('visible sphere fraction on a projected viewport', () => {
  const ORTHOGRAPHIC_SCALE = 200;
  const ORTHOGRAPHIC_CENTER = 400;

  function orthographic() {
    return geoOrthographic()
      .scale(ORTHOGRAPHIC_SCALE)
      .translate([ORTHOGRAPHIC_CENTER, ORTHOGRAPHIC_CENTER]);
  }

  function viewport(halfSize: number) {
    return {
      west: ORTHOGRAPHIC_CENTER - halfSize,
      east: ORTHOGRAPHIC_CENTER + halfSize,
      south: ORTHOGRAPHIC_CENTER - halfSize,
      north: ORTHOGRAPHIC_CENTER + halfSize
    };
  }

  it('measures a globe seen whole as exactly one hemisphere', () => {
    // The far side projects onto the near side; counting it would report a
    // full sphere and let the inset through on a world framing.
    expect(
      getVisibleSphereFraction(viewport(600), {
        isProjectedCoordinates: true,
        projection: orthographic()
      })
    ).toBeCloseTo(0.5, 2);
  });

  it('refuses the inset on a framing wider than the projected world', () => {
    expect(
      isInsetMapAvailableForViewport(viewport(600), {
        isProjectedCoordinates: true,
        projection: orthographic()
      })
    ).toBe(false);
  });

  it('shrinks monotonically as the viewport closes in', () => {
    const projection = orthographic();
    // 200 is the projection radius: anything wider still shows the full
    // hemisphere, so the shrinking sizes have to actually clip the disc.
    const fractions = [600, 150, 100, 50].map(
      (halfSize) =>
        getVisibleSphereFraction(viewport(halfSize), {
          isProjectedCoordinates: true,
          projection
        }) as number
    );

    for (let index = 1; index < fractions.length; index += 1) {
      expect(fractions[index]).toBeLessThan(fractions[index - 1]);
    }
    expect(
      isInsetMapAvailableForViewport(viewport(50), {
        isProjectedCoordinates: true,
        projection
      })
    ).toBe(true);
  });

  it('falls back to the lon/lat extent when coordinates are not projected', () => {
    expect(
      getVisibleSphereFraction(
        { north: 90, south: -90, east: 90, west: -90 },
        { isProjectedCoordinates: false, projection: orthographic() }
      )
    ).toBeCloseTo(0.5, 6);
  });
});
