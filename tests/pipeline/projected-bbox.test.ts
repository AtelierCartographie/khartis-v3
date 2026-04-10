import { describe, expect, it } from 'vitest';
import { geoMercator, geoNaturalEarth1, geoPath } from 'd3-geo';
import { computeProjectedBboxForProjection } from '$lib/features/map/utils/geoarrow-stream-bridge';

const WORLD_BBOX: [number, number, number, number] = [-180, -90, 180, 90];
const WORLD_FEATURE = {
  type: 'Feature' as const,
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [WORLD_BBOX[0], WORLD_BBOX[1]],
        [WORLD_BBOX[2], WORLD_BBOX[1]],
        [WORLD_BBOX[2], WORLD_BBOX[3]],
        [WORLD_BBOX[0], WORLD_BBOX[3]],
        [WORLD_BBOX[0], WORLD_BBOX[1]]
      ]
    ]
  },
  properties: {}
};

function expectBoundsToMatchPathBounds(
  projection: ReturnType<typeof geoMercator>
): void {
  const result = computeProjectedBboxForProjection(projection, WORLD_BBOX);
  const [[expectedMinX, expectedMinY], [expectedMaxX, expectedMaxY]] =
    geoPath(projection).bounds(WORLD_FEATURE);

  expect(result).not.toBeNull();
  expect(result?.[0]).toBeCloseTo(expectedMinX, 6);
  expect(result?.[1]).toBeCloseTo(expectedMinY, 6);
  expect(result?.[2]).toBeCloseTo(expectedMaxX, 6);
  expect(result?.[3]).toBeCloseTo(expectedMaxY, 6);
}

describe('computeProjectedBboxForProjection', () => {
  it('uses clipped path bounds for a world bbox under Mercator', () => {
    const projection = geoMercator().fitExtent(
      [
        [0, 0],
        [960, 600]
      ],
      WORLD_FEATURE
    );

    expectBoundsToMatchPathBounds(projection);
  });

  it('stays aligned with path bounds for non-mercator projections', () => {
    const projection = geoNaturalEarth1().fitExtent(
      [
        [0, 0],
        [960, 600]
      ],
      WORLD_FEATURE
    );

    expectBoundsToMatchPathBounds(projection);
  });
});
