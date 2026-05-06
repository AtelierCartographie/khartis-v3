import { describe, expect, it } from 'vitest';
import {
  isWgs84LikeCrs,
  normalizeBoundsForProjectionSuggestion
} from '$lib/features/map/utils/dataset-crs.utils';

describe('normalizeBoundsForProjectionSuggestion', () => {
  it('recognizes CRS84 GeoJSON metadata as WGS84-like', () => {
    expect(isWgs84LikeCrs('urn:ogc:def:crs:OGC:1.3:CRS84')).toBe(true);
    expect(isWgs84LikeCrs('OGC:CRS84')).toBe(true);
  });

  it('keeps WGS84 bounds unchanged', () => {
    expect(
      normalizeBoundsForProjectionSuggestion([2, 48, 3, 49], 'EPSG:4326')
    ).toEqual([2, 48, 3, 49]);
  });

  it('reprojects Lambert-93 bounds to WGS84 for projection suggestions', () => {
    const result = normalizeBoundsForProjectionSuggestion(
      [652000, 6861000, 652000, 6861000],
      'EPSG:2154'
    );

    expect(result).not.toBeNull();
    expect(result?.[0]).toBeCloseTo(2.34, 1);
    expect(result?.[1]).toBeCloseTo(48.85, 1);
    expect(result?.[2]).toBeCloseTo(2.34, 1);
    expect(result?.[3]).toBeCloseTo(48.85, 1);
  });

  it('supports ETRS89-LAEA Europe bounds', () => {
    const result = normalizeBoundsForProjectionSuggestion(
      [4321000, 3210000, 4321000, 3210000],
      'EPSG:3035'
    );

    expect(result).not.toBeNull();
    expect(result?.[0]).toBeCloseTo(10, 1);
    expect(result?.[1]).toBeCloseTo(52, 1);
  });

  it('returns null when the CRS cannot be reprojected', () => {
    expect(
      normalizeBoundsForProjectionSuggestion([0, 0, 1, 1], 'EPSG:99999')
    ).toBeNull();
  });
});
