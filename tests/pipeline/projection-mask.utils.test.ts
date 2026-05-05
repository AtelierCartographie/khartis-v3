import * as d3geo from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { buildProjectionMaskPath } from '../../src/lib/features/map/utils/projection-mask.utils';
import { proj4d3 } from '../../src/lib/features/map/utils/proj4d3.utils';

describe('buildProjectionMaskPath', () => {
  it('builds the projected sphere path for d3 projections', () => {
    const projection = d3geo.geoNaturalEarth1().fitExtent(
      [
        [20, 20],
        [780, 580]
      ],
      { type: 'Sphere' }
    );

    const result = buildProjectionMaskPath({
      projection,
      width: 800,
      height: 600
    });

    expect(result).toMatch(/^M/);
    expect(result).not.toContain('H800V600H0Z');
    expect(result).not.toContain('NaN');
    expect(result).not.toContain('Infinity');

    const [[minX, minY], [maxX, maxY]] = d3geo.geoPath(projection).bounds({
      type: 'Sphere'
    });
    expect(maxX - minX).toBeGreaterThan(0);
    expect(maxY - minY).toBeGreaterThan(0);
  });

  it('returns null when no projection is available', () => {
    expect(
      buildProjectionMaskPath({
        projection: undefined,
        width: 800,
        height: 600
      })
    ).toBeNull();
  });

  it('returns null for projection-like objects without d3 stream support', () => {
    const projection = (([x, y]: [number, number]) => [x, y]) as unknown;

    expect(
      buildProjectionMaskPath({
        projection: projection as never,
        width: 800,
        height: 600
      })
    ).toBeNull();
  });

  it('returns null when the projected sphere contains non-finite coordinates', () => {
    const projection = proj4d3(
      '+proj=ortho +lon_0=-3.63 +lat_0=24.87 +ellps=WGS84 +datum=WGS84 +units=m +no_defs'
    ).fitExtent(
      [
        [20, 20],
        [780, 580]
      ],
      {
        type: 'MultiPoint',
        coordinates: [
          [-63.09, -21.39],
          [55.84, 71.12],
          [-63.09, 71.12],
          [55.84, -21.39]
        ]
      }
    );

    expect(
      buildProjectionMaskPath({
        projection,
        width: 800,
        height: 600
      })
    ).toBeNull();
  });
});
