import { describe, expect, it } from 'vitest';
import { geoConicConformal, geoMercator } from 'd3-geo';
import {
  getNorthBearingAtCenter,
  type ScaleDistanceContext
} from '$lib/features/step-toolbar/tools/geo-indications/geo-indications.utils';

// Build deck-engine bounds whose center, once inverted by the projection,
// lands on the requested geographic point — this is how the overlay reads the
// north direction "at the center of the current framing".
function boundsAroundProjectedCenter(
  projection: (point: [number, number]) => [number, number] | null,
  center: [number, number]
): ScaleDistanceContext['bounds'] {
  const projected = projection(center);
  if (!projected) {
    throw new Error('projection returned null for test center');
  }
  const [x, y] = projected;
  return { north: y - 1, south: y + 1, east: x + 1, west: x - 1 };
}

describe('getNorthBearingAtCenter', () => {
  it('returns ~0° for a north-up projection (Mercator) at center', () => {
    const projection = geoMercator();
    const bearing = getNorthBearingAtCenter({
      projection,
      bounds: boundsAroundProjectedCenter(projection, [10, 45])
    });

    expect(bearing).not.toBeNull();
    expect(Math.abs(bearing as number)).toBeLessThan(0.5);
  });

  it('is non-zero and antisymmetric off the central meridian (conic conformal)', () => {
    const projection = geoConicConformal().rotate([0, 0]).parallels([20, 60]);

    const bearingEast = getNorthBearingAtCenter({
      projection,
      bounds: boundsAroundProjectedCenter(projection, [20, 40])
    });
    const bearingWest = getNorthBearingAtCenter({
      projection,
      bounds: boundsAroundProjectedCenter(projection, [-20, 40])
    });

    expect(bearingEast).not.toBeNull();
    expect(bearingWest).not.toBeNull();

    // Meridian convergence tilts north away from screen-up off the central
    // meridian; the tilt is mirrored on either side.
    expect(Math.abs(bearingEast as number)).toBeGreaterThan(1);
    expect(Math.sign(bearingEast as number)).toBe(
      -Math.sign(bearingWest as number)
    );
    expect(
      Math.abs(
        Math.abs(bearingEast as number) - Math.abs(bearingWest as number)
      )
    ).toBeLessThan(0.5);
  });

  it('returns null in MapLibre mode (bearing locked, north vertical at center)', () => {
    const map = {
      getCenter: () => ({ lng: 2, lat: 48 }),
      project: ([lng, lat]: [number, number]) => ({ x: lng, y: -lat })
    };

    // A present map signals the MapLibre engine: north is always vertical at
    // the view center, so the caller keeps the indicator upright (0°).
    expect(getNorthBearingAtCenter({ map })).toBeNull();
  });

  it('returns null when neither a projection nor a map can resolve the center', () => {
    expect(getNorthBearingAtCenter({})).toBeNull();
    expect(getNorthBearingAtCenter({ projection: geoMercator() })).toBeNull();
    expect(
      getNorthBearingAtCenter({
        bounds: { north: 1, south: -1, east: 1, west: -1 }
      })
    ).toBeNull();
  });
});
