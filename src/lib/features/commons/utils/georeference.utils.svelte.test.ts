import { describe, expect, it } from 'vitest';
import {
  fitAffineTransform,
  formatGdalAuxXml,
  formatWorldFile,
  type AffineTransform
} from './georeference.utils';

// Lambert-93 at 250 m per pixel, rotated by 10°.
const ANGLE = (10 * Math.PI) / 180;
const TRUTH: AffineTransform = {
  a: 250 * Math.cos(ANGLE),
  b: 250 * Math.sin(ANGLE),
  c: 99_000,
  d: 250 * Math.sin(ANGLE),
  e: -250 * Math.cos(ANGLE),
  f: 7_110_000
};

function samplesFrom(transform: AffineTransform) {
  const samples = [];
  for (let col = 0; col <= 800; col += 200) {
    for (let row = 0; row <= 600; row += 200) {
      samples.push({
        pixel: [col, row] as [number, number],
        crs: [
          transform.a * col + transform.b * row + transform.c,
          transform.d * col + transform.e * row + transform.f
        ] as [number, number]
      });
    }
  }
  return samples;
}

describe('fitAffineTransform', () => {
  it('should recover a rotated transform in metres exactly', () => {
    const fit = fitAffineTransform(samplesFrom(TRUTH));

    expect(fit?.maxResidualPx).toBeLessThan(1e-6);
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f'] as const) {
      expect(fit?.transform[key]).toBeCloseTo(TRUTH[key], 4);
    }
  });

  it('should report how far samples stray from an affine map', () => {
    const samples = samplesFrom(TRUTH);
    samples[3].crs[0] += 250 * 3;

    expect(fitAffineTransform(samples)?.maxResidualPx).toBeGreaterThan(1);
  });

  it('should refuse collinear samples', () => {
    expect(
      fitAffineTransform([
        { pixel: [0, 0], crs: [0, 0] },
        { pixel: [1, 1], crs: [1, 1] },
        { pixel: [2, 2], crs: [2, 2] }
      ])
    ).toBeNull();
  });
});

describe('georeference side-cars', () => {
  const NORTH_UP: AffineTransform = {
    a: 100,
    b: 0,
    c: 1000,
    d: 0,
    e: -100,
    f: 5000
  };

  it('should anchor the world file on the centre of the top-left pixel', () => {
    expect(formatWorldFile(NORTH_UP)).toBe('100\n0\n0\n-100\n1050\n4950\n');
  });

  it('should write the GDAL geotransform from the top-left corner', () => {
    expect(formatGdalAuxXml('EPSG:2154', NORTH_UP)).toContain(
      '<GeoTransform>1000, 100, 0, 5000, 0, -100</GeoTransform>'
    );
  });
});
