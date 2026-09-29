import { describe, expect, it } from 'vitest';
import { geoEquirectangular } from 'd3-geo';
import {
  applyBasemapFrame,
  isFramedExtent,
  resolveUnprojectedFrameBbox
} from './basemap-frame.utils';

describe('basemap frame', () => {
  it('frames regional and multi-continent extents but not the world', () => {
    expect(isFramedExtent([-5, 41, 10, 51])).toBe(true);
    expect(isFramedExtent([-63, -21, 56, 71])).toBe(true);
    expect(isFramedExtent([-180, 41, 180, 82])).toBe(true);
    expect(isFramedExtent([-180, -60, 180, 84])).toBe(false);
  });

  it('clips the projection to its projected extent plus a 10% margin', () => {
    const projection = geoEquirectangular()
      .scale(180 / Math.PI)
      .translate([0, 0]);

    const frame = applyBasemapFrame(projection, [0, 0, 10, 20]);

    expect(frame?.[0][0]).toBeCloseTo(-1, 6);
    expect(frame?.[0][1]).toBeCloseTo(-22, 6);
    expect(frame?.[1][0]).toBeCloseTo(11, 6);
    expect(frame?.[1][1]).toBeCloseTo(2, 6);
    expect(projection.clipExtent()).toEqual(frame);
  });

  it('always frames an unprojected source CRS, and lon/lat only below world scale', () => {
    expect(
      resolveUnprojectedFrameBbox([0, 0, 1_000_000, 500_000], 'EPSG:2154')
    ).toEqual([-100_000, -50_000, 1_100_000, 550_000]);
    expect(resolveUnprojectedFrameBbox([0, 0, 10, 20], 'EPSG:4326')).toEqual([
      -1, -2, 11, 22
    ]);
    expect(
      resolveUnprojectedFrameBbox([-180, -90, 180, 90], 'EPSG:4326')
    ).toBeNull();
  });
});
