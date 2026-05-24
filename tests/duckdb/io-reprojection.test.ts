import { describe, expect, it } from 'vitest';
import {
  EPSG_DEFINITIONS,
  isProjectionSupported,
  reprojectPoint
} from '$lib/features/duckdb/io/reprojection';

describe('EPSG_DEFINITIONS', () => {
  it('includes EPSG:2154 (Lambert-93 — France)', () => {
    expect('EPSG:2154' in EPSG_DEFINITIONS).toBe(true);
  });

  it('includes EPSG:3035 (ETRS89-LAEA Europe)', () => {
    expect('EPSG:3035' in EPSG_DEFINITIONS).toBe(true);
  });

  it('includes explicit national EPSG codes from the projection CDC', () => {
    expect('EPSG:27700' in EPSG_DEFINITIONS).toBe(true);
    expect('EPSG:2157' in EPSG_DEFINITIONS).toBe(true);
    expect('EPSG:2056' in EPSG_DEFINITIONS).toBe(true);
  });

  it('includes EPSG:4326 (WGS84)', () => {
    const hasWgs84 = Object.keys(EPSG_DEFINITIONS).some((k) =>
      k.toUpperCase().includes('4326')
    );
    expect(hasWgs84).toBe(true);
  });
});

describe('isProjectionSupported', () => {
  it('returns true for EPSG:2154 (Lambert-93)', () => {
    expect(isProjectionSupported('EPSG:2154')).toBe(true);
  });

  it('returns true for EPSG:4326 (WGS84)', () => {
    expect(isProjectionSupported('EPSG:4326')).toBe(true);
  });

  it('returns true for EPSG:3035 (ETRS89-LAEA Europe)', () => {
    expect(isProjectionSupported('EPSG:3035')).toBe(true);
  });

  it('returns true for explicit national EPSG codes from the projection CDC', () => {
    expect(isProjectionSupported('EPSG:27700')).toBe(true);
    expect(isProjectionSupported('EPSG:2157')).toBe(true);
    expect(isProjectionSupported('EPSG:2056')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isProjectionSupported('epsg:2154')).toBe(true);
  });

  it('returns false for unsupported projection codes', () => {
    expect(isProjectionSupported('EPSG:99999')).toBe(false);
  });
});

describe('reprojectPoint — EPSG:2154 to WGS84', () => {
  it('reprojects a Lambert-93 coordinate near Paris to WGS84', () => {
    const result = reprojectPoint(652000, 6861000, 'EPSG:2154');
    expect(result.success).toBe(true);
    const [lon, lat] = result.coordinates!;
    expect(lon).toBeCloseTo(2.34, 1);
    expect(lat).toBeCloseTo(48.85, 1);
  });

  it('returns failure for an unsupported source CRS', () => {
    const result = reprojectPoint(0, 0, 'EPSG:99999');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
