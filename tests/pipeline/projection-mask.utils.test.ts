import * as d3geo from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { buildProjectionMaskPath } from '../../src/lib/features/map/utils/projection-mask.utils';

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
});
